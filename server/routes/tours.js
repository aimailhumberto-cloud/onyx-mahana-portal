const express = require('express');
const router = express.Router();
const { success, error } = require('../middleware/response');
const { getDb, findAll, findById, create, update } = require('../db/database');
const { hashPassword, requireAuth, requireRole, isPartner } = require('../auth');
const { sanitize } = require('../utils/sanitize');
const { calcCxC } = require('../utils/finance');
const { upload } = require('../middleware/upload');
const notifications = require('../notifications');

// Helper: generate review code (short hash)
function generateReviewCode() {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36).slice(-3);
}

// Helpers for CSV export
function escapeCsvField(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function toCsvRow(fields) {
  return fields.map(escapeCsvField).join(',');
}

// PayPal access details
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '';
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || '';
const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox';
const PAYPAL_API = PAYPAL_MODE === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

async function getPayPalAccessToken() {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Failed to get PayPal access token');
  return data.access_token;
}

// ── TOURS ENDPOINTS ──

router.get('/api/v1/tours', requireAuth, (req, res) => {
  try {
    const { estatus, actividad, responsable, vendedor, fecha_desde, fecha_hasta, cliente, page = 1, limit = 50 } = req.query;
    const where = {};
    if (estatus) where.estatus = estatus;
    if (actividad) where.actividad = actividad;
    if (responsable) where.responsable_like = responsable;
    if (cliente) where.cliente_like = cliente;
    if (fecha_desde) where.fecha_gte = fecha_desde;
    if (fecha_hasta) where.fecha_lte = fecha_hasta;

    // Partner scoping: only see their own tours
    if (isPartner(req)) {
      where.vendedor = req.user.vendedor;
    } else if (vendedor) {
      where.vendedor_like = vendedor;
    }

    // Exclude soft-deleted tours from query (so meta.total is correct)
    where.eliminado = 0;

    const result = findAll('reservas_tours', { where, page: Number(page), limit: Number(limit), orderBy: 'fecha DESC, hora DESC' });

    // Strip internal financial data for partners (they see costo_pago + comision, not precio_ingreso/ganancia)
    if (isPartner(req)) {
      result.data = result.data.map(t => {
        const { precio_ingreso, ganancia_mahana, ...safe } = t;
        return safe;
      });
    }

    success(res, result.data, result.meta);
  } catch (err) {
    console.error('Error listing tours:', err);
    error(res, 'SERVER_ERROR', 'Error listing tours', 500);
  }
});

// Soft-deleted tours audit log (admin only)
router.get('/api/v1/tours/deleted', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const db = getDb();
    const deleted = db.prepare(`
      SELECT * FROM reservas_tours WHERE eliminado = 1 ORDER BY eliminado_at DESC LIMIT 100
    `).all();
    success(res, deleted);
  } catch (err) {
    console.error('Error fetching deleted tours:', err);
    error(res, 'SERVER_ERROR', 'Error fetching deleted tours', 500);
  }
});

router.get('/api/v1/tours/:id', requireAuth, (req, res) => {
  try {
    const tour = findById('reservas_tours', req.params.id);
    if (!tour) return error(res, 'NOT_FOUND', `Tour ${req.params.id} not found`, 404);

    // Partner scope: can only view own tours + strip financial fields
    if (isPartner(req)) {
      if (tour.vendedor !== req.user.vendedor) {
        return error(res, 'FORBIDDEN', 'No tienes acceso a este tour', 403);
      }
      const { precio_ingreso, ganancia_mahana, ...safe } = tour;
      return success(res, safe);
    }

    success(res, tour);
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error fetching tour', 500);
  }
});

// Soft delete tour (admin only)
router.delete('/api/v1/tours/:id', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const db = getDb();
    const tour = findById('reservas_tours', req.params.id);
    if (!tour) return error(res, 'NOT_FOUND', `Tour ${req.params.id} not found`, 404);
    if (tour.eliminado) return error(res, 'ALREADY_DELETED', 'Tour ya fue eliminado', 400);

    db.prepare(`
      UPDATE reservas_tours 
      SET eliminado = 1, eliminado_por = ?, eliminado_at = datetime('now')
      WHERE id = ?
    `).run(req.user.nombre || req.user.email, req.params.id);

    success(res, { id: tour.id, eliminado: true, eliminado_por: req.user.nombre, eliminado_at: new Date().toISOString() });

    // Notify about deletion
    setImmediate(async () => {
      try {
        await notifications.onTourStatusChanged(tour, tour.estatus, 'Eliminado');
      } catch (err) {
        console.error('🔔 Notification error (tour delete):', err.message);
      }
    });
  } catch (err) {
    console.error('Error deleting tour:', err);
    error(res, 'SERVER_ERROR', 'Error deleting tour', 500);
  }
});

router.post('/api/v1/tours', requireAuth, (req, res) => {
  try {
    const { cliente, actividad, fecha } = req.body;
    const missing = [];
    if (!cliente) missing.push('cliente');
    if (!actividad) missing.push('actividad');
    if (!fecha) missing.push('fecha');
    if (missing.length > 0) {
      return error(res, 'VALIDATION_ERROR', `Missing required fields: ${missing.join(', ')}`, 400, missing);
    }

    const data = {};
    const allowed = ['fecha', 'hora', 'cliente', 'whatsapp', 'estatus', 'vendedor', 'actividad',
      'responsable', 'precio_ingreso', 'costo_pago', 'comision_pct', 'monto_comision',
      'ganancia_mahana', 'notas', 'gestionado_por', 'fuente',
      'comprobante_url', 'email_cliente', 'hotel', 'nacionalidad', 'idioma', 'edades',
      'solicitado_por', 'pax'];

    for (const field of allowed) {
      if (req.body[field] !== undefined && req.body[field] !== null) {
        data[field] = typeof req.body[field] === 'string' ? sanitize(req.body[field]) : req.body[field];
      }
    }

    // Partner scoping: force their vendedor, source, and 'Por Aprobar' status
    if (isPartner(req)) {
      data.vendedor = req.user.vendedor;
      data.fuente = 'partner-portal';
      data.estatus = 'Por Aprobar';
      // Don't allow partners to set financial fields
      delete data.precio_ingreso;
      delete data.costo_pago;
      delete data.comision_pct;
      delete data.monto_comision;
      delete data.ganancia_mahana;
    }

    // Auto-calculate ganancia if not provided
    if (data.precio_ingreso !== undefined && data.ganancia_mahana === undefined) {
      const precio = data.precio_ingreso || 0;
      const costo = data.costo_pago || 0;
      const comPct = data.comision_pct || 0;
      data.ganancia_mahana = precio - costo - (precio * comPct / 100);
    }

    // Auto-calculate CxC if pricing is available
    if (data.precio_ingreso && data.vendedor) {
      Object.assign(data, calcCxC(data));
    }

    if (!data.fuente) data.fuente = 'api';

    // Try to decrement slot if slot_id provided
    if (req.body.slot_id) {
      const db = getDb();
      const slot = db.prepare('SELECT * FROM horarios_slots WHERE id = ? AND bloqueado = 0').get(req.body.slot_id);
      if (!slot) {
        return error(res, 'SLOT_NOT_FOUND', 'Horario no disponible', 400);
      }
      const pax = parseInt(req.body.pax) || 1;
      if (slot.reservados + pax > slot.capacidad) {
        return error(res, 'SLOT_FULL', `Solo quedan ${slot.capacidad - slot.reservados} cupos`, 400);
      }
      db.prepare('UPDATE horarios_slots SET reservados = reservados + ? WHERE id = ?').run(pax, slot.id);
      data.slot_id = slot.id; // persist slot reference for later release
    }

    const tour = create('reservas_tours', data);

    // Auto-create alert for partner submissions
    if (isPartner(req)) {
      try {
        const db = getDb();
        db.prepare(`INSERT INTO alertas (tipo, mensaje, referencia_tipo, referencia_id, datos_extra)
          VALUES (?, ?, ?, ?, ?)`).run(
          'tour_nuevo',
          `Nuevo tour solicitado por ${req.user.vendedor}: ${data.actividad} para ${data.cliente} el ${data.fecha}`,
          'tour',
          tour.id,
          JSON.stringify({ vendedor: req.user.vendedor, actividad: data.actividad, cliente: data.cliente, comprobante: data.comprobante_url || null })
        );
      } catch (alertErr) {
        console.error('Error creating alert:', alertErr);
      }
    }

    success(res, tour, null, 201);

    // Send notifications asynchronously (don't block response)
    setImmediate(async () => {
      try {
        const fullTour = { ...data, ...tour, email: data.email_cliente };
        await notifications.onTourCreated(fullTour);
      } catch (err) {
        console.error('🔔 Notification error (tour create):', err.message);
      }
    });
  } catch (err) {
    console.error('Error creating tour:', err);
    error(res, 'SERVER_ERROR', 'Error creating tour', 500);
  }
});

router.put('/api/v1/tours/:id', requireAuth, requireRole('admin', 'vendedor'), (req, res) => {
  try {
    const existing = findById('reservas_tours', req.params.id);
    if (!existing) return error(res, 'NOT_FOUND', `Tour ${req.params.id} not found`, 404);

    const data = {};
    const allowed = ['fecha', 'hora', 'cliente', 'whatsapp', 'estatus', 'vendedor', 'actividad',
      'responsable', 'precio_ingreso', 'costo_pago', 'comision_pct', 'monto_comision',
      'ganancia_mahana', 'notes', 'notas', 'gestionado_por',
      'comprobante_url', 'email_cliente', 'hotel', 'nacionalidad', 'idioma', 'edades',
      'solicitado_por', 'pax'];

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        data[field] = typeof req.body[field] === 'string' ? sanitize(req.body[field]) : req.body[field];
      }
    }

    // Recalculate CxC if pricing changed
    const merged = { ...existing, ...data };
    if (data.precio_ingreso !== undefined || data.comision_pct !== undefined || data.monto_comision !== undefined) {
      Object.assign(data, calcCxC(merged));
    }

    const updated = update('reservas_tours', req.params.id, data);
    success(res, updated);

    // Notify if status changed
    if (data.estatus && data.estatus !== existing.estatus) {
      setImmediate(async () => {
        try {
          const fullTour = { ...existing, ...updated, email: existing.email_cliente || updated.email_cliente };
          await notifications.onTourStatusChanged(fullTour, existing.estatus, data.estatus);
        } catch (err) {
          console.error('🔔 Notification error (tour PUT status):', err.message);
        }
      });
    }
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error updating tour', 500);
  }
});

