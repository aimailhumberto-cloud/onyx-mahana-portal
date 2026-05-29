const express = require('express');
const router = express.Router();
const { success, error } = require('../middleware/response');
const { getDb, findAll, findById, create, update } = require('../db/database');
const { requireAuth, requireRole, isPartner } = require('../auth');
const { sanitize } = require('../utils/sanitize');
const notifications = require('../notifications');

// Helper: generate ticket code TK-0001
function generateTicketCode() {
  const db = getDb();
  const last = db.prepare("SELECT codigo FROM tickets_servicio ORDER BY id DESC LIMIT 1").get();
  if (!last) return 'TK-0001';
  const num = parseInt(last.codigo.replace('TK-', '')) + 1;
  return `TK-${String(num).padStart(4, '0')}`;
}

// Helper: generate review code (short hash)
function generateReviewCode() {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36).slice(-3);
}

// Helper: detect recurrence
function detectRecurrence(actividad, categoria) {
  if (!actividad || !categoria) return { count: 0, isRecurrent: false };
  const db = getDb();
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM tickets_servicio
    WHERE actividad = ? AND categoria = ? AND estatus != 'Cerrado'
  `).get(actividad, categoria);
  return { count: result.count, isRecurrent: result.count >= 2 };
}

// ── TICKETS ENDPOINTS ──

// List tickets
router.get('/api/v1/tickets', requireAuth, (req, res) => {
  try {
    const { estatus, categoria, prioridad, vendedor, actividad, tipo, fecha_desde, fecha_hasta, page = 1, limit = 50 } = req.query;
    const where = {};
    if (estatus) where.estatus = estatus;
    if (categoria) where.categoria = categoria;
    if (prioridad) where.prioridad = prioridad;
    if (vendedor) where.vendedor_like = vendedor;
    if (actividad) where.actividad_like = actividad;
    if (tipo) where.tipo = tipo;
    if (fecha_desde) where.created_at_gte = fecha_desde;
    if (fecha_hasta) where.created_at_lte = fecha_hasta + 'T23:59:59';

    const result = findAll('tickets_servicio', { where, page: Number(page), limit: Number(limit), orderBy: 'id DESC' });
    success(res, result.data, result.meta);
  } catch (err) {
    console.error('Error listing tickets:', err);
    error(res, 'SERVER_ERROR', 'Error listing tickets', 500);
  }
});

// Ticket stats/KPIs
router.get('/api/v1/tickets/stats', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const { mes } = req.query;
    let dateFilter = '';
    let dateParams = [];
    if (mes && mes !== 'todo') {
      dateFilter = "AND substr(created_at, 1, 7) = ?";
      dateParams = [mes];
    }

    const stats = db.prepare(`
      SELECT
        SUM(CASE WHEN estatus = 'Abierto' THEN 1 ELSE 0 END) as abiertos,
        SUM(CASE WHEN estatus = 'En Proceso' THEN 1 ELSE 0 END) as en_proceso,
        SUM(CASE WHEN estatus = 'Resuelto' THEN 1 ELSE 0 END) as resueltos,
        SUM(CASE WHEN estatus = 'Cerrado' THEN 1 ELSE 0 END) as cerrados,
        COUNT(*) as total
      FROM tickets_servicio WHERE 1=1 ${dateFilter}
    `).get(...dateParams);

    const porCategoria = db.prepare(`
      SELECT categoria, COUNT(*) as count
      FROM tickets_servicio WHERE categoria IS NOT NULL ${dateFilter}
      GROUP BY categoria ORDER BY count DESC
    `).all(...dateParams);

    const porPrioridad = db.prepare(`
      SELECT prioridad, COUNT(*) as count
      FROM tickets_servicio WHERE 1=1 ${dateFilter}
      GROUP BY prioridad ORDER BY count DESC
    `).all(...dateParams);

    const porActividad = db.prepare(`
      SELECT actividad, COUNT(*) as count
      FROM tickets_servicio WHERE actividad IS NOT NULL ${dateFilter}
      GROUP BY actividad ORDER BY count DESC LIMIT 10
    `).all(...dateParams);

    // Average resolution time (in hours)
    const avgResolution = db.prepare(`
      SELECT AVG(
        (julianday(resuelto_at) - julianday(created_at)) * 24
      ) as avg_hours
      FROM tickets_servicio WHERE resuelto_at IS NOT NULL ${dateFilter}
    `).get(...dateParams);

    // Recurrence: actividad+categoria combos with >2 tickets
    const recurrentes = db.prepare(`
      SELECT actividad, categoria, COUNT(*) as count
      FROM tickets_servicio
      WHERE actividad IS NOT NULL AND categoria IS NOT NULL ${dateFilter}
      GROUP BY actividad, categoria
      HAVING COUNT(*) >= 2
      ORDER BY count DESC
    `).all(...dateParams);

    // Satisfaction avg on resolved tickets
    const avgSatisfaccion = db.prepare(`
      SELECT AVG(satisfaccion_resolucion) as avg_score
      FROM tickets_servicio
      WHERE satisfaccion_resolucion IS NOT NULL ${dateFilter}
    `).get(...dateParams);

    // Monthly trend
    const tendencia = db.prepare(`
      SELECT substr(created_at, 1, 7) as mes, COUNT(*) as total,
        SUM(CASE WHEN estatus = 'Resuelto' OR estatus = 'Cerrado' THEN 1 ELSE 0 END) as resueltos
      FROM tickets_servicio
      GROUP BY substr(created_at, 1, 7)
      ORDER BY mes DESC LIMIT 12
    `).all().reverse();

    success(res, {
      ...stats,
      porCategoria,
      porPrioridad,
      porActividad,
      avgResolutionHours: avgResolution?.avg_hours ? Math.round(avgResolution.avg_hours * 10) / 10 : null,
      recurrentes,
      avgSatisfaccion: avgSatisfaccion?.avg_score ? Math.round(avgSatisfaccion.avg_score * 10) / 10 : null,
      tendencia
    });
  } catch (err) {
    console.error('Error fetching ticket stats:', err);
    error(res, 'SERVER_ERROR', 'Error fetching ticket stats', 500);
  }
});

// Recurrence analysis
router.get('/api/v1/tickets/recurrencia', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const recurrentes = db.prepare(`
      SELECT actividad, categoria, vendedor, COUNT(*) as count,
        MIN(created_at) as primer_ticket,
        MAX(created_at) as ultimo_ticket,
        GROUP_CONCAT(codigo, ', ') as codigos
      FROM tickets_servicio
      WHERE actividad IS NOT NULL AND categoria IS NOT NULL
      GROUP BY actividad, categoria
      HAVING COUNT(*) >= 2
      ORDER BY count DESC
    `).all();
    success(res, recurrentes);
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error fetching recurrence data', 500);
  }
});

// Get single ticket
router.get('/api/v1/tickets/:id', requireAuth, (req, res) => {
  try {
    const ticket = findById('tickets_servicio', req.params.id);
    if (!ticket) return error(res, 'NOT_FOUND', 'Ticket no encontrado', 404);

    // Add recurrence info
    const recurrence = detectRecurrence(ticket.actividad, ticket.categoria);
    success(res, { ...ticket, recurrence });
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error fetching ticket', 500);
  }
});

// Create ticket
router.post('/api/v1/tickets', requireAuth, (req, res) => {
  try {
    const { cliente, descripcion } = req.body;
    if (!cliente || !descripcion) {
      return error(res, 'VALIDATION_ERROR', 'cliente y descripcion son requeridos', 400);
    }

    const data = {};
    const allowed = ['tour_id', 'actividad', 'vendedor', 'responsable', 'cliente', 'whatsapp',
      'email', 'tipo', 'categoria', 'prioridad', 'canal_origen', 'descripcion',
      'evidencia_url', 'asignado_a'];

    for (const field of allowed) {
      if (req.body[field] !== undefined && req.body[field] !== null) {
        data[field] = typeof req.body[field] === 'string' ? sanitize(req.body[field]) : req.body[field];
      }
    }

    data.codigo = generateTicketCode();
    data.creado_por = req.user.nombre || req.user.email;

    // Auto-fill from tour if tour_id provided
    if (data.tour_id) {
      const tour = findById('reservas_tours', data.tour_id);
      if (tour) {
        if (!data.actividad) data.actividad = tour.actividad;
        if (!data.vendedor) data.vendedor = tour.vendedor;
        if (!data.responsable) data.responsable = tour.responsable;
        if (!data.cliente) data.cliente = tour.cliente;
        if (!data.whatsapp) data.whatsapp = tour.whatsapp;
      }
    }

    // Auto-escalate priority on recurrence
    const recurrence = detectRecurrence(data.actividad, data.categoria);
    if (recurrence.isRecurrent && (!data.prioridad || data.prioridad === 'media' || data.prioridad === 'baja')) {
      data.prioridad = 'alta';
    }

    // Partner scoping
    if (isPartner(req)) {
      data.vendedor = req.user.vendedor;
      data.canal_origen = 'partner-portal';
    }

    const ticket = create('tickets_servicio', data);

    success(res, { ...ticket, recurrence }, null, 201);

    // Notify
    setImmediate(async () => {
      try {
        await notifications.onTicketCreated?.({ ...data, ...ticket, recurrence });
      } catch (err) {
        console.error('🔔 Notification error (ticket create):', err.message);
      }
    });
  } catch (err) {
    console.error('Error creating ticket:', err);
    error(res, 'SERVER_ERROR', 'Error creating ticket', 500);
  }
});

// Update ticket
router.put('/api/v1/tickets/:id', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const existing = findById('tickets_servicio', req.params.id);
    if (!existing) return error(res, 'NOT_FOUND', 'Ticket no encontrado', 404);

    const data = {};
    const allowed = ['actividad', 'vendedor', 'responsable', 'cliente', 'whatsapp', 'email',
      'tipo', 'categoria', 'prioridad', 'canal_origen', 'descripcion', 'evidencia_url',
      'asignado_a', 'respuesta', 'accion_correctiva', 'satisfaccion_resolucion'];

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        data[field] = typeof req.body[field] === 'string' ? sanitize(req.body[field]) : req.body[field];
      }
    }

    const updated = update('tickets_servicio', req.params.id, data);
    success(res, updated);
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error updating ticket', 500);
  }
});

// Change ticket status
router.patch('/api/v1/tickets/:id/status', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const { estatus } = req.body;
    if (!estatus) return error(res, 'VALIDATION_ERROR', 'estatus es requerido', 400);

    const valid = ['Abierto', 'En Proceso', 'Resuelto', 'Cerrado'];
    if (!valid.includes(estatus)) {
      return error(res, 'VALIDATION_ERROR', `Estatus inválido. Válidos: ${valid.join(', ')}`, 400);
    }

    const existing = findById('tickets_servicio', req.params.id);
    if (!existing) return error(res, 'NOT_FOUND', 'Ticket no encontrado', 404);

    const data = { estatus };
    if (estatus === 'Resuelto' && !existing.resuelto_at) {
      data.resuelto_at = new Date().toISOString();
      data.resuelto_por = req.user.nombre || req.user.email;
    }
    if (estatus === 'Cerrado' && !existing.cerrado_at) {
      data.cerrado_at = new Date().toISOString();
    }

    const updated = update('tickets_servicio', req.params.id, data);
    success(res, updated);

    // Notify on resolution
    if (estatus === 'Resuelto' && existing.estatus !== 'Resuelto') {
      setImmediate(async () => {
        try {
          await notifications.onTicketResolved?.({ ...existing, ...updated });
        } catch (err) {
          console.error('🔔 Notification error (ticket resolved):', err.message);
        }
      });
    }
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error updating ticket status', 500);
  }
});

// Assign ticket
router.patch('/api/v1/tickets/:id/assign', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const { asignado_a } = req.body;
    if (!asignado_a) return error(res, 'VALIDATION_ERROR', 'asignado_a es requerido', 400);

    const existing = findById('tickets_servicio', req.params.id);
    if (!existing) return error(res, 'NOT_FOUND', 'Ticket no encontrado', 404);

    const data = { asignado_a: sanitize(asignado_a) };
    if (existing.estatus === 'Abierto') data.estatus = 'En Proceso';

    const updated = update('tickets_servicio', req.params.id, data);
    success(res, updated);
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error assigning ticket', 500);
  }
});

// ── SATISFACTION SCORES ──

// Get satisfaction scores
router.get('/api/v1/satisfaccion', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const { mes, actividad, vendedor } = req.query;

    let dateFilter = '';
    let dateParams = [];
    if (mes && mes !== 'todo') {
      dateFilter = "AND substr(created_at, 1, 7) = ?";
      dateParams = [mes];
    }

    let actFilter = '';
    if (actividad) { actFilter = "AND actividad = ?"; dateParams.push(actividad); }
    let vendFilter = '';
    if (vendedor) { vendFilter = "AND vendedor = ?"; dateParams.push(vendedor); }

    const general = db.prepare(`
      SELECT
        COUNT(*) as total_resenas,
        ROUND(AVG(score_general), 1) as avg_general,
        ROUND(AVG(score_guia), 1) as avg_guia,
        ROUND(AVG(score_puntualidad), 1) as avg_puntualidad,
        ROUND(AVG(score_equipamiento), 1) as avg_equipamiento,
        ROUND(AVG(score_valor), 1) as avg_valor,
        SUM(CASE WHEN redirigido_google = 1 THEN 1 ELSE 0 END) as enviados_google
      FROM satisfaccion_tours WHERE 1=1 ${dateFilter} ${actFilter} ${vendFilter}
    `).get(...dateParams);

    // Distribution (1-5 stars)
    const distribucion = db.prepare(`
      SELECT score_general as score, COUNT(*) as count
      FROM satisfaccion_tours WHERE 1=1 ${dateFilter} ${actFilter} ${vendFilter}
      GROUP BY score_general ORDER BY score_general
    `).all(...dateParams);

    // Monthly trend
    const tendencia = db.prepare(`
      SELECT substr(created_at, 1, 7) as mes,
        ROUND(AVG(score_general), 1) as avg_score,
        COUNT(*) as total
      FROM satisfaccion_tours
      GROUP BY substr(created_at, 1, 7)
      ORDER BY mes DESC LIMIT 12
    `).all().reverse();

    // Recent reviews
    const recientes = db.prepare(`
      SELECT * FROM satisfaccion_tours
      WHERE 1=1 ${dateFilter} ${actFilter} ${vendFilter}
      ORDER BY created_at DESC LIMIT 20
    `).all(...dateParams);

    success(res, { general, distribucion, tendencia, recientes });
  } catch (err) {
    console.error('Error fetching satisfaction:', err);
    error(res, 'SERVER_ERROR', 'Error fetching satisfaction data', 500);
  }
});

// Satisfaction ranking
router.get('/api/v1/satisfaccion/ranking', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const { tipo = 'actividad' } = req.query;

    const groupCol = tipo === 'vendedor' ? 'vendedor' : 'actividad';
    const ranking = db.prepare(`
      SELECT ${groupCol} as nombre,
        COUNT(*) as total_resenas,
        ROUND(AVG(score_general), 1) as avg_general,
        ROUND(AVG(score_guia), 1) as avg_guia,
        ROUND(AVG(score_puntualidad), 1) as avg_puntualidad,
        ROUND(AVG(score_equipamiento), 1) as avg_equipamiento,
        ROUND(AVG(score_valor), 1) as avg_valor,
        MIN(score_general) as min_score,
        MAX(score_general) as max_score
      FROM satisfaccion_tours
      WHERE ${groupCol} IS NOT NULL AND ${groupCol} != ''
      GROUP BY ${groupCol}
      HAVING total_resenas >= 1
      ORDER BY avg_general DESC
    `).all();

    success(res, ranking);
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error fetching ranking', 500);
  }
});

// Register satisfaction manually
router.post('/api/v1/satisfaccion', requireAuth, (req, res) => {
  try {
    const { score_general } = req.body;
    if (!score_general || score_general < 1 || score_general > 5) {
      return error(res, 'VALIDATION_ERROR', 'score_general (1-5) es requerido', 400);
    }

    const data = {};
    const allowed = ['tour_id', 'actividad', 'vendedor', 'responsable', 'cliente',
      'score_general', 'score_guia', 'score_puntualidad', 'score_equipamiento',
      'score_valor', 'comentario', 'fuente'];

    for (const field of allowed) {
      if (req.body[field] !== undefined && req.body[field] !== null) {
        data[field] = typeof req.body[field] === 'string' ? sanitize(req.body[field]) : req.body[field];
      }
    }

    data.codigo_resena = generateReviewCode();
    if (!data.fuente) data.fuente = 'manual';

    const review = create('satisfaccion_tours', data);
    success(res, review, null, 201);
  } catch (err) {
    console.error('Error creating satisfaction:', err);
    error(res, 'SERVER_ERROR', 'Error creating satisfaction', 500);
  }
});

// ── PARTNER QUALITY SYSTEMS ──

router.get('/api/v1/partner/tickets', requireAuth, (req, res) => {
  try {
    if (!isPartner(req)) return error(res, 'FORBIDDEN', 'Solo disponible para partners', 403);

    const { estatus, page = 1, limit = 50 } = req.query;
    const where = { vendedor: req.user.vendedor };
    if (estatus) where.estatus = estatus;

    const result = findAll('tickets_servicio', { where, page: Number(page), limit: Number(limit), orderBy: 'id DESC' });
    success(res, result.data, result.meta);
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error listing partner tickets', 500);
  }
});

router.post('/api/v1/partner/tickets', requireAuth, (req, res) => {
  try {
    if (!isPartner(req)) return error(res, 'FORBIDDEN', 'Solo disponible para partners', 403);

    const { cliente, descripcion } = req.body;
    if (!cliente || !descripcion) {
      return error(res, 'VALIDATION_ERROR', 'cliente y descripcion son requeridos', 400);
    }

    const data = {};
    const allowed = ['tour_id', 'actividad', 'responsable', 'cliente', 'whatsapp',
      'email', 'tipo', 'categoria', 'descripcion', 'evidencia_url'];

    for (const field of allowed) {
      if (req.body[field] !== undefined && req.body[field] !== null) {
        data[field] = typeof req.body[field] === 'string' ? sanitize(req.body[field]) : req.body[field];
      }
    }

    data.codigo = generateTicketCode();
    data.vendedor = req.user.vendedor;
    data.canal_origen = 'partner-portal';
    data.creado_por = req.user.nombre || req.user.email;

    const ticket = create('tickets_servicio', data);
    success(res, ticket, null, 201);
  } catch (err) {
    console.error('Error creating partner ticket:', err);
    error(res, 'SERVER_ERROR', 'Error creating partner ticket', 500);
  }
});

// Partner satisfaction view
router.get('/api/v1/partner/satisfaccion', requireAuth, (req, res) => {
  try {
    if (!isPartner(req)) return error(res, 'FORBIDDEN', 'Solo disponible para partners', 403);

    const db = getDb();
    const vendedor = req.user.vendedor;

    const scores = db.prepare(`
      SELECT actividad as nombre,
        COUNT(*) as total,
        ROUND(AVG(score_general), 1) as avg_general,
        ROUND(AVG(score_guia), 1) as avg_guia,
        ROUND(AVG(score_puntualidad), 1) as avg_puntualidad
      FROM satisfaccion_tours
      WHERE vendedor = ?
      GROUP BY actividad
      ORDER BY avg_general DESC
    `).all(vendedor);

    const recientes = db.prepare(`
      SELECT * FROM satisfaccion_tours WHERE vendedor = ? ORDER BY created_at DESC LIMIT 10
    `).all(vendedor);

    const general = db.prepare(`
      SELECT ROUND(AVG(score_general), 1) as avg, COUNT(*) as total
      FROM satisfaccion_tours WHERE vendedor = ?
    `).get(vendedor);

    success(res, { scores, recientes, general });
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error fetching partner satisfaction', 500);
  }
});

module.exports = router;
