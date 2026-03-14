const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { getDb, findAll, findById, create, update, remove } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3100;
const API_KEY = process.env.API_KEY || 'mahana-dev-key-2026';

// ── Middleware ──

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Rate limiting
const requestCounts = {};
const RATE_LIMIT = 200;
const RATE_WINDOW = 60 * 1000;

app.use('/api/', (req, res, next) => {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  if (!requestCounts[ip]) {
    requestCounts[ip] = { count: 1, startTime: now };
  } else if (now - requestCounts[ip].startTime > RATE_WINDOW) {
    requestCounts[ip] = { count: 1, startTime: now };
  } else {
    requestCounts[ip].count++;
    if (requestCounts[ip].count > RATE_LIMIT) {
      return res.status(429).json({ success: false, error: { code: 'RATE_LIMIT', message: 'Too many requests. Limit: 200/min' } });
    }
  }
  next();
});

// API Key auth for write operations
function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key || key !== API_KEY) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Valid X-API-Key header required' }
    });
  }
  next();
}

// ── Helpers ──

function success(res, data, meta, status = 200) {
  const response = { success: true, data };
  if (meta) response.meta = meta;
  return res.status(status).json(response);
}

function error(res, code, message, status = 400, fields) {
  const err = { code, message };
  if (fields) err.fields = fields;
  return res.status(status).json({ success: false, error: err });
}

const sanitize = (str) => {
  if (typeof str !== 'string') return '';
  return str.slice(0, 2000).replace(/<[^>]*>/g, '');
};

// ── API Status ──

app.get('/api/v1/api-status', (req, res) => {
  success(res, {
    status: 'ok',
    version: '2.0.0',
    name: 'Mahana Portal API',
    timestamp: new Date().toISOString()
  });
});

// ══════════════════════════════════════
// TOURS ENDPOINTS
// ══════════════════════════════════════

app.get('/api/v1/tours', (req, res) => {
  try {
    const { estatus, actividad, responsable, vendedor, fecha_desde, fecha_hasta, cliente, page = 1, limit = 50 } = req.query;
    const where = {};
    if (estatus) where.estatus = estatus;
    if (actividad) where.actividad = actividad;
    if (responsable) where.responsable_like = responsable;
    if (vendedor) where.vendedor_like = vendedor;
    if (cliente) where.cliente_like = cliente;
    if (fecha_desde) where.fecha_gte = fecha_desde;
    if (fecha_hasta) where.fecha_lte = fecha_hasta;

    const result = findAll('reservas_tours', { where, page: Number(page), limit: Number(limit), orderBy: 'fecha DESC, hora DESC' });
    success(res, result.data, result.meta);
  } catch (err) {
    console.error('Error listing tours:', err);
    error(res, 'SERVER_ERROR', 'Error listing tours', 500);
  }
});

app.get('/api/v1/tours/:id', (req, res) => {
  try {
    const tour = findById('reservas_tours', req.params.id);
    if (!tour) return error(res, 'NOT_FOUND', `Tour ${req.params.id} not found`, 404);
    success(res, tour);
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error fetching tour', 500);
  }
});

app.post('/api/v1/tours', requireApiKey, (req, res) => {
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
      'ganancia_mahana', 'notas', 'gestionado_por', 'fuente'];

    for (const field of allowed) {
      if (req.body[field] !== undefined && req.body[field] !== null) {
        data[field] = typeof req.body[field] === 'string' ? sanitize(req.body[field]) : req.body[field];
      }
    }

    // Auto-calculate ganancia if not provided
    if (data.precio_ingreso !== undefined && data.costo_pago !== undefined && data.ganancia_mahana === undefined) {
      data.ganancia_mahana = (data.precio_ingreso || 0) - (data.costo_pago || 0);
    }

    if (!data.fuente) data.fuente = 'api';

    const tour = create('reservas_tours', data);
    success(res, tour, null, 201);
  } catch (err) {
    console.error('Error creating tour:', err);
    error(res, 'SERVER_ERROR', 'Error creating tour', 500);
  }
});