router.patch('/api/v1/tours/:id/status', requireAuth, requireRole('admin', 'vendedor'), (req, res) => {
  try {
    const { estatus } = req.body;
    if (!estatus) return error(res, 'VALIDATION_ERROR', 'Field "estatus" is required', 400, ['estatus']);

    const valid = ['Consulta', 'Reservado', 'Pagado', 'Cancelado', 'Cerrado', 'Aprobado', 'Por Aprobar', 'Rechazado'];
    if (!valid.includes(estatus)) {
      return error(res, 'VALIDATION_ERROR', `Invalid estatus. Valid: ${valid.join(', ')}`, 400, ['estatus']);
    }

    const existing = findById('reservas_tours', req.params.id);
    if (!existing) return error(res, 'NOT_FOUND', `Tour ${req.params.id} not found`, 404);

    const updated = update('reservas_tours', req.params.id, { estatus });

    // Release slot capacity on Cancelado or Rechazado
    if (['Cancelado', 'Rechazado'].includes(estatus) && !['Cancelado', 'Rechazado'].includes(existing.estatus)) {
      if (existing.slot_id) {
        try {
          const db = getDb();
          const pax = existing.pax || 1;
          db.prepare('UPDATE horarios_slots SET reservados = MAX(reservados - ?, 0) WHERE id = ?').run(pax, existing.slot_id);
          console.log(`♻️ Released ${pax} slot(s) from slot #${existing.slot_id} for cancelled tour #${existing.id}`);
        } catch (slotErr) {
          console.error('Error releasing slot:', slotErr.message);
        }
      }
    }

    success(res, updated);

    // Notify status change
    setImmediate(async () => {
      try {
        const fullTour = { ...existing, ...updated, email: existing.email_cliente };
        await notifications.onTourStatusChanged(fullTour, existing.estatus, estatus);
      } catch (err) {
        console.error('🔔 Notification error (tour PATCH status):', err.message);
      }
    });
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error updating status', 500);
  }
});

// ── DASHBOARD / CATALOG ENDPOINTS ──

router.get('/api/v1/dashboard', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const { mes } = req.query;

    // Determine month filter
    const now = new Date();
    const currentMonth = now.toISOString().substring(0, 7);
    const filterMonth = mes || currentMonth;
    const isAll = filterMonth === 'todo';
    const isYear = !isAll && filterMonth.length === 4;

    // Build date filter for tours
    let tourDateFilter = '';
    let tourDateParams = [];
    if (!isAll) {
      if (isYear) {
        tourDateFilter = "AND substr(fecha, 1, 4) = ?";
        tourDateParams = [filterMonth];
      } else {
        tourDateFilter = "AND substr(fecha, 1, 7) = ?";
        tourDateParams = [filterMonth];
      }
    }

    // Build date filter for estadias (based on check_in)
    let estadiaDateFilter = '';
    let estadiaDateParams = [];
    if (!isAll) {
      if (isYear) {
        estadiaDateFilter = "AND substr(check_in, 1, 4) = ?";
        estadiaDateParams = [filterMonth];
      } else {
        estadiaDateFilter = "AND substr(check_in, 1, 7) = ?";
        estadiaDateParams = [filterMonth];
      }
    }

    const tours = db.prepare(`
      SELECT 
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN precio_ingreso IS NOT NULL AND estatus NOT IN ('Rechazado','Cancelado') THEN precio_ingreso ELSE 0 END), 0) as ingresos,
        COALESCE(SUM(CASE WHEN ganancia_mahana IS NOT NULL AND estatus NOT IN ('Rechazado','Cancelado') THEN ganancia_mahana ELSE 0 END), 0) as ganancia,
        SUM(CASE WHEN estatus = 'Pagado' THEN 1 ELSE 0 END) as pagados,
        SUM(CASE WHEN estatus = 'Reservado' THEN 1 ELSE 0 END) as reservados,
        SUM(CASE WHEN estatus = 'Consulta' THEN 1 ELSE 0 END) as consultas,
        SUM(CASE WHEN estatus = 'Por Aprobar' THEN 1 ELSE 0 END) as por_aprobar
      FROM reservas_tours
      WHERE (eliminado IS NULL OR eliminado = 0) ${tourDateFilter}
    `).get(...tourDateParams);

    const toursMahana = db.prepare(`
      SELECT 
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN precio_ingreso IS NOT NULL AND estatus NOT IN ('Rechazado','Cancelado') THEN precio_ingreso ELSE 0 END), 0) as ingresos,
        COALESCE(SUM(CASE WHEN ganancia_mahana IS NOT NULL AND estatus NOT IN ('Rechazado','Cancelado') THEN ganancia_mahana ELSE 0 END), 0) as ganancia
      FROM reservas_tours WHERE (eliminado IS NULL OR eliminado = 0) AND vendedor = 'Mahana Tours' ${tourDateFilter}
    `).get(...tourDateParams);

    const ventasPartners = db.prepare(`
      SELECT 
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN precio_ingreso IS NOT NULL AND estatus NOT IN ('Rechazado','Cancelado') THEN precio_ingreso ELSE 0 END), 0) as ingresos,
        COALESCE(SUM(
          CASE 
            WHEN estatus IN ('Rechazado','Cancelado') THEN 0
            WHEN monto_comision IS NOT NULL AND monto_comision > 0 THEN monto_comision
            WHEN precio_ingreso IS NOT NULL AND comision_pct IS NOT NULL THEN precio_ingreso * comision_pct / 100.0
            ELSE 0 
          END
        ), 0) as comisiones
      FROM reservas_tours WHERE (eliminado IS NULL OR eliminado = 0) AND vendedor != 'Mahana Tours' ${tourDateFilter}
    `).get(...tourDateParams);

    const estadias = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN estado LIKE '%Solicitada%' THEN 1 ELSE 0 END) as pendientes,
        SUM(CASE WHEN estado LIKE '%Confirmada%' OR estado LIKE '%Pagada%' THEN 1 ELSE 0 END) as confirmadas,
        COALESCE(SUM(CASE WHEN monto_comision IS NOT NULL THEN monto_comision ELSE 0 END), 0) as comisiones
      FROM reservas_estadias
      WHERE 1=1 ${estadiaDateFilter}
    `).get(...estadiaDateParams);

    const hoy = new Date().toISOString().split('T')[0];
    const toursHoy = db.prepare(`
      SELECT COUNT(*) as total FROM reservas_tours WHERE (eliminado IS NULL OR eliminado = 0) AND fecha = ?
    `).get(hoy);

    // Recientes filtered by month too
    let recientesQuery;
    if (isAll) {
      recientesQuery = db.prepare(`
        SELECT 'tour' as tipo, id, cliente, actividad as descripcion, fecha, estatus as estado, 
               precio_ingreso as monto, fuente, created_at
        FROM reservas_tours WHERE (eliminado IS NULL OR eliminado = 0)
        UNION ALL
        SELECT 'estadia' as tipo, id, cliente, propiedad as descripcion, check_in as fecha, estado, 
               precio_final as monto, fuente, created_at
        FROM reservas_estadias
        ORDER BY created_at DESC LIMIT 10
      `).all();
    } else if (isYear) {
      recientesQuery = db.prepare(`
        SELECT 'tour' as tipo, id, cliente, actividad as descripcion, fecha, estatus as estado, 
               precio_ingreso as monto, fuente, created_at
        FROM reservas_tours WHERE (eliminado IS NULL OR eliminado = 0) AND substr(fecha, 1, 4) = ?
        UNION ALL
        SELECT 'estadia' as tipo, id, cliente, propiedad as descripcion, check_in as fecha, estado, 
               precio_final as monto, fuente, created_at
        FROM reservas_estadias WHERE substr(check_in, 1, 4) = ?
        ORDER BY created_at DESC LIMIT 10
      `).all(filterMonth, filterMonth);
    } else {
      recientesQuery = db.prepare(`
        SELECT 'tour' as tipo, id, cliente, actividad as descripcion, fecha, estatus as estado, 
               precio_ingreso as monto, fuente, created_at
        FROM reservas_tours WHERE (eliminado IS NULL OR eliminado = 0) AND substr(fecha, 1, 7) = ?
        UNION ALL
        SELECT 'estadia' as tipo, id, cliente, propiedad as descripcion, check_in as fecha, estado, 
               precio_final as monto, fuente, created_at
        FROM reservas_estadias WHERE substr(check_in, 1, 7) = ?
        ORDER BY created_at DESC LIMIT 10
      `).all(filterMonth, filterMonth);
    }

    // Available months for the filter dropdown
    const mesesDisponibles = db.prepare(`
      SELECT DISTINCT mes FROM (
        SELECT substr(fecha, 1, 7) as mes FROM reservas_tours WHERE fecha IS NOT NULL AND fecha != ''
        UNION
        SELECT substr(check_in, 1, 7) as mes FROM reservas_estadias WHERE check_in IS NOT NULL AND check_in != ''
      ) ORDER BY mes DESC
    `).all().map(r => r.mes);

    const ticketsAbiertos = db.prepare(`
      SELECT COUNT(*) as total FROM tickets_servicio WHERE estatus IN ('Abierto', 'En Proceso')
    `).get();

    success(res, {
      resumen: {
        tours_total: tours.total,
        tours_hoy: toursHoy.total,
        ingresos_total: Math.round(tours.ingresos * 100) / 100,
        ganancia_total: Math.round(tours.ganancia * 100) / 100,
        estadias_total: estadias.total,
        estadias_pendientes: estadias.pendientes,
        estadias_confirmadas: estadias.confirmadas
      },
      tours_mahana: toursMahana,
      ventas_partners: ventasPartners,
      estadias,
      tours_por_estatus: {
        pagados: tours.pagados,
        reservados: tours.reservados,
        consultas: tours.consultas,
        por_aprobar: tours.por_aprobar || 0
      },
      tickets_servicio: {
        abiertos: ticketsAbiertos.total || 0
      },
      recientes: recientesQuery,
      mesActual: currentMonth,
      mesSeleccionado: filterMonth,
      mesesDisponibles
    });
  } catch (err) {
    console.error('Error loading dashboard:', err);
    error(res, 'SERVER_ERROR', 'Error loading dashboard', 500);
  }
});

// ── PARTNER DASHBOARD ──

router.get('/api/v1/partner/dashboard', requireAuth, (req, res) => {
  try {
    if (!isPartner(req)) {
      return error(res, 'FORBIDDEN', 'Solo disponible para partners', 403);
    }

    const db = getDb();
    const vendedor = req.user.vendedor;
    const { mes } = req.query;

    const now = new Date();
    const currentMonth = now.toISOString().substring(0, 7);
    const filterMonth = mes || currentMonth;
    const isAll = filterMonth === 'todo';
    const isYear = !isAll && filterMonth.length === 4;

    let dateFilter = '';
    let dateParams = [];
    if (!isAll) {
      if (isYear) {
        dateFilter = "AND substr(fecha, 1, 4) = ?";
        dateParams = [filterMonth];
      } else {
        dateFilter = "AND substr(fecha, 1, 7) = ?";
        dateParams = [filterMonth];
      }
    }

    // KPIs: precio_ingreso (tour price), ITBM, comisión Caracol
    // Only count non-rejected tours in financial totals
    const kpis = db.prepare(`
      SELECT 
        COUNT(*) as total_tours,
        COALESCE(SUM(CASE WHEN precio_ingreso IS NOT NULL AND estatus NOT IN ('Rechazado','Cancelado') THEN precio_ingreso ELSE 0 END), 0) as total_precio,
        COALESCE(SUM(
          CASE 
            WHEN estatus IN ('Rechazado','Cancelado') THEN 0
            WHEN monto_comision IS NOT NULL AND monto_comision > 0 THEN monto_comision
            WHEN precio_ingreso IS NOT NULL AND comision_pct IS NOT NULL THEN precio_ingreso * comision_pct / 100.0
            ELSE 0 
          END
        ), 0) as total_comision,
        SUM(CASE WHEN estatus = 'Aprobado' THEN 1 ELSE 0 END) as aprobados,
        SUM(CASE WHEN estatus = 'Reservado' OR estatus = 'Pagado' THEN 1 ELSE 0 END) as reservados,
        SUM(CASE WHEN estatus = 'Por Aprobar' THEN 1 ELSE 0 END) as por_aprobar,
        SUM(CASE WHEN estatus = 'Rechazado' THEN 1 ELSE 0 END) as rechazados,
        COALESCE(SUM(CASE WHEN estatus = 'Por Aprobar' AND precio_ingreso IS NOT NULL THEN precio_ingreso ELSE 0 END), 0) as monto_por_aprobar,
        COALESCE(SUM(CASE WHEN estatus = 'Aprobado' AND precio_ingreso IS NOT NULL THEN precio_ingreso ELSE 0 END), 0) as monto_aprobados,
        COALESCE(SUM(CASE WHEN (estatus = 'Reservado' OR estatus = 'Pagado') AND precio_ingreso IS NOT NULL THEN precio_ingreso ELSE 0 END), 0) as monto_reservados,
        COALESCE(SUM(CASE WHEN estatus = 'Rechazado' AND precio_ingreso IS NOT NULL THEN precio_ingreso ELSE 0 END), 0) as monto_rechazados
      FROM reservas_tours
      WHERE (eliminado IS NULL OR eliminado = 0) AND vendedor = ? ${dateFilter}
    `).get(vendedor, ...dateParams);

    // ITBM = 7% del precio total (excluding rejected)
    const itbm = Math.round((kpis.total_precio * 0.07) * 100) / 100;
    // Monto Pagado = precio del tour (before ITBM, excluding rejected)
    const totalPagado = Math.round(kpis.total_precio * 100) / 100;

    // Top tours (actividades más solicitadas)
    const topTours = db.prepare(`
      SELECT 
        actividad as nombre,
        COUNT(*) as cantidad,
        COALESCE(SUM(costo_pago), 0) as monto
      FROM reservas_tours
      WHERE (eliminado IS NULL OR eliminado = 0) AND vendedor = ? AND actividad IS NOT NULL AND actividad != '' ${dateFilter}
      GROUP BY actividad
      ORDER BY cantidad DESC
      LIMIT 5
    `).all(vendedor, ...dateParams);

    // Clientes recientes (últimos 5 únicos)
    const clientesRecientes = db.prepare(`
      SELECT cliente, actividad, fecha, estatus, costo_pago, whatsapp
      FROM reservas_tours
      WHERE (eliminado IS NULL OR eliminado = 0) AND vendedor = ? AND cliente IS NOT NULL AND cliente != ''
      ORDER BY created_at DESC
      LIMIT 20
    `).all(vendedor);

    // Deduplicate by client name, keep only first (most recent)
    const seen = new Set();
    const uniqueClientes = [];
    for (const c of clientesRecientes) {
      if (!seen.has(c.cliente)) {
        seen.add(c.cliente);
        uniqueClientes.push(c);
        if (uniqueClientes.length >= 5) break;
      }
    }

    // Monthly revenue chart (last 12 months, always unfiltered for chart continuity)
    const ingresosPorMes = db.prepare(`
      SELECT 
        substr(fecha, 1, 7) as mes,
        COUNT(*) as cantidad,
        COALESCE(SUM(costo_pago), 0) as ingresos,
        COALESCE(SUM(monto_comision), 0) as comision
      FROM reservas_tours
      WHERE (eliminado IS NULL OR eliminado = 0) AND vendedor = ? AND fecha IS NOT NULL AND fecha != ''
      GROUP BY substr(fecha, 1, 7)
      ORDER BY mes DESC
      LIMIT 12
    `).all(vendedor).reverse();

    // Available months for filter
    const mesesDisponibles = db.prepare(`
      SELECT DISTINCT substr(fecha, 1, 7) as mes
      FROM reservas_tours
      WHERE (eliminado IS NULL OR eliminado = 0) AND vendedor = ? AND fecha IS NOT NULL AND fecha != ''
      ORDER BY mes DESC
    `).all(vendedor).map(r => r.mes);

    success(res, {
      kpis: {
        total_tours: kpis.total_tours,
        total_pagado: totalPagado,
        itbm,
        total_comision: Math.round(kpis.total_comision * 100) / 100,
        por_aprobar: kpis.por_aprobar || 0,
        aprobados: kpis.aprobados || 0,
        reservados: kpis.reservados || 0,
        rechazados: kpis.rechazados || 0,
        monto_por_aprobar: Math.round((kpis.monto_por_aprobar || 0) * 100) / 100,
        monto_aprobados: Math.round((kpis.monto_aprobados || 0) * 100) / 100,
        monto_reservados: Math.round((kpis.monto_reservados || 0) * 100) / 100,
        monto_rechazados: Math.round((kpis.monto_rechazados || 0) * 100) / 100,
      },
      topTours,
      ingresosPorMes,
      clientesRecientes: uniqueClientes,
      mesActual: currentMonth,
      mesSeleccionado: filterMonth,
      mesesDisponibles
    });
  } catch (err) {
    console.error('Error loading partner dashboard:', err);
    error(res, 'SERVER_ERROR', 'Error loading partner dashboard', 500);
  }
});

// ── PARTNER TOUR UPDATE (resets status) ──

router.put('/api/v1/partner/tours/:id', requireAuth, (req, res) => {
  try {
    if (!isPartner(req)) {
      return error(res, 'FORBIDDEN', 'Solo disponible para partners', 403);
    }

    const db = getDb();
    const tour = findById('reservas_tours', req.params.id);
    if (!tour) return error(res, 'NOT_FOUND', 'Tour no encontrado', 404);

    // Partner can only edit their own tours
    if (tour.vendedor !== req.user.vendedor) {
      return error(res, 'FORBIDDEN', 'No puedes editar tours de otro vendedor', 403);
    }

    const data = {};
    const allowed = ['cliente', 'whatsapp', 'email_cliente', 'hotel', 'nacionalidad',
      'idioma', 'edades', 'notas', 'solicitado_por', 'pax', 'comprobante_url'];

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        data[field] = typeof req.body[field] === 'string' ? sanitize(req.body[field]) : req.body[field];
      }
    }

    // Reset status to Por Aprobar
    data.estatus = 'Por Aprobar';

    const updated = update('reservas_tours', tour.id, data);

    // Create alert for the edit
    db.prepare(`INSERT INTO alertas (tipo, mensaje, referencia_tipo, referencia_id, datos_extra)
      VALUES (?, ?, ?, ?, ?)`).run(
      'tour_editado',
      `Tour #${tour.id} editado por ${req.user.vendedor}: ${tour.actividad} para ${updated.cliente}. Estado reiniciado a Por Aprobar.`,
      'tour',
      tour.id,
      JSON.stringify({ vendedor: req.user.vendedor, actividad: tour.actividad, cliente: updated.cliente, editado_por: req.user.nombre })
    );

    success(res, updated);

    // Send notifications for re-edited tour (needs re-approval)
    setImmediate(async () => {
      try {
        const fullTour = { ...tour, ...updated, email: updated.email_cliente || tour.email_cliente };
        await notifications.onTourCreated(fullTour);
      } catch (err) {
        console.error('🔔 Notification error (partner edit):', err.message);
      }
    });
  } catch (err) {
    console.error('Error updating partner tour:', err);
    error(res, 'SERVER_ERROR', 'Error al actualizar tour', 500);
  }
});

// ── TOUR APPROVAL / REJECTION ──

router.post('/api/v1/tours/:id/aprobar', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const db = getDb();
    const tour = findById('reservas_tours', req.params.id);
    if (!tour) return error(res, 'NOT_FOUND', 'Tour no encontrado', 404);
    if (tour.estatus !== 'Por Aprobar') {
      return error(res, 'INVALID_STATUS', `Tour tiene estatus "${tour.estatus}", solo se pueden aprobar tours "Por Aprobar"`, 400);
    }

    const updateData = { estatus: 'Aprobado' };

    // Auto-calculate financial fields if missing (partner-submitted tours have no pricing)
    if (!tour.precio_ingreso && tour.actividad) {
      const actividad = db.prepare('SELECT precio_base, costo_base, comision_caracol_pct FROM actividades WHERE nombre = ?').get(tour.actividad);
      if (actividad) {
        updateData.precio_ingreso = actividad.precio_base || 0;
        updateData.costo_pago = actividad.costo_base || 0;
        updateData.comision_pct = actividad.comision_caracol_pct || 0;
      }
    }

    // Recalculate CxC with merged data (existing tour + new updates)
    const merged = { ...tour, ...updateData };
    if (merged.precio_ingreso) {
      Object.assign(updateData, calcCxC(merged));
    }

    const updated = update('reservas_tours', tour.id, updateData);

    // Create alert
    db.prepare(`INSERT INTO alertas (tipo, mensaje, referencia_tipo, referencia_id, datos_extra)
      VALUES (?, ?, ?, ?, ?)`).run(
      'tour_aprobado',
      `Tour #${tour.id} aprobado: ${tour.actividad} para ${tour.cliente} (${tour.vendedor})`,
      'tour',
      tour.id,
      JSON.stringify({ vendedor: tour.vendedor, actividad: tour.actividad, cliente: tour.cliente, aprobado_por: req.user.nombre })
    );

    success(res, updated);

    // Send notifications asynchronously
    setImmediate(async () => {
      try {
        const fullTour = { ...tour, ...updated, email: tour.email_cliente };
        await notifications.onTourApproved(fullTour);
      } catch (err) {
        console.error('🔔 Notification error (tour approve):', err.message);
      }
    });
  } catch (err) {
    console.error('Error approving tour:', err);
    error(res, 'SERVER_ERROR', 'Error al aprobar tour', 500);
  }
});

router.post('/api/v1/tours/:id/rechazar', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const db = getDb();
    const tour = findById('reservas_tours', req.params.id);
    if (!tour) return error(res, 'NOT_FOUND', 'Tour no encontrado', 404);
    if (tour.estatus !== 'Por Aprobar') {
      return error(res, 'INVALID_STATUS', `Tour tiene estatus "${tour.estatus}", solo se pueden rechazar tours "Por Aprobar"`, 400);
    }

    const motivo = sanitize(req.body.motivo || 'Sin motivo especificado');
    const updated = update('reservas_tours', tour.id, {
      estatus: 'Rechazado',
      motivo_rechazo: motivo
    });

    // Release slot if linked
    if (tour.slot_id) {
      try {
        const pax = tour.pax || 1;
        db.prepare('UPDATE horarios_slots SET reservados = MAX(reservados - ?, 0) WHERE id = ?').run(pax, tour.slot_id);
      } catch (slotErr) {
        console.error('Error releasing slot:', slotErr.message);
      }
    }

    // Create alert
    db.prepare(`INSERT INTO alertas (tipo, mensaje, referencia_tipo, referencia_id, datos_extra)
      VALUES (?, ?, ?, ?, ?)`).run(
      'tour_rechazado',
      `Tour #${tour.id} rechazado: ${tour.actividad} para ${tour.cliente}. Motivo: ${motivo}`,
      'tour',
      tour.id,
      JSON.stringify({ vendedor: tour.vendedor, actividad: tour.actividad, cliente: tour.cliente, motivo, rechazado_por: req.user.nombre })
    );

    success(res, updated);

    // Notify about rejection
    setImmediate(async () => {
      try {
        const fullTour = { ...tour, ...updated, email: tour.email_cliente };
        await notifications.onTourStatusChanged(fullTour, 'Por Aprobar', 'Rechazado');
      } catch (err) {
        console.error('🔔 Notification error (tour rechazar):', err.message);
      }
    });
  } catch (err) {
    console.error('Error rejecting tour:', err);
    error(res, 'SERVER_ERROR', 'Error al rechazar tour', 500);
  }
});