app.put('/api/v1/tours/:id', requireApiKey, (req, res) => {
  try {
    const existing = findById('reservas_tours', req.params.id);
    if (!existing) return error(res, 'NOT_FOUND', `Tour ${req.params.id} not found`, 404);

    const data = {};
    const allowed = ['fecha', 'hora', 'cliente', 'whatsapp', 'estatus', 'vendedor', 'actividad',
      'responsable', 'precio_ingreso', 'costo_pago', 'comision_pct', 'monto_comision',
      'ganancia_mahana', 'notas', 'gestionado_por'];

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        data[field] = typeof req.body[field] === 'string' ? sanitize(req.body[field]) : req.body[field];
      }
    }

    const updated = update('reservas_tours', req.params.id, data);
    success(res, updated);
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error updating tour', 500);
  }
});

app.patch('/api/v1/tours/:id/status', requireApiKey, (req, res) => {
  try {
    const { estatus } = req.body;
    if (!estatus) return error(res, 'VALIDATION_ERROR', 'Field "estatus" is required', 400, ['estatus']);

    const valid = ['Consulta', 'Reservado', 'Pagado', 'Cancelado', 'Cerrado'];
    if (!valid.includes(estatus)) {
      return error(res, 'VALIDATION_ERROR', `Invalid estatus. Valid: ${valid.join(', ')}`, 400, ['estatus']);
    }

    const existing = findById('reservas_tours', req.params.id);
    if (!existing) return error(res, 'NOT_FOUND', `Tour ${req.params.id} not found`, 404);

    const updated = update('reservas_tours', req.params.id, { estatus });
    success(res, updated);
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error updating status', 500);
  }
});

app.delete('/api/v1/tours/:id', requireApiKey, (req, res) => {
  try {
    const removed = remove('reservas_tours', req.params.id);
    if (!removed) return error(res, 'NOT_FOUND', `Tour ${req.params.id} not found`, 404);
    success(res, { deleted: true, id: req.params.id });
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error deleting tour', 500);
  }
});

// ══════════════════════════════════════
// ESTADÍAS ENDPOINTS
// ══════════════════════════════════════

app.get('/api/v1/estadias', (req, res) => {
  try {
    const { estado, propiedad, responsable, cliente, check_in_desde, check_in_hasta, page = 1, limit = 50 } = req.query;
    const where = {};
    if (estado) where.estado_like = estado;
    if (propiedad) where.propiedad_like = propiedad;
    if (responsable) where.responsable_like = responsable;
    if (cliente) where.cliente_like = cliente;
    if (check_in_desde) where.check_in_gte = check_in_desde;
    if (check_in_hasta) where.check_in_lte = check_in_hasta;

    const result = findAll('reservas_estadias', { where, page: Number(page), limit: Number(limit), orderBy: 'id DESC' });
    success(res, result.data, result.meta);
  } catch (err) {
    console.error('Error listing estadias:', err);
    error(res, 'SERVER_ERROR', 'Error listing estadias', 500);
  }
});

app.get('/api/v1/estadias/:id', (req, res) => {
  try {
    const estadia = findById('reservas_estadias', req.params.id);
    if (!estadia) return error(res, 'NOT_FOUND', `Estadia ${req.params.id} not found`, 404);
    success(res, estadia);
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error fetching estadia', 500);
  }
});