// ── USER MANAGEMENT (admin only) ──

router.get('/api/v1/usuarios', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const db = getDb();
    const users = db.prepare('SELECT id, email, nombre, rol, vendedor, activo, created_at FROM usuarios ORDER BY id').all();
    success(res, users);
  } catch (err) {
    console.error('Error listing users:', err);
    error(res, 'SERVER_ERROR', 'Error listing users', 500);
  }
});

router.post('/api/v1/usuarios', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const { email, password, nombre, rol, vendedor } = req.body;
    if (!email || !password || !nombre || !rol) {
      return error(res, 'VALIDATION_ERROR', 'Email, contraseña, nombre y rol son requeridos', 400);
    }
    if (!['admin', 'partner', 'vendedor'].includes(rol)) {
      return error(res, 'VALIDATION_ERROR', 'Rol debe ser "admin", "partner" o "vendedor"', 400);
    }
    if (password.length < 6) {
      return error(res, 'VALIDATION_ERROR', 'La contraseña debe tener al menos 6 caracteres', 400);
    }
    if (rol === 'partner' && !vendedor) {
      return error(res, 'VALIDATION_ERROR', 'El campo Vendedor/Empresa es requerido para partners', 400);
    }

    const db = getDb();
    const existing = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email.toLowerCase().trim());
    if (existing) {
      return error(res, 'DUPLICATE', 'Ya existe un usuario con ese email', 400);
    }

    const password_hash = hashPassword(password);
    const result = db.prepare('INSERT INTO usuarios (email, password_hash, nombre, rol, vendedor) VALUES (?, ?, ?, ?, ?)').run(
      email.toLowerCase().trim(), password_hash, sanitize(nombre), rol, vendedor ? sanitize(vendedor) : null
    );

    const user = db.prepare('SELECT id, email, nombre, rol, vendedor, activo, created_at FROM usuarios WHERE id = ?').get(result.lastInsertRowid);
    success(res, user, 201);
  } catch (err) {
    console.error('Error creating user:', err);
    error(res, 'SERVER_ERROR', 'Error creating user', 500);
  }
});

router.put('/api/v1/usuarios/:id', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
    if (!user) return error(res, 'NOT_FOUND', 'Usuario no encontrado', 404);

    const { email, password, nombre, rol, vendedor } = req.body;
    const updates = {};

    if (email) updates.email = email.toLowerCase().trim();
    if (nombre) updates.nombre = sanitize(nombre);
    if (rol && ['admin', 'partner', 'vendedor'].includes(rol)) updates.rol = rol;
    if (vendedor !== undefined) updates.vendedor = vendedor ? sanitize(vendedor) : null;
    if (password && password.length >= 6) updates.password_hash = hashPassword(password);

    if (Object.keys(updates).length === 0) {
      return error(res, 'VALIDATION_ERROR', 'No hay datos para actualizar', 400);
    }

    // Ensure partner always has vendedor
    const finalRol = updates.rol || user.rol;
    const finalVendedor = updates.vendedor !== undefined ? updates.vendedor : user.vendedor;
    if (finalRol === 'partner' && !finalVendedor) {
      return error(res, 'VALIDATION_ERROR', 'El campo Vendedor/Empresa es requerido para partners', 400);
    }

    // Prevent changing own role from admin
    if (req.user.id === user.id && updates.rol && updates.rol !== 'admin') {
      return error(res, 'FORBIDDEN', 'No puedes cambiar tu propio rol', 403);
    }

    const fields = Object.keys(updates).map(f => `${f} = ?`).join(', ');
    db.prepare(`UPDATE usuarios SET ${fields} WHERE id = ?`).run(...Object.values(updates), req.params.id);

    const updated = db.prepare('SELECT id, email, nombre, rol, vendedor, activo, created_at FROM usuarios WHERE id = ?').get(req.params.id);
    success(res, updated);
  } catch (err) {
    console.error('Error updating user:', err);
    error(res, 'SERVER_ERROR', 'Error updating user', 500);
  }
});

router.patch('/api/v1/usuarios/:id/toggle', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
    if (!user) return error(res, 'NOT_FOUND', 'Usuario no encontrado', 404);

    // Prevent deactivating self
    if (req.user.id === user.id) {
      return error(res, 'FORBIDDEN', 'No puedes desactivar tu propia cuenta', 403);
    }

    const newStatus = user.activo ? 0 : 1;
    db.prepare('UPDATE usuarios SET activo = ? WHERE id = ?').run(newStatus, req.params.id);

    const updated = db.prepare('SELECT id, email, nombre, rol, vendedor, activo, created_at FROM usuarios WHERE id = ?').get(req.params.id);
    success(res, updated);
  } catch (err) {
    console.error('Error toggling user:', err);
    error(res, 'SERVER_ERROR', 'Error toggling user', 500);
  }
});

router.delete('/api/v1/usuarios/:id', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
    if (!user) return error(res, 'NOT_FOUND', 'Usuario no encontrado', 404);

    // Prevent deleting self
    if (req.user.id === user.id) {
      return error(res, 'FORBIDDEN', 'No puedes eliminar tu propia cuenta', 403);
    }

    // Prevent deleting last admin
    const adminCount = db.prepare("SELECT COUNT(*) as c FROM usuarios WHERE rol = 'admin' AND activo = 1").get();
    if (user.rol === 'admin' && adminCount.c <= 1) {
      return error(res, 'FORBIDDEN', 'No puedes eliminar el último administrador', 403);
    }

    db.prepare('DELETE FROM usuarios WHERE id = ?').run(req.params.id);
    success(res, { deleted: true, id: user.id });
  } catch (err) {
    console.error('Error deleting user:', err);
    error(res, 'SERVER_ERROR', 'Error deleting user', 500);
  }
});

// ── ALERTAS — AI Agent Monitoring ──

router.get('/api/v1/alertas', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const { tipo, leida, limit: lim } = req.query;
    let where = '1=1';
    const params = [];

    if (tipo) { where += ' AND tipo = ?'; params.push(tipo); }
    if (leida !== undefined) { where += ' AND leida = ?'; params.push(leida === 'true' || leida === '1' ? 1 : 0); }

    const maxResults = Math.min(parseInt(lim) || 50, 100);
    const data = db.prepare(`SELECT * FROM alertas WHERE ${where} ORDER BY created_at DESC LIMIT ?`).all(...params, maxResults);
    const unread = db.prepare('SELECT COUNT(*) as c FROM alertas WHERE leida = 0').get().c;

    success(res, { alertas: data, sin_leer: unread });
  } catch (err) {
    console.error('Error loading alerts:', err);
    error(res, 'SERVER_ERROR', 'Error loading alerts', 500);
  }
});

router.patch('/api/v1/alertas/:id', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const alerta = db.prepare('SELECT * FROM alertas WHERE id = ?').get(req.params.id);
    if (!alerta) return error(res, 'NOT_FOUND', 'Alerta no encontrada', 404);
    db.prepare('UPDATE alertas SET leida = 1 WHERE id = ?').run(req.params.id);
    success(res, { ...alerta, leida: 1 });
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error updating alert', 500);
  }
});

router.patch('/api/v1/alertas/leer-todas', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const result = db.prepare('UPDATE alertas SET leida = 1 WHERE leida = 0').run();
    success(res, { updated: result.changes });
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error marking all as read', 500);
  }
});

// ── UPLOADS ──

router.post('/api/v1/uploads', requireAuth, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return error(res, 'VALIDATION_ERROR', 'No se recibió ningún archivo', 400);
    }
    const url = `/uploads/${req.file.filename}`;
    success(res, { url, filename: req.file.filename, size: req.file.size }, null, 201);
  } catch (err) {
    console.error('Error uploading file:', err);
    error(res, 'SERVER_ERROR', 'Error al subir archivo', 500);
  }
});

// ── CHARTS ──

router.get('/api/v1/charts', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const { mes } = req.query; // e.g. "2026-03", "2026", or empty for current month

    // Determine filter
    const now = new Date();
    const currentMonth = now.toISOString().substring(0, 7);
    const filterMonth = mes || currentMonth; // default = current month
    const isYear = filterMonth.length === 4; // "2026" = full year
    const isAll = filterMonth === 'todo';

    // Build date filter
    let dateFilter = '';
    let dateParams = [];
    if (!isAll) {
      if (isYear) {
        dateFilter = "AND substr(fecha, 1, 4) = ?";
        dateParams = [filterMonth];
      } else {
        dateFilter = "AND substr(fecha, 1, 7) = ?";
        dateParams = [filterMonth];
      }
    }

    // Monthly revenue (last 12 months, always unfiltered for chart)
    const ingresosPorMes = db.prepare(`
      SELECT 
        substr(fecha, 1, 7) as mes,
        COALESCE(SUM(precio_ingreso), 0) as ingresos,
        COALESCE(SUM(ganancia_mahana), 0) as ganancia,
        COUNT(*) as cantidad
      FROM reservas_tours
      WHERE (eliminado IS NULL OR eliminado = 0) AND fecha IS NOT NULL AND fecha != ''
      GROUP BY substr(fecha, 1, 7)
      ORDER BY mes DESC
      LIMIT 12
    `).all().reverse();

    // Available months for filter
    const mesesDisponibles = db.prepare(`
      SELECT DISTINCT substr(fecha, 1, 7) as mes
      FROM reservas_tours
      WHERE (eliminado IS NULL OR eliminado = 0) AND fecha IS NOT NULL AND fecha != ''
      ORDER BY mes DESC
    `).all().map(r => r.mes);

    // Activity distribution (filtered by selected month)
    const porActividad = db.prepare(`
      SELECT 
        actividad as nombre,
        COUNT(*) as cantidad,
        COALESCE(SUM(precio_ingreso), 0) as ingresos
      FROM reservas_tours
      WHERE (eliminado IS NULL OR eliminado = 0) AND actividad IS NOT NULL AND actividad != '' ${dateFilter}
      GROUP BY actividad
      ORDER BY cantidad DESC
      LIMIT 8
    `).all(...dateParams);

    // Period stats (filtered)
    const filteredStats = isAll
      ? db.prepare('SELECT COUNT(*) as cantidad, COALESCE(SUM(precio_ingreso),0) as ingresos, COALESCE(SUM(ganancia_mahana),0) as ganancia FROM reservas_tours WHERE (eliminado IS NULL OR eliminado = 0)').get()
      : (isYear
        ? db.prepare(`SELECT COUNT(*) as cantidad, COALESCE(SUM(precio_ingreso),0) as ingresos, COALESCE(SUM(ganancia_mahana),0) as ganancia FROM reservas_tours WHERE (eliminado IS NULL OR eliminado = 0) AND substr(fecha,1,4) = ?`).get(filterMonth)
        : db.prepare(`SELECT COUNT(*) as cantidad, COALESCE(SUM(precio_ingreso),0) as ingresos, COALESCE(SUM(ganancia_mahana),0) as ganancia FROM reservas_tours WHERE (eliminado IS NULL OR eliminado = 0) AND substr(fecha,1,7) = ?`).get(filterMonth)
      );

    // Tours by period for the tours page
    const hoy = now.toISOString().split('T')[0];
    const inicioSemana = new Date(now);
    inicioSemana.setDate(inicioSemana.getDate() - inicioSemana.getDay());
    const inicioMes = hoy.substring(0, 7) + '-01';
    const inicioAnio = hoy.substring(0, 4) + '-01-01';
    const getPeriodStats = (desde) => db.prepare('SELECT COUNT(*) as cantidad, COALESCE(SUM(precio_ingreso),0) as ingresos, COALESCE(SUM(ganancia_mahana),0) as ganancia FROM reservas_tours WHERE (eliminado IS NULL OR eliminado = 0) AND fecha >= ?').get(desde);

    const periodos = {
      hoy: getPeriodStats(hoy),
      semana: getPeriodStats(inicioSemana.toISOString().split('T')[0]),
      mes: getPeriodStats(inicioMes),
      anio: getPeriodStats(inicioAnio),
      todo: db.prepare('SELECT COUNT(*) as cantidad, COALESCE(SUM(precio_ingreso),0) as ingresos, COALESCE(SUM(ganancia_mahana),0) as ganancia FROM reservas_tours WHERE (eliminado IS NULL OR eliminado = 0)').get()
    };

    // Estadias by status
    const estadiasPorEstado = db.prepare(`
      SELECT estado, COUNT(*) as cantidad
      FROM reservas_estadias
      GROUP BY estado
    `).all();

    // Estadias financials
    const estadiasFinancieros = db.prepare(`
      SELECT 
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN precio_final IS NOT NULL AND precio_final > 0 THEN precio_final ELSE 0 END), 0) as ingresos,
        COALESCE(SUM(CASE WHEN monto_comision IS NOT NULL AND monto_comision > 0 THEN monto_comision ELSE 0 END), 0) as comisiones
      FROM reservas_estadias
    `).get();

    // Leads abiertos (sum of precio_final for states before Pagada)
    const leadsAbiertos = db.prepare(`
      SELECT COUNT(*) as cantidad,
        COALESCE(SUM(CASE WHEN precio_final IS NOT NULL AND precio_final > 0 THEN precio_final ELSE 0 END), 0) as monto
      FROM reservas_estadias
      WHERE estado IN ('Solicitada', 'Cotizada', 'Confirmada')
    `).get();

    success(res, {
      ingresosPorMes, porActividad, periodos, estadiasPorEstado,
      mesesDisponibles, filteredStats, estadiasFinancieros,
      leadsAbiertos,
      mesActual: filterMonth
    });
  } catch (err) {
    console.error('Error loading charts:', err);
    error(res, 'SERVER_ERROR', 'Error loading charts', 500);
  }
});

// ── ACTIVIDADES ──

router.get('/api/v1/actividades', requireAuth, (req, res) => {
  try {
    const result = findAll('actividades', { limit: 200, orderBy: 'categoria ASC, nombre ASC' });
    success(res, result.data, result.meta);
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error listing actividades', 500);
  }
});

router.get('/api/v1/actividades/:id', requireAuth, (req, res) => {
  try {
    const item = findById('actividades', req.params.id);
    if (!item) return error(res, 'NOT_FOUND', `Actividad ${req.params.id} not found`, 404);
    success(res, item);
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error fetching actividad', 500);
  }
});

router.post('/api/v1/actividades', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const { nombre } = req.body;
    if (!nombre) return error(res, 'VALIDATION_ERROR', 'Campo "nombre" es requerido', 400, ['nombre']);

    const data = {};
    const allowed = ['nombre', 'tipo', 'precio_base', 'costo_base', 'activa',
      'categoria', 'descripcion', 'unidad', 'duracion', 'horario',
      'punto_encuentro', 'que_incluye', 'que_llevar', 'requisitos',
      'disponibilidad', 'costo_instructor', 'comision_caracol_pct',
      'capacidad_max', 'transporte', 'imagen_url',
      'slug', 'sitios', 'visible_web', 'duracion_min'];

    for (const field of allowed) {
      if (req.body[field] !== undefined && req.body[field] !== null) {
        data[field] = typeof req.body[field] === 'string' ? sanitize(req.body[field]) : req.body[field];
      }
    }

    // Auto-generate slug from nombre if not provided
    if (!data.slug && data.nombre) {
      data.slug = data.nombre.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }
    // Default visible_web to 1 for new products
    if (data.visible_web === undefined) data.visible_web = 1;

    const item = create('actividades', data);
    success(res, item, null, 201);
  } catch (err) {
    console.error('Error creating actividad:', err);
    if (err.message?.includes('UNIQUE')) {
      return error(res, 'DUPLICATE', 'Ya existe una actividad con ese nombre', 409);
    }
    error(res, 'SERVER_ERROR', 'Error creating actividad', 500);
  }
});

router.put('/api/v1/actividades/:id', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const existing = findById('actividades', req.params.id);
    if (!existing) return error(res, 'NOT_FOUND', `Actividad ${req.params.id} not found`, 404);

    const data = {};
    const allowed = ['nombre', 'tipo', 'precio_base', 'costo_base', 'activa',
      'categoria', 'descripcion', 'unidad', 'duracion', 'horario',
      'punto_encuentro', 'que_incluye', 'que_llevar', 'requisitos',
      'disponibilidad', 'costo_instructor', 'comision_caracol_pct',
      'capacidad_max', 'transporte', 'imagen_url',
      'slug', 'sitios', 'visible_web', 'duracion_min'];

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        data[field] = typeof req.body[field] === 'string' ? sanitize(req.body[field]) : req.body[field];
      }
    }

    // Auto-regenerate slug when nombre changes
    if (data.nombre && !data.slug) {
      data.slug = data.nombre.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }

    const updated = update('actividades', req.params.id, data);
    success(res, updated);
  } catch (err) {
    console.error('Error updating actividad:', err.message, err.stack);
    if (err.message?.includes('UNIQUE')) {
      return error(res, 'DUPLICATE', 'Ya existe una actividad con ese nombre', 409);
    }
    error(res, 'SERVER_ERROR', 'Error updating actividad', 500);
  }
});

router.delete('/api/v1/actividades/:id', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const removed = remove('actividades', req.params.id);
    if (!removed) return error(res, 'NOT_FOUND', `Actividad ${req.params.id} not found`, 404);
    success(res, { deleted: true, id: req.params.id });
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error deleting actividad', 500);
  }
});

// ── STAFF ──

router.get('/api/v1/staff', requireAuth, (req, res) => {
  try {
    const result = findAll('staff', { limit: 100, orderBy: 'nombre ASC' });
    success(res, result.data, result.meta);
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error listing staff', 500);
  }
});

// ── EXPORT TOURS ──

router.get('/api/v1/tours/export', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const db = getDb();
    const { fecha_desde, fecha_hasta, estatus, actividad } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (fecha_desde) { where += ' AND fecha >= ?'; params.push(fecha_desde); }
    if (fecha_hasta) { where += ' AND fecha <= ?'; params.push(fecha_hasta); }
    if (estatus) { where += ' AND estatus = ?'; params.push(estatus); }
    if (actividad) { where += ' AND actividad = ?'; params.push(actividad); }

    const rows = db.prepare(`SELECT fecha, hora, cliente, actividad, vendedor, responsable, estatus, precio_ingreso, costo_pago, comision_pct, monto_comision, ganancia_mahana, notas, gestionado_por FROM reservas_tours ${where} ORDER BY fecha DESC`).all(...params);

    const headers = ['Fecha', 'Hora', 'Cliente', 'Actividad', 'Vendedor', 'Responsable', 'Estatus', 'Precio Ingreso', 'Costo', 'Comisión %', 'Monto Comisión', 'Ganancia', 'Notas', 'Gestionado Por'];
    const csv = [toCsvRow(headers)];
    for (const r of rows) {
      csv.push(toCsvRow([r.fecha, r.hora, r.cliente, r.actividad, r.vendedor, r.responsable, r.estatus, r.precio_ingreso, r.costo_pago, r.comision_pct, r.monto_comision, r.ganancia_mahana, r.notas, r.gestionado_por]));
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="tours_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send('\uFEFF' + csv.join('\n'));
  } catch (err) {
    console.error('Error exporting tours:', err);
    error(res, 'SERVER_ERROR', 'Error exporting tours', 500);
  }
});

// ── CALENDAR ──

router.get('/api/v1/calendar', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const { mes } = req.query; // e.g. "2026-03"
    const now = new Date();
    const filterMonth = mes || now.toISOString().substring(0, 7);

    // Get year/month for range calculation
    const [year, month] = filterMonth.split('-').map(Number);
    const firstDay = `${filterMonth}-01`;
    const lastDay = new Date(year, month, 0).toISOString().split('T')[0]; // last day of month

    // Tours for this month
    const tours = db.prepare(`
      SELECT id, fecha, hora, cliente, actividad, estatus, vendedor, responsable, precio_ingreso, ganancia_mahana
      FROM reservas_tours
      WHERE fecha >= ? AND fecha <= ?
      ORDER BY fecha ASC, hora ASC
    `).all(firstDay, lastDay);

    // Estadias that overlap with this month (check_in <= lastDay AND check_out >= firstDay)
    const estadias = db.prepare(`
      SELECT id, cliente, propiedad, check_in, check_out, estado, precio_final, monto_comision, huespedes
      FROM reservas_estadias
      WHERE check_in <= ? AND (check_out >= ? OR check_out IS NULL OR check_out = '')
      ORDER BY check_in ASC
    `).all(lastDay, firstDay);

    success(res, {
      mes: filterMonth,
      tours,
      estadias
    });
  } catch (err) {
    console.error('Error loading calendar:', err);
    error(res, 'SERVER_ERROR', 'Error loading calendar', 500);
  }
});

// ── AVAILABILITY SLOTS ──

// Get slots for a specific date
router.get('/api/v1/disponibilidad', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const { fecha } = req.query;
    if (!fecha) return error(res, 'VALIDATION_ERROR', 'fecha is required', 400);

    let slots;
    if (isPartner(req)) {
      // Partners only see available (unblocked, not full) slots
      slots = db.prepare(`
        SELECT s.*, a.nombre as actividad_nombre
        FROM horarios_slots s
        JOIN actividades a ON a.id = s.actividad_id
        WHERE s.fecha = ? AND s.bloqueado = 0
        ORDER BY a.nombre, s.hora
      `).all(fecha);
    } else {
      slots = db.prepare(`
        SELECT s.*, a.nombre as actividad_nombre
        FROM horarios_slots s
        JOIN actividades a ON a.id = s.actividad_id
        WHERE s.fecha = ?
        ORDER BY a.nombre, s.hora
      `).all(fecha);
    }

    success(res, slots);
  } catch (err) {
    console.error('Error fetching disponibilidad:', err);
    error(res, 'SERVER_ERROR', 'Error fetching disponibilidad', 500);
  }
});