app.post('/api/v1/estadias', requireApiKey, (req, res) => {
  try {
    const { cliente, propiedad, check_in } = req.body;
    const missing = [];
    if (!cliente) missing.push('cliente');
    if (!propiedad) missing.push('propiedad');
    if (!check_in) missing.push('check_in');
    if (missing.length > 0) {
      return error(res, 'VALIDATION_ERROR', `Missing required fields: ${missing.join(', ')}`, 400, missing);
    }

    const data = {};
    const allowed = ['fecha_solicitud', 'cliente', 'whatsapp', 'email', 'propiedad', 'tipo',
      'check_in', 'check_out', 'huespedes', 'habitaciones', 'precio_cotizado', 'precio_final',
      'comision_pct', 'monto_comision', 'estado', 'responsable', 'notas', 'fuente'];

    for (const field of allowed) {
      if (req.body[field] !== undefined && req.body[field] !== null) {
        data[field] = typeof req.body[field] === 'string' ? sanitize(req.body[field]) : req.body[field];
      }
    }

    // Auto-calculate commission if precio_final and comision_pct provided
    if (data.precio_final && data.comision_pct && !data.monto_comision) {
      data.monto_comision = data.precio_final * (data.comision_pct / 100);
    }

    if (!data.fuente) data.fuente = 'api';
    if (!data.comision_pct) data.comision_pct = 20;

    const estadia = create('reservas_estadias', data);
    success(res, estadia, null, 201);
  } catch (err) {
    console.error('Error creating estadia:', err);
    error(res, 'SERVER_ERROR', 'Error creating estadia', 500);
  }
});

app.put('/api/v1/estadias/:id', requireApiKey, (req, res) => {
  try {
    const existing = findById('reservas_estadias', req.params.id);
    if (!existing) return error(res, 'NOT_FOUND', `Estadia ${req.params.id} not found`, 404);

    const data = {};
    const allowed = ['cliente', 'whatsapp', 'email', 'propiedad', 'tipo', 'check_in', 'check_out',
      'huespedes', 'habitaciones', 'precio_cotizado', 'precio_final', 'comision_pct',
      'monto_comision', 'estado', 'responsable', 'notas'];

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        data[field] = typeof req.body[field] === 'string' ? sanitize(req.body[field]) : req.body[field];
      }
    }

    const updated = update('reservas_estadias', req.params.id, data);
    success(res, updated);
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error updating estadia', 500);
  }
});

app.patch('/api/v1/estadias/:id/status', requireApiKey, (req, res) => {
  try {
    const { estado } = req.body;
    if (!estado) return error(res, 'VALIDATION_ERROR', 'Field "estado" is required', 400, ['estado']);

    const valid = ['Solicitada', 'Cotizada', 'Confirmada', 'Pagada', 'Cancelada'];
    if (!valid.includes(estado)) {
      return error(res, 'VALIDATION_ERROR', `Invalid estado. Valid: ${valid.join(', ')}`, 400, ['estado']);
    }

    const existing = findById('reservas_estadias', req.params.id);
    if (!existing) return error(res, 'NOT_FOUND', `Estadia ${req.params.id} not found`, 404);

    const updated = update('reservas_estadias', req.params.id, { estado });
    success(res, updated);
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error updating status', 500);
  }
});

app.delete('/api/v1/estadias/:id', requireApiKey, (req, res) => {
  try {
    const removed = remove('reservas_estadias', req.params.id);
    if (!removed) return error(res, 'NOT_FOUND', `Estadia ${req.params.id} not found`, 404);
    success(res, { deleted: true, id: req.params.id });
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error deleting estadia', 500);
  }
});

// ══════════════════════════════════════
// DASHBOARD / CATALOG ENDPOINTS
// ══════════════════════════════════════