// Get slots for a week
router.get('/api/v1/disponibilidad/semana', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const { desde } = req.query;
    if (!desde) return error(res, 'VALIDATION_ERROR', 'desde (start date) is required', 400);

    // Calculate end of week (7 days from start)
    const start = new Date(desde + 'T00:00:00');
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const hasta = end.toISOString().split('T')[0];

    let slots;
    if (isPartner(req)) {
      slots = db.prepare(`
        SELECT s.*, a.nombre as actividad_nombre
        FROM horarios_slots s
        JOIN actividades a ON a.id = s.actividad_id
        WHERE s.fecha >= ? AND s.fecha <= ? AND s.bloqueado = 0
        ORDER BY s.fecha, a.nombre, s.hora
      `).all(desde, hasta);
    } else {
      slots = db.prepare(`
        SELECT s.*, a.nombre as actividad_nombre
        FROM horarios_slots s
        JOIN actividades a ON a.id = s.actividad_id
        WHERE s.fecha >= ? AND s.fecha <= ?
        ORDER BY s.fecha, a.nombre, s.hora
      `).all(desde, hasta);
    }

    success(res, slots);
  } catch (err) {
    console.error('Error fetching week slots:', err);
    error(res, 'SERVER_ERROR', 'Error fetching disponibilidad', 500);
  }
});

// Create a slot
router.post('/api/v1/slots', requireAuth, requireRole('admin', 'vendedor'), (req, res) => {
  try {
    const { actividad_id, fecha, hora, capacidad = 6 } = req.body;
    if (!actividad_id || !fecha || !hora) {
      return error(res, 'VALIDATION_ERROR', 'actividad_id, fecha, hora son requeridos', 400);
    }
    const slot = create('horarios_slots', {
      actividad_id: parseInt(actividad_id),
      fecha,
      hora,
      capacidad: parseInt(capacidad) || 6,
      reservados: 0,
      bloqueado: 0,
    });
    success(res, slot, null, 201);
  } catch (err) {
    if (err.message?.includes('UNIQUE')) {
      return error(res, 'DUPLICATE', 'Ya existe un slot para esta actividad/fecha/hora', 409);
    }
    console.error('Error creating slot:', err);
    error(res, 'SERVER_ERROR', 'Error creating slot', 500);
  }
});

// Update a slot (capacity, block, notes)
router.put('/api/v1/slots/:id', requireAuth, requireRole('admin', 'vendedor'), (req, res) => {
  try {
    const existing = findById('horarios_slots', req.params.id);
    if (!existing) return error(res, 'NOT_FOUND', 'Slot not found', 404);

    const data = {};
    const allowed = ['hora', 'capacidad', 'bloqueado', 'notas'];
    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        data[field] = req.body[field];
      }
    }

    const updated = update('horarios_slots', req.params.id, data);
    success(res, updated);
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error updating slot', 500);
  }
});

// Delete a slot
router.delete('/api/v1/slots/:id', requireAuth, requireRole('admin', 'vendedor'), (req, res) => {
  try {
    const removed = remove('horarios_slots', req.params.id);
    if (!removed) return error(res, 'NOT_FOUND', 'Slot not found', 404);
    success(res, { deleted: true, id: req.params.id });
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error deleting slot', 500);
  }
});

// ── AI-AGENT-FRIENDLY ENDPOINTS ──

// GET full month availability in 1 call (instead of 31 individual requests)
router.get('/api/v1/disponibilidad/mes', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const { mes, actividad_id } = req.query; // mes = '2026-04'
    if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
      return error(res, 'VALIDATION_ERROR', 'Parámetro mes requerido (formato: YYYY-MM)', 400);
    }

    const year = parseInt(mes.split('-')[0]);
    const month = parseInt(mes.split('-')[1]);
    const daysInMonth = new Date(year, month, 0).getDate();
    const desde = `${mes}-01`;
    const hasta = `${mes}-${String(daysInMonth).padStart(2, '0')}`;

    let sql = `
      SELECT s.*, a.nombre as actividad_nombre
      FROM horarios_slots s
      JOIN actividades a ON a.id = s.actividad_id
      WHERE s.fecha >= ? AND s.fecha <= ?
    `;
    const params = [desde, hasta];
    if (actividad_id) {
      sql += ' AND s.actividad_id = ?';
      params.push(actividad_id);
    }
    sql += ' ORDER BY s.fecha, a.nombre, s.hora';

    const slots = db.prepare(sql).all(...params);

    // Build day summary
    const daySummary = {};
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${mes}-${String(d).padStart(2, '0')}`;
      const daySlots = slots.filter(s => s.fecha === dateStr);
      const totalCap = daySlots.reduce((sum, s) => sum + s.capacidad, 0);
      const totalRes = daySlots.reduce((sum, s) => sum + s.reservados, 0);
      const blocked = daySlots.filter(s => s.bloqueado).length;
      daySummary[dateStr] = {
        slots: daySlots.length,
        capacidad_total: totalCap,
        reservados_total: totalRes,
        disponibles: totalCap - totalRes,
        bloqueados: blocked,
        ocupacion_pct: totalCap > 0 ? Math.round((totalRes / totalCap) * 100) : 0,
      };
    }

    // Bloqueos for the month
    let bloqueosSql = 'SELECT * FROM bloqueos_fechas WHERE fecha >= ? AND fecha <= ?';
    const blParams = [desde, hasta];
    if (actividad_id) {
      bloqueosSql += ' AND (actividad_id = ? OR actividad_id IS NULL)';
      blParams.push(actividad_id);
    }
    const bloqueos = db.prepare(bloqueosSql).all(...blParams);

    success(res, {
      mes, desde, hasta,
      total_slots: slots.length,
      slots,
      resumen_por_dia: daySummary,
      bloqueos,
    });
  } catch (err) {
    console.error('Error fetching month:', err);
    error(res, 'SERVER_ERROR', 'Error fetching month data', 500);
  }
});

// POST bulk create slots (create many at once)
router.post('/api/v1/slots/bulk', requireAuth, requireRole('admin', 'vendedor'), (req, res) => {
  try {
    const { slots: slotsData } = req.body;
    // Expect: { slots: [{ actividad_id, fecha, hora, capacidad? }, ...] }
    if (!Array.isArray(slotsData) || slotsData.length === 0) {
      return error(res, 'VALIDATION_ERROR', 'Se requiere un array "slots" con al menos 1 elemento', 400);
    }
    if (slotsData.length > 500) {
      return error(res, 'VALIDATION_ERROR', 'Máximo 500 slots por llamada', 400);
    }

    const db = getDb();
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO horarios_slots (actividad_id, fecha, hora, capacidad, reservados, bloqueado)
      VALUES (?, ?, ?, ?, 0, 0)
    `);

    let created = 0, skipped = 0, errors_list = [];

    const transaction = db.transaction(() => {
      for (const s of slotsData) {
        if (!s.actividad_id || !s.fecha || !s.hora) {
          errors_list.push({ slot: s, error: 'Faltan campos requeridos' });
          continue;
        }
        try {
          const result = insertStmt.run(s.actividad_id, s.fecha, s.hora, s.capacidad || 6);
          if (result.changes > 0) created++;
          else skipped++;
        } catch (e) {
          errors_list.push({ slot: s, error: e.message });
        }
      }
    });

    transaction();
    success(res, {
      created,
      skipped,
      errors: errors_list.length,
      error_details: errors_list.length > 0 ? errors_list : undefined,
      total_enviados: slotsData.length,
    }, null, 201);
  } catch (err) {
    console.error('Error bulk creating slots:', err);
    error(res, 'SERVER_ERROR', 'Error creating slots', 500);
  }
});

// GET availability summary/alerts across all products (for AI dashboard)
router.get('/api/v1/disponibilidad/resumen', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const hoy = new Date().toISOString().split('T')[0];
    const en7dias = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const en30dias = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Products with active slots
    const actividades = db.prepare('SELECT id, nombre, slug FROM actividades WHERE activa = 1').all();

    const resumen = actividades.map(act => {
      // Next 7 days
      const slots7d = db.prepare(`
        SELECT * FROM horarios_slots
        WHERE actividad_id = ? AND fecha >= ? AND fecha <= ? AND bloqueado = 0
      `).all(act.id, hoy, en7dias);

      // Next 30 days
      const slots30d = db.prepare(`
        SELECT * FROM horarios_slots
        WHERE actividad_id = ? AND fecha >= ? AND fecha <= ? AND bloqueado = 0
      `).all(act.id, hoy, en30dias);

      const cap7 = slots7d.reduce((s, sl) => s + sl.capacidad, 0);
      const res7 = slots7d.reduce((s, sl) => s + sl.reservados, 0);
      const cap30 = slots30d.reduce((s, sl) => s + sl.capacidad, 0);
      const res30 = slots30d.reduce((s, sl) => s + sl.reservados, 0);

      // Days without any slots in next 7 days
      const diasConSlots = new Set(slots7d.map(s => s.fecha));
      const diasSinSlots = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(Date.now() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        if (!diasConSlots.has(d)) diasSinSlots.push(d);
      }

      // Bloqueos próximos
      const bloqueos = db.prepare(`
        SELECT fecha, motivo FROM bloqueos_fechas
        WHERE (actividad_id = ? OR actividad_id IS NULL) AND fecha >= ? AND fecha <= ?
      `).all(act.id, hoy, en30dias);

      // Determine alert level
      let alerta = 'ok';
      if (slots7d.length === 0) alerta = 'sin_slots_7d';
      else if (cap7 > 0 && res7 / cap7 >= 0.9) alerta = 'casi_lleno_7d';
      else if (cap7 > 0 && res7 / cap7 >= 0.7) alerta = 'alta_ocupacion_7d';

      return {
        actividad_id: act.id,
        nombre: act.nombre,
        slug: act.slug,
        alerta,
        proximos_7_dias: {
          slots: slots7d.length,
          capacidad: cap7,
          reservados: res7,
          disponibles: cap7 - res7,
          ocupacion_pct: cap7 > 0 ? Math.round((res7 / cap7) * 100) : 0,
          dias_sin_slots: diasSinSlots,
        },
        proximos_30_dias: {
          slots: slots30d.length,
          capacidad: cap30,
          reservados: res30,
          disponibles: cap30 - res30,
          ocupacion_pct: cap30 > 0 ? Math.round((res30 / cap30) * 100) : 0,
        },
        bloqueos_proximos: bloqueos,
      };
    });

    // Global alerts
    const alertas = resumen.filter(r => r.alerta !== 'ok');

    success(res, {
      fecha_consulta: hoy,
      total_productos: actividades.length,
      productos_con_alerta: alertas.length,
      alertas: alertas.map(a => `${a.nombre}: ${a.alerta}`),
      detalle: resumen,
    });
  } catch (err) {
    console.error('Error generating resumen:', err);
    error(res, 'SERVER_ERROR', 'Error generating summary', 500);
  }
});

// POST create plantillas from natural language description
router.post('/api/v1/plantillas/texto', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const { actividad_id, texto } = req.body;
    if (!actividad_id || !texto) {
      return error(res, 'VALIDATION_ERROR', 'actividad_id y texto son requeridos', 400);
    }

    const db = getDb();
    const t = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Parse days
    const dayMap = {
      'lunes': 1, 'martes': 2, 'miercoles': 3, 'jueves': 4,
      'viernes': 5, 'sabado': 6, 'domingo': 0,
      'lun': 1, 'mar': 2, 'mie': 3, 'jue': 4, 'vie': 5, 'sab': 6, 'dom': 0,
    };

    let dias = [];
    // "lunes a viernes" pattern
    const rangeMatch = t.match(/(lunes|martes|miercoles|jueves|viernes|sabado|domingo|lun|mar|mie|jue|vie|sab|dom)\s+a\s+(lunes|martes|miercoles|jueves|viernes|sabado|domingo|lun|mar|mie|jue|vie|sab|dom)/);
    if (rangeMatch) {
      const start = dayMap[rangeMatch[1]];
      const end = dayMap[rangeMatch[2]];
      if (start !== undefined && end !== undefined) {
        if (start <= end) {
          for (let d = start; d <= end; d++) dias.push(d);
        } else {
          // Wrap around (e.g., viernes a lunes)
          for (let d = start; d <= 6; d++) dias.push(d);
          for (let d = 0; d <= end; d++) dias.push(d);
        }
      }
    }
    // "lunes, miercoles, viernes" pattern
    if (dias.length === 0) {
      for (const [name, idx] of Object.entries(dayMap)) {
        if (t.includes(name)) dias.push(idx);
      }
      dias = [...new Set(dias)];
    }
    // "todos los dias" or "toda la semana"
    if (t.includes('todos los dias') || t.includes('toda la semana')) {
      dias = [0, 1, 2, 3, 4, 5, 6];
    }

    if (dias.length === 0) {
      return error(res, 'PARSE_ERROR', 'No se pudieron identificar los días. Usa: "Lunes a Viernes" o "Lunes, Miércoles, Viernes" o "Todos los días"', 400);
    }

    // Parse hours (08:00-16:00 or 8am-4pm)
    const hourMatch = t.match(/(\d{1,2}:\d{2})\s*[-a]\s*(\d{1,2}:\d{2})/);
    let horaDesde = '08:00', horaHasta = '16:00';
    if (hourMatch) {
      horaDesde = hourMatch[1].length === 4 ? '0' + hourMatch[1] : hourMatch[1];
      horaHasta = hourMatch[2].length === 4 ? '0' + hourMatch[2] : hourMatch[2];
    }

    // Parse interval
    let intervalo = 60;
    const intMatch = t.match(/cada\s+(\d+)\s*(min|hora|h)/);
    if (intMatch) {
      const val = parseInt(intMatch[1]);
      const unit = intMatch[2];
      if (unit === 'hora' || unit === 'h') intervalo = val * 60;
      else intervalo = val;
    }

    // Parse capacity
    let capacidad = 6;
    const capMatch = t.match(/(\d+)\s*(cupo|persona|pax|lugar)/);
    if (capMatch) capacidad = parseInt(capMatch[1]);

    // Generate time slots
    const times = [];
    const [fh, fm] = horaDesde.split(':').map(Number);
    const [th, tm] = horaHasta.split(':').map(Number);
    let current = fh * 60 + fm;
    const end = th * 60 + tm;
    while (current <= end) {
      const h = String(Math.floor(current / 60)).padStart(2, '0');
      const m = String(current % 60).padStart(2, '0');
      times.push(`${h}:${m}`);
      current += intervalo;
    }

    // Create plantillas
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO plantillas_horario (actividad_id, dia_semana, hora, capacidad, activa)
      VALUES (?, ?, ?, ?, 1)
    `);

    let created = 0;
    const DAYS_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

    const transaction = db.transaction(() => {
      for (const dia of dias) {
        for (const hora of times) {
          const result = insertStmt.run(actividad_id, dia, hora, capacidad);
          if (result.changes > 0) created++;
        }
      }
    });
    transaction();

    success(res, {
      created,
      interpretacion: {
        dias: dias.map(d => DAYS_NAMES[d]),
        hora_desde: horaDesde,
        hora_hasta: horaHasta,
        intervalo_min: intervalo,
        capacidad,
        horarios_por_dia: times.length,
        total_plantillas: dias.length * times.length,
      },
      texto_original: texto,
    }, null, 201);
  } catch (err) {
    console.error('Error parsing text plantilla:', err);
    error(res, 'SERVER_ERROR', 'Error creating plantillas from text', 500);
  }
});

// Get plantillas
router.get('/api/v1/plantillas', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const db = getDb();
    const plantillas = db.prepare(`
      SELECT p.*, a.nombre as actividad_nombre
      FROM plantillas_horario p
      JOIN actividades a ON a.id = p.actividad_id
      WHERE p.activa = 1
      ORDER BY p.actividad_id, p.dia_semana, p.hora
    `).all();
    success(res, plantillas);
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error listing plantillas', 500);
  }
});

// Create plantilla
router.post('/api/v1/plantillas', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const { actividad_id, dia_semana, hora, capacidad = 6 } = req.body;
    if (actividad_id === undefined || dia_semana === undefined || !hora) {
      return error(res, 'VALIDATION_ERROR', 'actividad_id, dia_semana, hora son requeridos', 400);
    }
    const plantilla = create('plantillas_horario', {
      actividad_id: parseInt(actividad_id),
      dia_semana: parseInt(dia_semana),
      hora,
      capacidad: parseInt(capacidad) || 6,
      activa: 1,
    });
    success(res, plantilla, null, 201);
  } catch (err) {
    console.error('Error creating plantilla:', err);
    error(res, 'SERVER_ERROR', 'Error creating plantilla', 500);
  }
});

// Update plantilla
router.put('/api/v1/plantillas/:id', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const existing = findById('plantillas_horario', req.params.id);
    if (!existing) return error(res, 'NOT_FOUND', 'Plantilla no encontrada', 404);

    const data = {};
    if (req.body.hora !== undefined) data.hora = req.body.hora;
    if (req.body.capacidad !== undefined) data.capacidad = parseInt(req.body.capacidad) || 6;
    if (req.body.dia_semana !== undefined) data.dia_semana = parseInt(req.body.dia_semana);
    if (req.body.activa !== undefined) data.activa = req.body.activa ? 1 : 0;

    const updated = update('plantillas_horario', req.params.id, data);
    success(res, updated);
  } catch (err) {
    console.error('Error updating plantilla:', err);
    error(res, 'SERVER_ERROR', 'Error updating plantilla', 500);
  }
});

// Delete plantilla
router.delete('/api/v1/plantillas/:id', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const existing = findById('plantillas_horario', req.params.id);
    if (!existing) return error(res, 'NOT_FOUND', 'Plantilla no encontrada', 404);

    const removed = update('plantillas_horario', req.params.id, { activa: 0 }); //Soft delete or remove? In server.js line 2360: const removed = remove('plantillas_horario', req.params.id);
    //Wait, in server.js line 2360 it was remove! Let's import remove and use it.
    const { remove } = require('../db/database');
    const result = remove('plantillas_horario', req.params.id);
    success(res, result);
  } catch (err) {
    console.error('Error deleting plantilla:', err);
    error(res, 'SERVER_ERROR', 'Error deleting plantilla', 500);
  }
});

// Generate slots for a month from plantillas
router.post('/api/v1/plantillas/generar', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const { mes, actividad_id } = req.body; // mes = "2026-03"
    if (!mes) return error(res, 'VALIDATION_ERROR', 'mes is required (e.g. "2026-03")', 400);

    const db = getDb();
    const [year, month] = mes.split('-').map(Number);

    // Get active plantillas
    let plantillas;
    if (actividad_id) {
      plantillas = db.prepare('SELECT * FROM plantillas_horario WHERE activa = 1 AND actividad_id = ?').all(actividad_id);
    } else {
      plantillas = db.prepare('SELECT * FROM plantillas_horario WHERE activa = 1').all();
    }

    if (plantillas.length === 0) {
      return error(res, 'NO_TEMPLATES', 'No hay plantillas activas para generar', 400);
    }

    // Generate all dates in the month
    const daysInMonth = new Date(year, month, 0).getDate();
    let created = 0;

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO horarios_slots (actividad_id, fecha, hora, capacidad, reservados, bloqueado)
      VALUES (?, ?, ?, ?, 0, 0)
    `);

    const transaction = db.transaction(() => {
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month - 1, day);
        const dayOfWeek = date.getDay(); // 0=Sun ... 6=Sat
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        for (const p of plantillas) {
          if (p.dia_semana === dayOfWeek) {
            const result = insertStmt.run(p.actividad_id, dateStr, p.hora, p.capacidad);
            if (result.changes > 0) created++;
          }
        }
      }
    });

    transaction();

    success(res, { created, mes, plantillas: plantillas.length }, null, 201);
  } catch (err) {
    console.error('Error generating slots:', err);
    error(res, 'SERVER_ERROR', 'Error generating slots', 500);
  }
});

// ── BLOQUEOS ENDPOINTS ──

// List bloqueos (optionally filter by actividad_id or date range)
router.get('/api/v1/bloqueos', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const db = getDb();
    const { actividad_id, desde, hasta } = req.query;
    let sql = 'SELECT b.*, a.nombre as actividad_nombre FROM bloqueos_fechas b LEFT JOIN actividades a ON a.id = b.actividad_id WHERE 1=1';
    const params = [];
    if (actividad_id) { sql += ' AND b.actividad_id = ?'; params.push(actividad_id); }
    if (desde) { sql += ' AND b.fecha >= ?'; params.push(desde); }
    if (hasta) { sql += ' AND b.fecha <= ?'; params.push(hasta); }
    sql += ' ORDER BY b.fecha ASC';
    const bloqueos = db.prepare(sql).all(...params);
    success(res, bloqueos);
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error listing bloqueos', 500);
  }
});

// Create bloqueo (actividad_id null = global block)
router.post('/api/v1/bloqueos', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const { actividad_id, fecha, motivo } = req.body;
    if (!fecha) return error(res, 'VALIDATION_ERROR', 'fecha es requerida', 400);
    const bloqueo = create('bloqueos_fechas', {
      actividad_id: actividad_id || null,
      fecha,
      motivo: motivo || null,
    });
    success(res, bloqueo, null, 201);
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error creating bloqueo', 500);
  }
});

// Delete bloqueo
router.delete('/api/v1/bloqueos/:id', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const { remove } = require('../db/database');
    const removed = remove('bloqueos_fechas', req.params.id);
    if (!removed) return error(res, 'NOT_FOUND', 'Bloqueo not found', 404);
    success(res, { deleted: true, id: req.params.id });
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error deleting bloqueo', 500);
  }
});