app.get('/api/v1/dashboard', (req, res) => {
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
        COALESCE(SUM(CASE WHEN precio_ingreso IS NOT NULL THEN precio_ingreso ELSE 0 END), 0) as ingresos,
        COALESCE(SUM(CASE WHEN ganancia_mahana IS NOT NULL THEN ganancia_mahana ELSE 0 END), 0) as ganancia,
        SUM(CASE WHEN estatus = 'Pagado' THEN 1 ELSE 0 END) as pagados,
        SUM(CASE WHEN estatus = 'Reservado' THEN 1 ELSE 0 END) as reservados,
        SUM(CASE WHEN estatus = 'Consulta' THEN 1 ELSE 0 END) as consultas
      FROM reservas_tours
      WHERE 1=1 ${tourDateFilter}
    `).get(...tourDateParams);

    const toursMahana = db.prepare(`
      SELECT 
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN precio_ingreso IS NOT NULL THEN precio_ingreso ELSE 0 END), 0) as ingresos,
        COALESCE(SUM(CASE WHEN ganancia_mahana IS NOT NULL THEN ganancia_mahana ELSE 0 END), 0) as ganancia
      FROM reservas_tours WHERE vendedor = 'Mahana Tours' ${tourDateFilter}
    `).get(...tourDateParams);

    const ventasPartners = db.prepare(`
      SELECT 
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN precio_ingreso IS NOT NULL THEN precio_ingreso ELSE 0 END), 0) as ingresos,
        COALESCE(SUM(CASE WHEN monto_comision IS NOT NULL THEN monto_comision ELSE 0 END), 0) as comisiones
      FROM reservas_tours WHERE vendedor != 'Mahana Tours' ${tourDateFilter}
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
      SELECT COUNT(*) as total FROM reservas_tours WHERE fecha = ?
    `).get(hoy);

    // Recientes filtered by month too
    let recientesQuery;
    if (isAll) {
      recientesQuery = db.prepare(`
        SELECT 'tour' as tipo, id, cliente, actividad as descripcion, fecha, estatus as estado, 
               precio_ingreso as monto, fuente, created_at
        FROM reservas_tours
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
        FROM reservas_tours WHERE substr(fecha, 1, 4) = ?
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
        FROM reservas_tours WHERE substr(fecha, 1, 7) = ?
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
        consultas: tours.consultas
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