// Auto-generate slots for a date range from active plantillas (called by calendar navigation)
router.post('/api/v1/slots/auto-generate', requireAuth, requireRole('admin', 'vendedor'), (req, res) => {
  try {
    const { desde, hasta, actividad_id } = req.body;
    if (!desde || !hasta) return error(res, 'VALIDATION_ERROR', 'desde y hasta son requeridos', 400);

    const db = getDb();

    // Get active plantillas
    let plantillas;
    if (actividad_id) {
      plantillas = db.prepare('SELECT * FROM plantillas_horario WHERE activa = 1 AND actividad_id = ?').all(actividad_id);
    } else {
      plantillas = db.prepare('SELECT * FROM plantillas_horario WHERE activa = 1').all();
    }

    if (plantillas.length === 0) {
      return success(res, { created: 0, message: 'No hay plantillas activas' });
    }

    // Get bloqueos for the range
    const bloqueos = db.prepare('SELECT actividad_id, fecha FROM bloqueos_fechas WHERE fecha >= ? AND fecha <= ?').all(desde, hasta);
    const bloqueosSet = new Set(bloqueos.map(b => `${b.actividad_id || 'all'}-${b.fecha}`));

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO horarios_slots (actividad_id, fecha, hora, capacidad, reservados, bloqueado)
      VALUES (?, ?, ?, ?, 0, 0)
    `);

    let created = 0;
    const startDate = new Date(desde + 'T12:00:00');
    const endDate = new Date(hasta + 'T12:00:00');

    const transaction = db.transaction(() => {
      const d = new Date(startDate);
      while (d <= endDate) {
        const dayOfWeek = d.getDay();
        const dateStr = d.toISOString().split('T')[0];

        for (const p of plantillas) {
          // Check vigencia
          if (p.fecha_inicio && dateStr < p.fecha_inicio) continue;
          if (p.fecha_fin && dateStr > p.fecha_fin) continue;

          if (p.dia_semana === dayOfWeek) {
            // Check bloqueos (specific + global)
            if (bloqueosSet.has(`${p.actividad_id}-${dateStr}`) || bloqueosSet.has(`all-${dateStr}`)) continue;

            const result = insertStmt.run(p.actividad_id, dateStr, p.hora, p.capacidad);
            if (result.changes > 0) created++;
          }
        }
        d.setDate(d.getDate() + 1);
      }
    });

    transaction();
    success(res, { created, desde, hasta });
  } catch (err) {
    console.error('Error auto-generating slots:', err);
    error(res, 'SERVER_ERROR', 'Error generating slots', 500);
  }
});

// ── PARTNER PAYPAL ENDPOINTS ──

// Partner: Get PayPal config (reuses same global config)
router.get('/api/v1/partner/paypal-config', requireAuth, (req, res) => {
  try {
    if (!isPartner(req)) return error(res, 'FORBIDDEN', 'Solo para partners', 403);
    const db = getDb();

    const paypalEnabledDB = db.prepare("SELECT valor FROM configuracion_pagos WHERE clave = 'paypal_enabled'").get();
    const paypalClientIdDB = db.prepare("SELECT valor FROM configuracion_pagos WHERE clave = 'paypal_client_id'").get();
    const paypalModeDB = db.prepare("SELECT valor FROM configuracion_pagos WHERE clave = 'paypal_mode'").get();

    const ppClientId = paypalClientIdDB?.valor || process.env.PAYPAL_CLIENT_ID || '';
    const ppEnabled = (paypalEnabledDB?.valor === '1' || paypalEnabledDB?.valor === 'true') || !!process.env.PAYPAL_CLIENT_ID;
    const ppMode = paypalModeDB?.valor || process.env.PAYPAL_MODE || 'sandbox';

    success(res, {
      paypal_enabled: ppEnabled,
      paypal_client_id: ppEnabled ? ppClientId : null,
      paypal_mode: ppMode,
    });
  } catch (err) {
    console.error('Error loading partner PayPal config:', err);
    error(res, 'SERVER_ERROR', 'Error loading PayPal config', 500);
  }
});

// Partner: Create tour + PayPal order in one step
router.post('/api/v1/partner/paypal/create-order', requireAuth, async (req, res1) => {
  try {
    if (!isPartner(req)) return error(res1, 'FORBIDDEN', 'Solo para partners', 403);
    if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
      return error(res1, 'CONFIG_ERROR', 'PayPal no está configurado', 500);
    }

    const { tourData } = req.body;
    if (!tourData || !tourData.actividad) {
      return error(res1, 'VALIDATION_ERROR', 'Datos del tour requeridos', 400);
    }

    const db = getDb();

    // Get the actividad to compute price
    const actividad = db.prepare('SELECT * FROM actividades WHERE nombre = ? AND activa = 1').get(tourData.actividad);
    if (!actividad) return error(res1, 'NOT_FOUND', 'Actividad no encontrada', 404);

    const pax = parseInt(tourData.pax) || 1;
    const precioBase = actividad.precio_base || 0;
    const precioNeto = precioBase * pax;
    const itbm = Math.round(precioNeto * 0.07 * 100) / 100;
    const precioTotal = Math.round((precioNeto + itbm) * 100) / 100;

    if (precioTotal <= 0) {
      return error(res1, 'VALIDATION_ERROR', 'El precio del tour debe ser mayor a 0 para pagar con PayPal', 400);
    }

    // Create the tour record first
    const tourRecord = create('reservas_tours', {
      cliente: tourData.cliente,
      whatsapp: tourData.whatsapp || '',
      email_cliente: tourData.email_cliente || '',
      actividad: tourData.actividad,
      fecha: tourData.fecha || '',
      hora: tourData.hora || '',
      pax: pax,
      notas: tourData.notas || '',
      fuente: 'partner-paypal',
      estatus: 'Por Aprobar',
      vendedor: req.user.vendedor || req.user.nombre,
      solicitado_por: tourData.solicitado_por || req.user.nombre,
      gestionado_por: tourData.gestionado_por || req.user.nombre,
      precio_ingreso: precioTotal,
      hotel: tourData.hotel || '',
      nacionalidad: tourData.nacionalidad || '',
      idioma: tourData.idioma || '',
      edades: tourData.edades || '',
    });

    // If slot_id provided, validate capacity and update slot reservados
    if (tourData.slot_id) {
      const slot = db.prepare('SELECT * FROM horarios_slots WHERE id = ? AND bloqueado = 0').get(tourData.slot_id);
      if (slot) {
        if (slot.reservados + pax > slot.capacidad) {
          // Rollback tour creation
          try { db.prepare('DELETE FROM reservas_tours WHERE id = ?').run(tourRecord.id); } catch {}
          return error(res1, 'SLOT_FULL', `Solo quedan ${slot.capacidad - slot.reservados} cupos`, 400);
        }
        db.prepare('UPDATE horarios_slots SET reservados = reservados + ? WHERE id = ?').run(pax, slot.id);
      }
    }

    // Create PayPal order
    const accessToken = await getPayPalAccessToken();
    const description = `${tourData.actividad} - ${tourData.fecha || 'TBD'} (${pax} pax) - ${tourData.cliente}`;

    const orderRes = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: `TOUR-${tourRecord.id}`,
          description: description.substring(0, 127),
          amount: {
            currency_code: 'USD',
            value: precioTotal.toFixed(2),
            breakdown: {
              item_total: { currency_code: 'USD', value: precioNeto.toFixed(2) },
              tax_total: { currency_code: 'USD', value: itbm.toFixed(2) },
            },
          },
        }],
        application_context: {
          brand_name: 'Mahana Tours',
          landing_page: 'NO_PREFERENCE',
          user_action: 'PAY_NOW',
        },
      }),
    });

    const orderData = await orderRes.json();
    if (orderData.id) {
      // Store PayPal order ID in tour
      update('reservas_tours', tourRecord.id, { paypal_order_id: orderData.id });

      success(res1, { orderID: orderData.id, tourId: tourRecord.id, precioTotal });
    } else {
      // Rollback: delete the tour if PayPal order failed
      console.error('PayPal create order error:', orderData);
      try { db.prepare('DELETE FROM reservas_tours WHERE id = ?').run(tourRecord.id); } catch {}
      error(res1, 'PAYPAL_ERROR', orderData.message || 'Error creating PayPal order', 500);
    }
  } catch (err) {
    console.error('Partner PayPal create order error:', err);
    error(res1, 'SERVER_ERROR', 'Error creating PayPal order', 500);
  }
});

// Partner: Capture PayPal order and mark tour as paid
router.post('/api/v1/partner/paypal/capture-order', requireAuth, async (req, res1) => {
  try {
    if (!isPartner(req)) return error(res1, 'FORBIDDEN', 'Solo para partners', 403);

    const { orderID, tourId } = req.body;
    if (!orderID || !tourId) return error(res1, 'VALIDATION_ERROR', 'orderID y tourId requeridos', 400);

    // Validate orderID format (must be alphanumeric + dashes, max 50 chars)
    if (!/^[A-Z0-9-]{10,50}$/i.test(orderID)) {
      return error(res1, 'VALIDATION_ERROR', 'Formato de orderID inválido', 400);
    }

    const db = getDb();
    const tour = findById('reservas_tours', tourId);
    if (!tour) return error(res1, 'NOT_FOUND', 'Tour no encontrado', 404);

    // Verify this tour belongs to the partner
    if (tour.vendedor !== req.user.vendedor && tour.vendedor !== req.user.nombre) {
      return error(res1, 'FORBIDDEN', 'Este tour no te pertenece', 403);
    }

    const accessToken = await getPayPalAccessToken();
    const captureRes = await fetch(`${PAYPAL_API}/v2/checkout/orders/${encodeURIComponent(orderID)}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    const captureData = await captureRes.json();

    if (captureData.status === 'COMPLETED') {
      const payerId = captureData.payer?.payer_id || '';
      const payerEmail = captureData.payer?.email_address || '';
      const now = new Date().toISOString().split('T')[0];

      // Calculate CxC amounts
      const cxcData = calcCxC(tour);

      // Update tour: mark as Pagado, set PayPal info, mark CxC as Pagada
      update('reservas_tours', tourId, {
        estatus: 'Pagado',
        paypal_order_id: orderID,
        paypal_payer_id: payerId,
        paypal_payer_email: payerEmail,
        ...cxcData,
        cxc_estatus: 'Pagada',
        cxc_fecha_emision: now,
        cxc_fecha_pago: now,
        notas: `${tour.notas || ''}\n[PayPal] Pagado por partner. Order: ${orderID}. Email: ${payerEmail}`.trim(),
      });

      // Send notification
      notifications.onTourCreated({
        ...tour,
        estatus: 'Pagado',
        notas: `[PayPal Partner] Pagado directo. Order: ${orderID}`,
      }).catch(err => console.error('Partner PayPal notification error:', err.message));

      success(res1, {
        tourId,
        estado: 'Pagado',
        paypal_status: 'COMPLETED',
        mensaje: '¡Pago completado! El tour ha sido registrado y pagado.',
      });
    } else {
      console.error('Partner PayPal capture failed:', captureData);
      error(res1, 'PAYPAL_ERROR', captureData.message || 'Payment not completed', 400);
    }
  } catch (err) {
    console.error('Partner PayPal capture error:', err);
    error(res1, 'SERVER_ERROR', 'Error capturing payment', 500);
  }
});

// Generate review link for a tour
router.post('/api/v1/tours/:id/link-resena', requireAuth, (req, res) => {
  try {
    const tour = findById('reservas_tours', req.params.id);
    if (!tour) return error(res, 'NOT_FOUND', 'Tour no encontrado', 404);

    // Return existing code if already generated
    if (tour.review_codigo) {
      return success(res, {
        codigo: tour.review_codigo,
        url: `/resena/${tour.review_codigo}`
      });
    }

    const code = generateReviewCode();
    update('reservas_tours', req.params.id, { review_codigo: code });

    success(res, {
      codigo: code,
      url: `/resena/${code}`
    }, null, 201);
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error generating review link', 500);
  }
});

module.exports = router;