app.get('/api/v1/charts', (req, res) => {
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
      WHERE fecha IS NOT NULL AND fecha != ''
      GROUP BY substr(fecha, 1, 7)
      ORDER BY mes DESC
      LIMIT 12
    `).all().reverse();

    // Available months for filter
    const mesesDisponibles = db.prepare(`
      SELECT DISTINCT substr(fecha, 1, 7) as mes
      FROM reservas_tours
      WHERE fecha IS NOT NULL AND fecha != ''
      ORDER BY mes DESC
    `).all().map(r => r.mes);

    // Activity distribution (filtered by selected month)
    const porActividad = db.prepare(`
      SELECT 
        actividad as nombre,
        COUNT(*) as cantidad,
        COALESCE(SUM(precio_ingreso), 0) as ingresos
      FROM reservas_tours
      WHERE actividad IS NOT NULL AND actividad != '' ${dateFilter}
      GROUP BY actividad
      ORDER BY cantidad DESC
      LIMIT 8
    `).all(...dateParams);

    // Period stats (filtered)
    const filteredStats = isAll
      ? db.prepare('SELECT COUNT(*) as cantidad, COALESCE(SUM(precio_ingreso),0) as ingresos, COALESCE(SUM(ganancia_mahana),0) as ganancia FROM reservas_tours').get()
      : (isYear
        ? db.prepare(`SELECT COUNT(*) as cantidad, COALESCE(SUM(precio_ingreso),0) as ingresos, COALESCE(SUM(ganancia_mahana),0) as ganancia FROM reservas_tours WHERE substr(fecha,1,4) = ?`).get(filterMonth)
        : db.prepare(`SELECT COUNT(*) as cantidad, COALESCE(SUM(precio_ingreso),0) as ingresos, COALESCE(SUM(ganancia_mahana),0) as ganancia FROM reservas_tours WHERE substr(fecha,1,7) = ?`).get(filterMonth)
      );

    // Tours by period for the tours page
    const hoy = now.toISOString().split('T')[0];
    const inicioSemana = new Date(now);
    inicioSemana.setDate(inicioSemana.getDate() - inicioSemana.getDay());
    const inicioMes = hoy.substring(0, 7) + '-01';
    const inicioAnio = hoy.substring(0, 4) + '-01-01';
    const getPeriodStats = (desde) => db.prepare('SELECT COUNT(*) as cantidad, COALESCE(SUM(precio_ingreso),0) as ingresos, COALESCE(SUM(ganancia_mahana),0) as ganancia FROM reservas_tours WHERE fecha >= ?').get(desde);

    const periodos = {
      hoy: getPeriodStats(hoy),
      semana: getPeriodStats(inicioSemana.toISOString().split('T')[0]),
      mes: getPeriodStats(inicioMes),
      anio: getPeriodStats(inicioAnio),
      todo: db.prepare('SELECT COUNT(*) as cantidad, COALESCE(SUM(precio_ingreso),0) as ingresos, COALESCE(SUM(ganancia_mahana),0) as ganancia FROM reservas_tours').get()
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

    success(res, {
      ingresosPorMes, porActividad, periodos, estadiasPorEstado,
      mesesDisponibles, filteredStats, estadiasFinancieros,
      mesActual: filterMonth
    });
  } catch (err) {
    console.error('Error loading charts:', err);
    error(res, 'SERVER_ERROR', 'Error loading charts', 500);
  }
});

app.get('/api/v1/actividades', (req, res) => {
  try {
    const result = findAll('actividades', { limit: 100, orderBy: 'nombre ASC' });
    success(res, result.data, result.meta);
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error listing actividades', 500);
  }
});

app.get('/api/v1/staff', (req, res) => {
  try {
    const result = findAll('staff', { limit: 100, orderBy: 'nombre ASC' });
    success(res, result.data, result.meta);
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error listing staff', 500);
  }
});

// ══════════════════════════════════════
// LEGACY COMPATIBILITY (for existing frontend during migration)
// ══════════════════════════════════════

app.get('/api/tours', (req, res) => {
  try {
    const result = findAll('reservas_tours', { limit: 200, orderBy: 'fecha DESC' });
    res.json({ total: result.meta.total, data: result.data });
  } catch (err) {
    res.json({ total: 0, data: [] });
  }
});

app.get('/api/crm', (req, res) => {
  try {
    const result = findAll('reservas_estadias', { limit: 200, orderBy: 'id DESC' });
    res.json({ total: result.meta.total, data: result.data });
  } catch (err) {
    res.json({ total: 0, data: [] });
  }
});

app.get('/api/dashboard', (req, res) => {
  try {
    const db = getDb();
    const tours = db.prepare('SELECT COUNT(*) as total, COALESCE(SUM(precio_ingreso),0) as ingresos, COALESCE(SUM(ganancia_mahana),0) as ganancia FROM reservas_tours WHERE vendedor = ?').get('Mahana Tours');
    const ventas = db.prepare('SELECT COUNT(*) as total, COALESCE(SUM(precio_ingreso),0) as ingresos, COALESCE(SUM(monto_comision),0) as comision FROM reservas_tours WHERE vendedor != ?').get('Mahana Tours');
    const crm = db.prepare('SELECT COUNT(*) as total, SUM(CASE WHEN estado LIKE ? THEN 1 ELSE 0 END) as pendientes, SUM(CASE WHEN estado LIKE ? THEN 1 ELSE 0 END) as confirmadas FROM reservas_estadias').get('%Solicitada%', '%Confirmada%');
    res.json({ toursMahana: tours, ventasCaracol: ventas, crm });
  } catch (err) {
    res.json({ toursMahana: { total: 0, ingresos: 0, ganancia: 0 }, ventasCaracol: { total: 0, ingresos: 0, comision: 0 }, crm: { total: 0, pendientes: 0, confirmadas: 0 } });
  }
});

app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', message: 'Mahana Portal API v2.0', timestamp: new Date().toISOString() });
});

// ══════════════════════════════════════
// STATIC FILES + SPA FALLBACK
// ══════════════════════════════════════

const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath) && fs.existsSync(path.join(distPath, 'index.html'))) {
  console.log('✅ Frontend found at:', distPath);
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Endpoint not found' } });
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  console.log('⚠️ Frontend not found. API-only mode.');
  app.get('*', (req, res) => {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Endpoint not found' } });
  });
}

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Internal server error' } });
});

// Start
app.listen(PORT, () => {
  console.log(`🚀 Mahana Portal v2 running on port ${PORT}`);
  console.log(`📡 API: http://localhost:${PORT}/api/v1/api-status`);
});