const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { getDb, findAll, findById, create, update, remove } = require('./db/database');
const { verifyPassword, hashPassword, generateToken, requireAuth, requireRole, isPartner } = require('./auth');
const notifications = require('./notifications');

// ── Multer config for file uploads ──
const uploadsDir = process.env.NODE_ENV === 'production' && fs.existsSync('/data')
  ? '/data/uploads'
  : path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, uniqueName);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|pdf)$/i;
    if (allowed.test(path.extname(file.originalname))) cb(null, true);
    else cb(new Error('Solo se permiten imágenes (jpg, png, gif, webp) o PDF'));
  }
});

const app = express();
const PORT = process.env.PORT || 3101;
const API_KEY = process.env.API_KEY || 'mahana-dev-key-2026';

if (process.env.NODE_ENV === 'production' && API_KEY === 'mahana-dev-key-2026') {
  console.warn('⚠️  WARNING: Using default API_KEY in production. Set API_KEY env var for security.');
}

// ── Middleware ──

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
app.use(cors({
  origin: ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : true,
  credentials: true
}));
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

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

// Cleanup stale rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const ip of Object.keys(requestCounts)) {
    if (now - requestCounts[ip].startTime > RATE_WINDOW) {
      delete requestCounts[ip];
    }
  }
}, 5 * 60 * 1000);

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

function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>"'`;]/g, '').replace(/\\+/g, '').trim();
}

// CxC auto-calculation: subtotal = precio - comision, itbm = 7%, total = subtotal + itbm
// Also returns monto_comision and ganancia_mahana so they stay in sync
function calcCxC(data) {
  const precio = parseFloat(data.precio_ingreso) || 0;
  const costo = parseFloat(data.costo_pago) || 0;
  const comPct = parseFloat(data.comision_pct) || 0;
  const comision = parseFloat(data.monto_comision) || Math.round((precio * comPct / 100) * 100) / 100;
  const ganancia = Math.round((precio - costo - comision) * 100) / 100;
  const subtotal = Math.round((precio - comision) * 100) / 100;
  const itbm = Math.round((subtotal * 0.07) * 100) / 100;
  const total = Math.round((subtotal + itbm) * 100) / 100;
  return {
    monto_comision: comision,
    ganancia_mahana: ganancia,
    cxc_subtotal: subtotal,
    cxc_itbm: itbm,
    cxc_total: total,
  };
}

// ── API Status ──

app.get('/api/v1/api-status', (req, res) => {
  success(res, {
    status: 'ok',
    version: '2.0.0',
    name: 'Mahana Portal API',
    timestamp: new Date().toISOString()
  });
});

// Debug endpoints removed for security (audit 2026-03-20)

// ══════════════════════════════════════
// AUTH ENDPOINTS
// ══════════════════════════════════════

app.post('/api/v1/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return error(res, 'VALIDATION_ERROR', 'Email y contraseña son requeridos', 400);
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM usuarios WHERE email = ? AND activo = 1').get(email.toLowerCase().trim());
    if (!user) {
      return error(res, 'AUTH_FAILED', 'Credenciales inválidas', 401);
    }

    if (!verifyPassword(password, user.password_hash)) {
      return error(res, 'AUTH_FAILED', 'Credenciales inválidas', 401);
    }

    const token = generateToken(user);
    success(res, {
      token,
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        rol: user.rol,
        vendedor: user.vendedor
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    error(res, 'SERVER_ERROR', 'Error en login', 500);
  }
});

app.get('/api/v1/auth/me', requireAuth, (req, res) => {
  success(res, {
    id: req.user.id,
    email: req.user.email,
    nombre: req.user.nombre,
    rol: req.user.rol,
    vendedor: req.user.vendedor
  });
});

// ══════════════════════════════════════
// TOURS ENDPOINTS
// ══════════════════════════════════════

app.get('/api/v1/tours', requireAuth, (req, res) => {
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
app.get('/api/v1/tours/deleted', requireAuth, requireRole('admin'), (req, res) => {
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

app.get('/api/v1/tours/:id', requireAuth, (req, res) => {
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
app.delete('/api/v1/tours/:id', requireAuth, requireRole('admin'), (req, res) => {
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

app.post('/api/v1/tours', requireAuth, (req, res) => {
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

app.put('/api/v1/tours/:id', requireAuth, requireRole('admin', 'vendedor'), (req, res) => {
  try {
    const existing = findById('reservas_tours', req.params.id);
    if (!existing) return error(res, 'NOT_FOUND', `Tour ${req.params.id} not found`, 404);

    const data = {};
    const allowed = ['fecha', 'hora', 'cliente', 'whatsapp', 'estatus', 'vendedor', 'actividad',
      'responsable', 'precio_ingreso', 'costo_pago', 'comision_pct', 'monto_comision',
      'ganancia_mahana', 'notas', 'gestionado_por',
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

app.patch('/api/v1/tours/:id/status', requireAuth, requireRole('admin', 'vendedor'), (req, res) => {
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

// Approve tour (admin only)
app.post('/api/v1/tours/:id/aprobar', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const existing = findById('reservas_tours', req.params.id);
    if (!existing) return error(res, 'NOT_FOUND', `Tour ${req.params.id} not found`, 404);

    const updated = update('reservas_tours', req.params.id, { estatus: 'Aprobado' });
    success(res, updated);

    // Notify: email to client + telegram + admin
    setImmediate(async () => {
      try {
        const fullTour = { ...existing, ...updated, email: existing.email_cliente };
        await notifications.onTourApproved(fullTour);
      } catch (err) {
        console.error('🔔 Notification error (tour approve):', err.message);
      }
    });
  } catch (err) {
    console.error('Error approving tour:', err);
    error(res, 'SERVER_ERROR', 'Error approving tour', 500);
  }
});

// Reject tour (admin only)
app.post('/api/v1/tours/:id/rechazar', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const existing = findById('reservas_tours', req.params.id);
    if (!existing) return error(res, 'NOT_FOUND', `Tour ${req.params.id} not found`, 404);

    const { motivo } = req.body;
    const updated = update('reservas_tours', req.params.id, {
      estatus: 'Rechazado',
      notas_admin: motivo ? `RECHAZADO: ${motivo}` : 'Rechazado por admin',
    });

    // Release slot if linked
    if (existing.slot_id) {
      try {
        const db = getDb();
        const pax = existing.pax || 1;
        db.prepare('UPDATE horarios_slots SET reservados = MAX(reservados - ?, 0) WHERE id = ?').run(pax, existing.slot_id);
      } catch (slotErr) {
        console.error('Error releasing slot:', slotErr.message);
      }
    }

    success(res, updated);

    // Notify rejection (partner gets email with motivo)
    setImmediate(async () => {
      try {
        const fullTour = { ...existing, ...updated, email: existing.email_cliente };
        await notifications.onTourRejected(fullTour, motivo);
      } catch (err) {
        console.error('🔔 Notification error (tour reject):', err.message);
      }
    });
  } catch (err) {
    console.error('Error rejecting tour:', err);
    error(res, 'SERVER_ERROR', 'Error rejecting tour', 500);
  }
});

// (dead code removed — soft delete on line 228 handles DELETE /tours/:id)

// ══════════════════════════════════════
// ESTADÍAS ENDPOINTS
// ══════════════════════════════════════

app.get('/api/v1/estadias', requireAuth, (req, res) => {
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

app.get('/api/v1/estadias/:id', requireAuth, (req, res) => {
  try {
    const estadia = findById('reservas_estadias', req.params.id);
    if (!estadia) return error(res, 'NOT_FOUND', `Estadia ${req.params.id} not found`, 404);
    success(res, estadia);
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error fetching estadia', 500);
  }
});

app.post('/api/v1/estadias', requireAuth, requireRole('admin'), (req, res) => {
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
      'comision_pct', 'monto_comision', 'base_caracol', 'impuesto', 'cleaning_fee',
      'estado', 'responsable', 'notas', 'fuente'];

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

    // Send notifications asynchronously
    setImmediate(async () => {
      try {
        await notifications.onEstadiaCreated({ ...data, ...estadia });
      } catch (err) {
        console.error('🔔 Notification error (estadia create):', err.message);
      }
    });
  } catch (err) {
    console.error('Error creating estadia:', err);
    error(res, 'SERVER_ERROR', 'Error creating estadia', 500);
  }
});

app.put('/api/v1/estadias/:id', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const existing = findById('reservas_estadias', req.params.id);
    if (!existing) return error(res, 'NOT_FOUND', `Estadia ${req.params.id} not found`, 404);

    const data = {};
    const allowed = ['cliente', 'whatsapp', 'email', 'propiedad', 'tipo', 'check_in', 'check_out',
      'huespedes', 'habitaciones', 'precio_cotizado', 'precio_final', 'comision_pct',
      'monto_comision', 'base_caracol', 'impuesto', 'cleaning_fee',
      'estado', 'responsable', 'notas'];

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        data[field] = typeof req.body[field] === 'string' ? sanitize(req.body[field]) : req.body[field];
      }
    }

    const updated = update('reservas_estadias', req.params.id, data);
    success(res, updated);

    // Notify on status change
    if (data.estado && data.estado !== existing.estado) {
      setImmediate(async () => {
        try {
          await notifications.onEstadiaStatusChanged({ ...existing, ...updated }, existing.estado, data.estado);
        } catch (err) {
          console.error('🔔 Notification error (estadia update):', err.message);
        }
      });
    }
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error updating estadia', 500);
  }
});

app.patch('/api/v1/estadias/:id/status', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const { estado } = req.body;
    if (!estado) return error(res, 'VALIDATION_ERROR', 'Field "estado" is required', 400, ['estado']);

    const valid = ['Solicitada', 'Cotizada', 'Confirmada', 'Pagada', 'Perdida'];
    if (!valid.includes(estado)) {
      return error(res, 'VALIDATION_ERROR', `Invalid estado. Valid: ${valid.join(', ')}`, 400, ['estado']);
    }

    const existing = findById('reservas_estadias', req.params.id);
    if (!existing) return error(res, 'NOT_FOUND', `Estadia ${req.params.id} not found`, 404);

    const oldStatus = existing.estado;
    const updated = update('reservas_estadias', req.params.id, { estado });
    success(res, updated);

    // Notify on status change
    setImmediate(async () => {
      try {
        await notifications.onEstadiaStatusChanged({ ...existing, ...updated }, oldStatus, estado);
      } catch (err) {
        console.error('🔔 Notification error (estadia status):', err.message);
      }
    });
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error updating status', 500);
  }
});

app.delete('/api/v1/estadias/:id', requireAuth, requireRole('admin'), (req, res) => {
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

app.get('/api/v1/dashboard', requireAuth, (req, res) => {
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

// ══════════════════════════════════════
// PARTNER DASHBOARD
// ══════════════════════════════════════

app.get('/api/v1/partner/dashboard', requireAuth, (req, res) => {
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

// ══════════════════════════════════════
// PARTNER TOUR UPDATE (resets status)
// ══════════════════════════════════════

app.put('/api/v1/partner/tours/:id', requireAuth, (req, res) => {
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

// ══════════════════════════════════════
// TOUR APPROVAL / REJECTION
// ══════════════════════════════════════

app.post('/api/v1/tours/:id/aprobar', requireAuth, requireRole('admin'), (req, res) => {
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

app.post('/api/v1/tours/:id/rechazar', requireAuth, requireRole('admin'), (req, res) => {
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

// ══════════════════════════════════════
// USER MANAGEMENT (admin only)
// ══════════════════════════════════════

app.get('/api/v1/usuarios', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const db = getDb();
    const users = db.prepare('SELECT id, email, nombre, rol, vendedor, activo, created_at FROM usuarios ORDER BY id').all();
    success(res, users);
  } catch (err) {
    console.error('Error listing users:', err);
    error(res, 'SERVER_ERROR', 'Error listing users', 500);
  }
});

app.post('/api/v1/usuarios', requireAuth, requireRole('admin'), (req, res) => {
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

app.put('/api/v1/usuarios/:id', requireAuth, requireRole('admin'), (req, res) => {
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

app.patch('/api/v1/usuarios/:id/toggle', requireAuth, requireRole('admin'), (req, res) => {
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

app.delete('/api/v1/usuarios/:id', requireAuth, requireRole('admin'), (req, res) => {
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

// ══════════════════════════════════════
// NOTIFICATION CONFIG
// ══════════════════════════════════════

app.get('/api/v1/config/notificaciones', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT clave, valor, descripcion FROM configuracion_notificaciones ORDER BY clave').all();
    const config = {};
    rows.forEach(r => { config[r.clave] = { valor: r.valor, descripcion: r.descripcion }; });
    success(res, config);
  } catch (err) {
    console.error('Error reading notification config:', err);
    error(res, 'SERVER_ERROR', 'Error reading config', 500);
  }
});

app.put('/api/v1/config/notificaciones', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const db = getDb();
    const updates = req.body;
    if (!updates || typeof updates !== 'object') {
      return error(res, 'VALIDATION_ERROR', 'Body must be an object of key-value pairs', 400);
    }

    const upsert = db.prepare(`
      INSERT INTO configuracion_notificaciones (clave, valor, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, updated_at = excluded.updated_at
    `);

    const transaction = db.transaction((entries) => {
      for (const [key, value] of entries) {
        upsert.run(key, String(value));
      }
    });

    transaction(Object.entries(updates));

    // Re-read all config
    const rows = db.prepare('SELECT clave, valor, descripcion FROM configuracion_notificaciones ORDER BY clave').all();
    const config = {};
    rows.forEach(r => { config[r.clave] = { valor: r.valor, descripcion: r.descripcion }; });
    success(res, config);
  } catch (err) {
    console.error('Error updating notification config:', err);
    error(res, 'SERVER_ERROR', 'Error updating config', 500);
  }
});

// ══════════════════════════════════════
// ALERTAS — AI Agent Monitoring
// ══════════════════════════════════════

app.get('/api/v1/alertas', requireAuth, (req, res) => {
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

app.patch('/api/v1/alertas/:id', requireAuth, (req, res) => {
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

app.patch('/api/v1/alertas/leer-todas', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const result = db.prepare('UPDATE alertas SET leida = 1 WHERE leida = 0').run();
    success(res, { updated: result.changes });
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error marking all as read', 500);
  }
});

// ══════════════════════════════════════
// FILE UPLOAD
// ══════════════════════════════════════

app.post('/api/v1/uploads', requireAuth, upload.single('file'), (req, res) => {
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

app.get('/api/v1/charts', requireAuth, (req, res) => {
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

app.get('/api/v1/actividades', requireAuth, (req, res) => {
  try {
    const result = findAll('actividades', { limit: 200, orderBy: 'categoria ASC, nombre ASC' });
    success(res, result.data, result.meta);
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error listing actividades', 500);
  }
});

app.get('/api/v1/actividades/:id', requireAuth, (req, res) => {
  try {
    const item = findById('actividades', req.params.id);
    if (!item) return error(res, 'NOT_FOUND', `Actividad ${req.params.id} not found`, 404);
    success(res, item);
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error fetching actividad', 500);
  }
});

app.post('/api/v1/actividades', requireAuth, requireRole('admin'), (req, res) => {
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

app.put('/api/v1/actividades/:id', requireAuth, requireRole('admin'), (req, res) => {
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

app.delete('/api/v1/actividades/:id', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const removed = remove('actividades', req.params.id);
    if (!removed) return error(res, 'NOT_FOUND', `Actividad ${req.params.id} not found`, 404);
    success(res, { deleted: true, id: req.params.id });
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error deleting actividad', 500);
  }
});

// ══════════════════════════════════════
// PROPIEDADES ENDPOINTS (CRUD)
// ══════════════════════════════════════

app.get('/api/v1/propiedades', requireAuth, (req, res) => {
  try {
    const result = findAll('propiedades', { limit: 100, orderBy: 'nombre ASC' });
    success(res, result.data, result.meta);
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error listing propiedades', 500);
  }
});

app.get('/api/v1/propiedades/:id', requireAuth, (req, res) => {
  try {
    const item = findById('propiedades', req.params.id);
    if (!item) return error(res, 'NOT_FOUND', `Propiedad ${req.params.id} not found`, 404);
    success(res, item);
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error fetching propiedad', 500);
  }
});

app.post('/api/v1/propiedades', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const { nombre } = req.body;
    if (!nombre) return error(res, 'VALIDATION_ERROR', 'Campo "nombre" es requerido', 400, ['nombre']);

    const data = {};
    const allowed = ['nombre', 'descripcion', 'tipo', 'habitaciones', 'capacidad',
      'precio_noche', 'impuesto_pct', 'cleaning_fee', 'amenidades', 'activa'];

    for (const field of allowed) {
      if (req.body[field] !== undefined && req.body[field] !== null) {
        data[field] = typeof req.body[field] === 'string' ? sanitize(req.body[field]) : req.body[field];
      }
    }

    const item = create('propiedades', data);
    success(res, item, null, 201);
  } catch (err) {
    console.error('Error creating propiedad:', err);
    if (err.message?.includes('UNIQUE')) {
      return error(res, 'DUPLICATE', 'Ya existe una propiedad con ese nombre', 409);
    }
    error(res, 'SERVER_ERROR', 'Error creating propiedad', 500);
  }
});

app.put('/api/v1/propiedades/:id', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const existing = findById('propiedades', req.params.id);
    if (!existing) return error(res, 'NOT_FOUND', `Propiedad ${req.params.id} not found`, 404);

    const data = {};
    const allowed = ['nombre', 'descripcion', 'tipo', 'habitaciones', 'capacidad',
      'precio_noche', 'impuesto_pct', 'cleaning_fee', 'amenidades', 'activa'];

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        data[field] = typeof req.body[field] === 'string' ? sanitize(req.body[field]) : req.body[field];
      }
    }

    const updated = update('propiedades', req.params.id, data);
    success(res, updated);
  } catch (err) {
    if (err.message?.includes('UNIQUE')) {
      return error(res, 'DUPLICATE', 'Ya existe una propiedad con ese nombre', 409);
    }
    error(res, 'SERVER_ERROR', 'Error updating propiedad', 500);
  }
});

app.delete('/api/v1/propiedades/:id', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const removed = remove('propiedades', req.params.id);
    if (!removed) return error(res, 'NOT_FOUND', `Propiedad ${req.params.id} not found`, 404);
    success(res, { deleted: true, id: req.params.id });
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error deleting propiedad', 500);
  }
});

app.get('/api/v1/staff', requireAuth, (req, res) => {
  try {
    const result = findAll('staff', { limit: 100, orderBy: 'nombre ASC' });
    success(res, result.data, result.meta);
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error listing staff', 500);
  }
});

// ══════════════════════════════════════
// EXPORT ENDPOINTS (CSV)
// ══════════════════════════════════════

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

app.get('/api/v1/tours/export', requireAuth, requireRole('admin'), (req, res) => {
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

app.get('/api/v1/estadias/export', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const db = getDb();
    const { check_in_desde, check_in_hasta, estado, propiedad } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (check_in_desde) { where += ' AND check_in >= ?'; params.push(check_in_desde); }
    if (check_in_hasta) { where += ' AND check_in <= ?'; params.push(check_in_hasta); }
    if (estado) { where += ' AND estado = ?'; params.push(estado); }
    if (propiedad) { where += ' AND propiedad LIKE ?'; params.push('%' + propiedad + '%'); }

    const rows = db.prepare(`SELECT fecha_solicitud, cliente, whatsapp, email, propiedad, tipo, check_in, check_out, huespedes, habitaciones, precio_cotizado, precio_final, base_caracol, impuesto, cleaning_fee, comision_pct, monto_comision, estado, responsable, notas FROM reservas_estadias ${where} ORDER BY check_in DESC`).all(...params);

    const headers = ['Fecha Solicitud', 'Cliente', 'WhatsApp', 'Email', 'Propiedad', 'Tipo', 'Check-in', 'Check-out', 'Huéspedes', 'Habitaciones', 'Precio Cotizado', 'Precio Final', 'Base Caracol', 'Impuesto', 'Cleaning Fee', 'Comisión %', 'Monto Comisión', 'Estado', 'Responsable', 'Notas'];
    const csv = [toCsvRow(headers)];
    for (const r of rows) {
      csv.push(toCsvRow([r.fecha_solicitud, r.cliente, r.whatsapp, r.email, r.propiedad, r.tipo, r.check_in, r.check_out, r.huespedes, r.habitaciones, r.precio_cotizado, r.precio_final, r.base_caracol, r.impuesto, r.cleaning_fee, r.comision_pct, r.monto_comision, r.estado, r.responsable, r.notas]));
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="estadias_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send('\uFEFF' + csv.join('\n'));
  } catch (err) {
    console.error('Error exporting estadias:', err);
    error(res, 'SERVER_ERROR', 'Error exporting estadias', 500);
  }
});

// ══════════════════════════════════════
// CALENDAR ENDPOINT
// ══════════════════════════════════════

app.get('/api/v1/calendar', requireAuth, (req, res) => {
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

// (Legacy endpoints removed — use /api/v1/* exclusively)

// ══════════════════════════════════════
// AVAILABILITY ENDPOINTS
// ══════════════════════════════════════

// Get slots for a specific date
app.get('/api/v1/disponibilidad', requireAuth, (req, res) => {
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
app.get('/api/v1/disponibilidad/semana', requireAuth, (req, res) => {
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
app.post('/api/v1/slots', requireAuth, requireRole('admin', 'vendedor'), (req, res) => {
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
app.put('/api/v1/slots/:id', requireAuth, requireRole('admin', 'vendedor'), (req, res) => {
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
app.delete('/api/v1/slots/:id', requireAuth, requireRole('admin', 'vendedor'), (req, res) => {
  try {
    const removed = remove('horarios_slots', req.params.id);
    if (!removed) return error(res, 'NOT_FOUND', 'Slot not found', 404);
    success(res, { deleted: true, id: req.params.id });
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error deleting slot', 500);
  }
});

// ══════════════════════════════════════
// AI-AGENT-FRIENDLY ENDPOINTS
// ══════════════════════════════════════

// GET full month availability in 1 call (instead of 31 individual requests)
app.get('/api/v1/disponibilidad/mes', requireAuth, (req, res) => {
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
app.post('/api/v1/slots/bulk', requireAuth, requireRole('admin', 'vendedor'), (req, res) => {
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
app.get('/api/v1/disponibilidad/resumen', requireAuth, (req, res) => {
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
// Example: { actividad_id: 1, texto: "Lunes a Viernes 08:00-16:00 cada 60min 6 cupos" }
app.post('/api/v1/plantillas/texto', requireAuth, requireRole('admin'), (req, res) => {
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
app.get('/api/v1/plantillas', requireAuth, requireRole('admin'), (req, res) => {
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
app.post('/api/v1/plantillas', requireAuth, requireRole('admin'), (req, res) => {
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
app.put('/api/v1/plantillas/:id', requireAuth, requireRole('admin'), (req, res) => {
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
app.delete('/api/v1/plantillas/:id', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const existing = findById('plantillas_horario', req.params.id);
    if (!existing) return error(res, 'NOT_FOUND', 'Plantilla no encontrada', 404);

    const removed = remove('plantillas_horario', req.params.id);
    success(res, removed);
  } catch (err) {
    console.error('Error deleting plantilla:', err);
    error(res, 'SERVER_ERROR', 'Error deleting plantilla', 500);
  }
});

// Generate slots for a month from plantillas
app.post('/api/v1/plantillas/generar', requireAuth, requireRole('admin'), (req, res) => {
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

// ══════════════════════════════════════
// BLOQUEOS ENDPOINTS
// ══════════════════════════════════════

// List bloqueos (optionally filter by actividad_id or date range)
app.get('/api/v1/bloqueos', requireAuth, requireRole('admin'), (req, res) => {
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
app.post('/api/v1/bloqueos', requireAuth, requireRole('admin'), (req, res) => {
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
app.delete('/api/v1/bloqueos/:id', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const removed = remove('bloqueos_fechas', req.params.id);
    if (!removed) return error(res, 'NOT_FOUND', 'Bloqueo not found', 404);
    success(res, { deleted: true, id: req.params.id });
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error deleting bloqueo', 500);
  }
});

// Auto-generate slots for a date range from active plantillas (called by calendar navigation)
app.post('/api/v1/slots/auto-generate', requireAuth, requireRole('admin', 'vendedor'), (req, res) => {
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

// ══════════════════════════════════════
// CxC (CUENTAS POR COBRAR)
// ══════════════════════════════════════

// Admin: List all CxC with filters and summary
app.get('/api/v1/cxc', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const db = getDb();
    const { vendedor, cxc_estatus, fecha_desde, fecha_hasta } = req.query;
    let where = '(eliminado IS NULL OR eliminado = 0) AND vendedor IS NOT NULL';
    const params = [];

    if (vendedor) { where += ' AND vendedor = ?'; params.push(vendedor); }
    if (cxc_estatus) { where += ' AND cxc_estatus = ?'; params.push(cxc_estatus); }
    if (fecha_desde) { where += ' AND fecha >= ?'; params.push(fecha_desde); }
    if (fecha_hasta) { where += ' AND fecha <= ?'; params.push(fecha_hasta); }

    const tours = db.prepare(`
      SELECT id, fecha, hora, cliente, actividad, vendedor, estatus,
        precio_ingreso, comision_pct, monto_comision, ganancia_mahana,
        cxc_subtotal, cxc_itbm, cxc_total, cxc_estatus,
        cxc_factura_url, cxc_fecha_emision, cxc_fecha_vencimiento, cxc_fecha_pago,
        comprobante_url
      FROM reservas_tours
      WHERE ${where}
      ORDER BY fecha DESC
    `).all(...params);

    // Summary KPIs
    const summary = db.prepare(`
      SELECT
        COUNT(*) as total_tours,
        COALESCE(SUM(cxc_total), 0) as total_cxc,
        COALESCE(SUM(CASE WHEN cxc_estatus = 'Sin Factura' OR cxc_estatus IS NULL THEN cxc_total ELSE 0 END), 0) as sin_factura,
        COALESCE(SUM(CASE WHEN cxc_estatus = 'Pendiente' THEN cxc_total ELSE 0 END), 0) as pendiente,
        COALESCE(SUM(CASE WHEN cxc_estatus = 'Enviada' THEN cxc_total ELSE 0 END), 0) as enviada,
        COALESCE(SUM(CASE WHEN cxc_estatus = 'Pagada' THEN cxc_total ELSE 0 END), 0) as pagado,
        SUM(CASE WHEN cxc_estatus = 'Sin Factura' OR cxc_estatus IS NULL THEN 1 ELSE 0 END) as count_sin_factura,
        SUM(CASE WHEN cxc_estatus = 'Pendiente' THEN 1 ELSE 0 END) as count_pendiente,
        SUM(CASE WHEN cxc_estatus = 'Enviada' THEN 1 ELSE 0 END) as count_enviada,
        SUM(CASE WHEN cxc_estatus = 'Pagada' THEN 1 ELSE 0 END) as count_pagado
      FROM reservas_tours
      WHERE ${where}
    `).get(...params);

    // Aging — how long have pending invoices been outstanding
    const today = new Date().toISOString().split('T')[0];
    const aging = db.prepare(`
      SELECT
        SUM(CASE WHEN julianday(?) - julianday(cxc_fecha_emision) <= 15 THEN cxc_total ELSE 0 END) as corriente,
        SUM(CASE WHEN julianday(?) - julianday(cxc_fecha_emision) > 15 AND julianday(?) - julianday(cxc_fecha_emision) <= 30 THEN cxc_total ELSE 0 END) as dias_15_30,
        SUM(CASE WHEN julianday(?) - julianday(cxc_fecha_emision) > 30 AND julianday(?) - julianday(cxc_fecha_emision) <= 60 THEN cxc_total ELSE 0 END) as dias_30_60,
        SUM(CASE WHEN julianday(?) - julianday(cxc_fecha_emision) > 60 THEN cxc_total ELSE 0 END) as dias_60_plus
      FROM reservas_tours
      WHERE (eliminado IS NULL OR eliminado = 0) AND cxc_estatus IN ('Pendiente', 'Enviada') AND cxc_fecha_emision IS NOT NULL
    `).get(today, today, today, today, today, today);

    // Per-vendor summary
    const porVendedor = db.prepare(`
      SELECT vendedor,
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN cxc_estatus = 'Pendiente' THEN cxc_total ELSE 0 END), 0) as pendiente,
        COALESCE(SUM(CASE WHEN cxc_estatus = 'Pagada' THEN cxc_total ELSE 0 END), 0) as pagado
      FROM reservas_tours
      WHERE (eliminado IS NULL OR eliminado = 0) AND vendedor IS NOT NULL AND vendedor != ''
      GROUP BY vendedor
      ORDER BY pendiente DESC
    `).all();

    success(res, { tours, summary, aging, porVendedor });
  } catch (err) {
    console.error('Error loading CxC:', err);
    error(res, 'SERVER_ERROR', 'Error loading CxC', 500);
  }
});

// Admin: Update CxC on a tour (estatus, factura, dates)
app.patch('/api/v1/tours/:id/cxc', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const tour = findById('reservas_tours', req.params.id);
    if (!tour) return error(res, 'NOT_FOUND', 'Tour no encontrado', 404);

    const data = {};
    const allowed = ['cxc_estatus', 'cxc_factura_url', 'cxc_fecha_emision', 'cxc_fecha_vencimiento', 'cxc_fecha_pago'];
    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        data[field] = req.body[field];
      }
    }

    // If marking as Pendiente and no dates set, auto-fill
    if (data.cxc_estatus === 'Pendiente') {
      if (!data.cxc_fecha_emision && !tour.cxc_fecha_emision) {
        data.cxc_fecha_emision = new Date().toISOString().split('T')[0];
      }
      if (!data.cxc_fecha_vencimiento && !tour.cxc_fecha_vencimiento) {
        const venc = new Date();
        venc.setDate(venc.getDate() + 15);
        data.cxc_fecha_vencimiento = venc.toISOString().split('T')[0];
      }
    }

    // If marking as Pagada, auto-fill payment date
    if (data.cxc_estatus === 'Pagada' && !data.cxc_fecha_pago) {
      data.cxc_fecha_pago = new Date().toISOString().split('T')[0];
    }

    // Recalculate CxC amounts if not yet calculated
    if (!tour.cxc_total && tour.precio_ingreso) {
      Object.assign(data, calcCxC(tour));
    }

    const updated = update('reservas_tours', req.params.id, data);
    success(res, updated);

    // Notify CxC status change asynchronously
    if (data.cxc_estatus && data.cxc_estatus !== tour.cxc_estatus) {
      setImmediate(async () => {
        try {
          const fullTour = { ...tour, ...updated };
          await notifications.onCxCStatusChanged(fullTour, tour.cxc_estatus || 'Sin Factura', data.cxc_estatus);
        } catch (err) {
          console.error('🔔 CxC notification error:', err.message);
        }
      });
    }
  } catch (err) {
    console.error('Error updating CxC:', err);
    error(res, 'SERVER_ERROR', 'Error updating CxC', 500);
  }
});

// Admin: Preview email for a CxC tour (returns pre-filled data for popup)
app.get('/api/v1/tours/:id/cxc/email-preview', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const tour = findById('reservas_tours', req.params.id);
    if (!tour) return error(res, 'NOT_FOUND', 'Tour no encontrado', 404);

    const { tipo } = req.query; // emitida, enviada, pagada
    const email = require('./notifications/email');

    // Find partner email
    const db = getDb();
    const partner = tour.vendedor
      ? db.prepare('SELECT email FROM usuarios WHERE vendedor = ? AND rol = ? AND activo = 1').get(tour.vendedor, 'partner')
      : null;

    let html, subject, to;
    const cc = process.env.NOTIFY_EMAIL_CC || '';

    if (tipo === 'pagada') {
      html = email.facturaPagadaTemplate(tour);
      subject = `💰 Pago Registrado — ${tour.vendedor || ''} | Mahana`;
      to = partner?.email || '';
    } else {
      html = email.facturaEnviadaTemplate(tour);
      subject = tipo === 'emitida'
        ? `📄 Factura Generada — ${tour.actividad || 'Tour'} | Mahana`
        : `📄 Factura Enviada al Cobro — ${tour.actividad || 'Tour'} | Mahana`;
      to = partner?.email || '';
    }

    success(res, {
      to,
      cc,
      subject,
      html,
      has_attachment: !!tour.cxc_factura_url,
      attachment_url: tour.cxc_factura_url || null,
      tour_id: tour.id,
      vendedor: tour.vendedor,
    });
  } catch (err) {
    console.error('Error email preview:', err);
    error(res, 'SERVER_ERROR', 'Error generating preview', 500);
  }
});

// Admin: Send CxC email on demand (from popup)
app.post('/api/v1/tours/:id/cxc/send-email', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const tour = findById('reservas_tours', req.params.id);
    if (!tour) return error(res, 'NOT_FOUND', 'Tour no encontrado', 404);

    const { to, cc, subject, attach_factura } = req.body;
    if (!to || !subject) return error(res, 'VALIDATION_ERROR', 'to y subject son requeridos', 400);

    const emailModule = require('./notifications/email');

    let result;
    if (attach_factura && tour.cxc_factura_url) {
      // Send with attachment + optional CC
      // Convert URL path (/uploads/file.jpg) to absolute filesystem path
      const fileName = path.basename(tour.cxc_factura_url);
      const filePath = path.join(uploadsDir, fileName);
      const ext = path.extname(fileName) || '.pdf';
      const html = emailModule.facturaEnviadaTemplate(tour);
      result = await emailModule.sendEmailWithAttachment(
        to,
        subject,
        html,
        filePath,
        `Factura_Mahana_${tour.id}${ext}`,
        cc || undefined
      );
    } else {
      const tipo = tour.cxc_estatus === 'Pagada' ? 'pagada' : 'enviada';
      const html = tipo === 'pagada'
        ? emailModule.facturaPagadaTemplate(tour)
        : emailModule.facturaEnviadaTemplate(tour);
      result = await emailModule.sendEmail(to, subject, html, cc || undefined);
    }

    if (result.success) {
      success(res, { sent: true, messageId: result.messageId });
    } else {
      const msg = result.reason === 'not_configured'
        ? 'Email no configurado — falta SMTP_PASS en variables de entorno'
        : (result.error || 'Error al enviar email');
      error(res, 'EMAIL_FAILED', msg, 500);
    }
  } catch (err) {
    console.error('Error sending CxC email:', err);
    error(res, 'SERVER_ERROR', `Error al enviar email: ${err.message || 'Error interno'}`, 500);
  }
});

// Partner: View their own CxC
app.get('/api/v1/partner/cxc', requireAuth, (req, res) => {
  try {
    if (!isPartner(req)) return error(res, 'FORBIDDEN', 'Solo para partners', 403);
    const db = getDb();
    const vendedor = req.user.vendedor;

    const tours = db.prepare(`
      SELECT id, fecha, hora, cliente, actividad, estatus,
        precio_ingreso, comision_pct, monto_comision,
        cxc_subtotal, cxc_itbm, cxc_total, cxc_estatus,
        cxc_factura_url, cxc_fecha_emision, cxc_fecha_vencimiento, cxc_fecha_pago
      FROM reservas_tours
      WHERE (eliminado IS NULL OR eliminado = 0) AND vendedor = ?
        AND cxc_estatus IS NOT NULL AND cxc_estatus != 'Sin Factura'
      ORDER BY fecha DESC
    `).all(vendedor);

    const summary = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN cxc_estatus = 'Pendiente' THEN cxc_total ELSE 0 END), 0) as pendiente,
        COALESCE(SUM(CASE WHEN cxc_estatus = 'Enviada' THEN cxc_total ELSE 0 END), 0) as enviada,
        COALESCE(SUM(CASE WHEN cxc_estatus IN ('Pendiente', 'Enviada') THEN cxc_total ELSE 0 END), 0) as por_pagar,
        COALESCE(SUM(CASE WHEN cxc_estatus = 'Pagada' THEN cxc_total ELSE 0 END), 0) as pagado,
        SUM(CASE WHEN cxc_estatus = 'Pendiente' THEN 1 ELSE 0 END) as count_pendiente,
        SUM(CASE WHEN cxc_estatus = 'Enviada' THEN 1 ELSE 0 END) as count_enviada,
        SUM(CASE WHEN cxc_estatus IN ('Pendiente', 'Enviada') THEN 1 ELSE 0 END) as count_por_pagar,
        SUM(CASE WHEN cxc_estatus = 'Pagada' THEN 1 ELSE 0 END) as count_pagado
      FROM reservas_tours
      WHERE (eliminado IS NULL OR eliminado = 0) AND vendedor = ?
        AND cxc_estatus IS NOT NULL AND cxc_estatus != 'Sin Factura'
    `).get(vendedor);

    success(res, { tours, summary });
  } catch (err) {
    console.error('Error loading partner CxC:', err);
    error(res, 'SERVER_ERROR', 'Error loading CxC', 500);
  }
});

// ══════════════════════════════════════
// WHATSAPP API
// ══════════════════════════════════════

const whatsapp = require('./notifications/whatsapp');

// Get WhatsApp status
app.get('/api/v1/whatsapp/status', requireAuth, requireRole('admin'), (req, res) => {
  success(res, whatsapp.getStatus());
});

// Get QR code as base64 PNG (for scanning in browser)
app.get('/api/v1/whatsapp/qr', requireAuth, requireRole('admin'), (req, res) => {
  const qr = whatsapp.getCurrentQR();
  if (!qr) {
    return error(res, 'NO_QR', whatsapp.getStatus().connected
      ? 'WhatsApp ya está conectado — no se necesita QR'
      : 'No hay QR disponible. Verifica que WHATSAPP_ENABLED=true y reinicia el servidor.', 404);
  }
  success(res, { qr, status: whatsapp.getStatus() });
});

// Send test message
app.post('/api/v1/whatsapp/test', requireAuth, requireRole('admin'), async (req, res) => {
  const { numero } = req.body;
  const target = numero || whatsapp.WHATSAPP_NOTIFY_NUMBER;
  if (!target) return error(res, 'VALIDATION_ERROR', 'Número requerido', 400);
  const result = await whatsapp.sendWhatsApp(target, '✅ *Mahana Portal* — Mensaje de prueba. WhatsApp está conectado correctamente.');
  success(res, result);
});

// Reset WhatsApp session (clear and reconnect)
app.post('/api/v1/whatsapp/reset', requireAuth, requireRole('admin'), async (req, res) => {
  whatsapp.clearSession();
  setTimeout(() => whatsapp.connectWhatsApp(), 1000);
  success(res, { message: 'Session cleared. Reconnecting... Check /whatsapp/qr in a few seconds for the new QR code.' });
});

// ══════════════════════════════════════
// PUBLIC API (NO AUTH — Rate Limited)
// ══════════════════════════════════════

// Simple in-memory rate limiter for public endpoints
const rateLimitStore = new Map();
function publicRateLimit(maxRequests = 30, windowMs = 60000) {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const key = `${ip}-${req.path}`;
    const entry = rateLimitStore.get(key) || { count: 0, startTime: now };
    
    if (now - entry.startTime > windowMs) {
      entry.count = 1;
      entry.startTime = now;
    } else {
      entry.count++;
    }
    rateLimitStore.set(key, entry);
    
    if (entry.count > maxRequests) {
      return res.status(429).json({ success: false, error: { code: 'RATE_LIMIT', message: 'Demasiadas solicitudes. Intenta en un momento.' } });
    }
    next();
  };
}

// Clean rate limit store every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (now - entry.startTime > 120000) rateLimitStore.delete(key);
  }
}, 300000);

// Public: Get all visible products
app.get('/api/v1/public/productos', publicRateLimit(60), (req, res) => {
  try {
    const db = getDb();
    const { sitio } = req.query; // optional filter by site
    let sql = `
      SELECT id, nombre, slug, tipo, precio_base, categoria, descripcion, 
             duracion, duracion_min, horario, punto_encuentro, que_incluye, 
             que_llevar, requisitos, capacidad_max, imagen_url, sitios
      FROM actividades 
      WHERE activa = 1 AND visible_web = 1
    `;
    const productos = db.prepare(sql).all();
    
    // If sitio filter, filter by JSON sitios field
    let filtered = productos;
    if (sitio) {
      filtered = productos.filter(p => {
        if (!p.sitios) return false;
        try { return JSON.parse(p.sitios).includes(sitio); }
        catch { return false; }
      });
    }
    
    success(res, filtered);
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error loading products', 500);
  }
});

// Public: Get single product by slug
app.get('/api/v1/public/productos/:slug', publicRateLimit(60), (req, res) => {
  try {
    const db = getDb();
    const producto = db.prepare(`
      SELECT id, nombre, slug, tipo, precio_base, categoria, descripcion, 
             duracion, duracion_min, horario, punto_encuentro, que_incluye, 
             que_llevar, requisitos, capacidad_max, imagen_url, sitios, modo_booking
      FROM actividades 
      WHERE slug = ? AND activa = 1 AND visible_web = 1
    `).get(req.params.slug);
    
    if (!producto) return error(res, 'NOT_FOUND', 'Producto no encontrado', 404);

    // Use product's modo_booking from DB (default: 'directo' = calendar flow)
    const modo_booking = producto.modo_booking || 'directo';
    
    // Get PayPal config (public - only expose client ID and enabled status)
    // Check DB first, then env vars as fallback
    const paypalEnabledDB = db.prepare("SELECT valor FROM configuracion_pagos WHERE clave = 'paypal_enabled'").get();
    const paypalClientIdDB = db.prepare("SELECT valor FROM configuracion_pagos WHERE clave = 'paypal_client_id'").get();
    const paypalModeDB = db.prepare("SELECT valor FROM configuracion_pagos WHERE clave = 'paypal_mode'").get();
    
    const ppClientId = paypalClientIdDB?.valor || process.env.PAYPAL_CLIENT_ID || '';
    const ppEnabled = (paypalEnabledDB?.valor === '1' || paypalEnabledDB?.valor === 'true') || !!process.env.PAYPAL_CLIENT_ID;
    const ppMode = paypalModeDB?.valor || process.env.PAYPAL_MODE || 'sandbox';
    
    success(res, {
      ...producto,
      modo_booking,
      pago: {
        paypal_enabled: ppEnabled,
        paypal_client_id: ppEnabled ? ppClientId : null,
        paypal_mode: ppMode,
      }
    });
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error loading product', 500);
  }
});

// Public: Monthly availability for a product (which days have openings)
app.get('/api/v1/public/disponibilidad/:slug', publicRateLimit(60), (req, res) => {
  try {
    const db = getDb();
    const { mes } = req.query; // YYYY-MM
    if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
      return error(res, 'VALIDATION_ERROR', 'Parámetro mes requerido (formato: YYYY-MM)', 400);
    }
    
    const producto = db.prepare('SELECT id, nombre FROM actividades WHERE slug = ? AND activa = 1 AND visible_web = 1').get(req.params.slug);
    if (!producto) return error(res, 'NOT_FOUND', 'Producto no encontrado', 404);
    
    const year = parseInt(mes.split('-')[0]);
    const month = parseInt(mes.split('-')[1]);
    const daysInMonth = new Date(year, month, 0).getDate();
    const desde = `${mes}-01`;
    const hasta = `${mes}-${String(daysInMonth).padStart(2, '0')}`;
    
    // ── Auto-generate slots from plantillas (INSERT OR IGNORE = safe to re-run) ──
    try {
      const plantillas = db.prepare(
        'SELECT * FROM plantillas_horario WHERE activa = 1 AND actividad_id = ?'
      ).all(producto.id);
      
      if (plantillas.length > 0) {
        const bloqueosPre = db.prepare(
          'SELECT actividad_id, fecha FROM bloqueos_fechas WHERE fecha >= ? AND fecha <= ?'
        ).all(desde, hasta);
        const bloqueosPreSet = new Set(bloqueosPre.map(b => `${b.actividad_id || 'all'}-${b.fecha}`));
        
        const insertStmt = db.prepare(
          'INSERT OR IGNORE INTO horarios_slots (actividad_id, fecha, hora, capacidad, reservados, bloqueado) VALUES (?, ?, ?, ?, 0, 0)'
        );
        const txn = db.transaction(() => {
          for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month - 1, day);
            const dayOfWeek = date.getDay();
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            for (const p of plantillas) {
              if (p.dia_semana === dayOfWeek) {
                if (bloqueosPreSet.has(`${p.actividad_id}-${dateStr}`) || bloqueosPreSet.has(`all-${dateStr}`)) continue;
                insertStmt.run(p.actividad_id, dateStr, p.hora, p.capacidad);
              }
            }
          }
        });
        txn();
      }
    } catch (genErr) {
      console.error('Auto-generate in public endpoint (non-fatal):', genErr.message);
    }
    
    // Get booking config for min anticipation
    const anticipacionRow = db.prepare("SELECT valor FROM reservas_config WHERE clave = 'anticipacion_min_horas'").get();
    const anticipacionHoras = parseInt(anticipacionRow?.valor || '24');
    const ahora = new Date();
    const minDate = new Date(ahora.getTime() + anticipacionHoras * 60 * 60 * 1000);
    
    // Get slots + bloqueos
    const slots = db.prepare(`
      SELECT fecha, hora, capacidad, reservados, bloqueado
      FROM horarios_slots
      WHERE actividad_id = ? AND fecha >= ? AND fecha <= ?
      ORDER BY fecha, hora
    `).all(producto.id, desde, hasta);
    
    const bloqueos = db.prepare(`
      SELECT fecha FROM bloqueos_fechas
      WHERE (actividad_id = ? OR actividad_id IS NULL) AND fecha >= ? AND fecha <= ?
    `).all(producto.id, desde, hasta);
    const bloqueosSet = new Set(bloqueos.map(b => b.fecha));
    
    // Build daily summary for the calendar
    const dias = {};
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${mes}-${String(d).padStart(2, '0')}`;
      const daySlots = slots.filter(s => s.fecha === dateStr && !s.bloqueado);
      
      // Use explicit local date comparison to avoid timezone drift
      const available = daySlots.filter(s => {
        const slotDatetime = new Date(`${dateStr}T${s.hora}:00`);
        return slotDatetime > minDate && (s.capacidad - s.reservados) > 0;
      });
      
      const disponibles = available.reduce((sum, s) => sum + (s.capacidad - s.reservados), 0);
      const bloqueado = bloqueosSet.has(dateStr);
      const isPast = dateStr < ahora.toISOString().split('T')[0];
      
      let estado = 'sin_slots';
      if (bloqueado) estado = 'bloqueado';
      else if (isPast) estado = 'pasado';
      else if (disponibles > 0) estado = 'disponible';
      else if (daySlots.length > 0) estado = 'lleno';
      
      dias[dateStr] = { estado, disponibles: Math.max(disponibles, 0), total_slots: available.length };
    }
    
    success(res, { producto: producto.nombre, mes, dias });
  } catch (err) {
    console.error('Error fetching public availability:', err);
    error(res, 'SERVER_ERROR', 'Error loading availability', 500);
  }
});

// Public: Available time slots for a specific day
app.get('/api/v1/public/slots/:slug', publicRateLimit(60), (req, res) => {
  try {
    const db = getDb();
    const { fecha } = req.query;
    if (!fecha) return error(res, 'VALIDATION_ERROR', 'Parámetro fecha requerido (YYYY-MM-DD)', 400);
    
    const producto = db.prepare('SELECT id, nombre, precio_base FROM actividades WHERE slug = ? AND activa = 1 AND visible_web = 1').get(req.params.slug);
    if (!producto) return error(res, 'NOT_FOUND', 'Producto no encontrado', 404);
    
    // Check if date is blocked
    const bloqueado = db.prepare(
      'SELECT id FROM bloqueos_fechas WHERE (actividad_id = ? OR actividad_id IS NULL) AND fecha = ?'
    ).get(producto.id, fecha);
    if (bloqueado) return success(res, { slots: [], bloqueado: true });
    
    // Check min anticipation
    const anticipacionRow = db.prepare("SELECT valor FROM reservas_config WHERE clave = 'anticipacion_min_horas'").get();
    const anticipacionHoras = parseInt(anticipacionRow?.valor || '24');
    const ahora = new Date();
    const minTime = new Date(ahora.getTime() + anticipacionHoras * 60 * 60 * 1000);
    
    const slots = db.prepare(`
      SELECT id, hora, capacidad, reservados
      FROM horarios_slots
      WHERE actividad_id = ? AND fecha = ? AND bloqueado = 0
      ORDER BY hora
    `).all(producto.id, fecha);
    
    // Filter out slots that don't meet min anticipation (same-day check)
    const slotsFiltered = slots.filter(s => {
      const slotTime = new Date(`${fecha}T${s.hora}:00`);
      return slotTime > minTime;
    }).map(s => ({
      id: s.id,
      hora: s.hora,
      disponibles: Math.max(s.capacidad - s.reservados, 0),
      capacidad: s.capacidad,
    }));
    
    success(res, { 
      producto: producto.nombre,
      precio: producto.precio_base,
      fecha,
      bloqueado: false,
      slots: slotsFiltered 
    });
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error loading slots', 500);
  }
});

// Public: Create a booking/reservation
app.post('/api/v1/public/reservar', publicRateLimit(5, 60000), (req, res) => {
  try {
    const { slug, slot_id, fecha, hora, personas, nombre, email, whatsapp: wapp, notas, modo } = req.body;
    
    // Validation
    if (!slug || !nombre || !email || !personas) {
      return error(res, 'VALIDATION_ERROR', 'Campos requeridos: slug, nombre, email, personas', 400);
    }
    if (personas < 1 || personas > 50) {
      return error(res, 'VALIDATION_ERROR', 'Personas debe ser entre 1 y 50', 400);
    }
    
    const db = getDb();
    const producto = db.prepare('SELECT id, nombre, precio_base FROM actividades WHERE slug = ? AND activa = 1').get(slug);
    if (!producto) return error(res, 'NOT_FOUND', 'Producto no encontrado', 404);
    
    // If agent mode, create lead without checking slots
    if (modo === 'agente') {
      // Create a booking record in agent mode
      const codigo = `AGT-${Date.now().toString(36).toUpperCase()}`;
      db.prepare(`
        INSERT INTO reservas_booking (codigo, actividad_id, slug, fecha, hora, personas, nombre, email, whatsapp, notas, estado, modo, precio_total, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente_agente', 'agente', ?, datetime('now'))
      `).run(codigo, producto.id, slug, fecha || 'por_definir', hora || 'por_definir', personas, nombre, email, wapp || '', notas || '', (producto.precio_base || 0) * personas);
      
      // Create reservas_tours record for admin dashboard
      try {
        create('reservas_tours', {
          cliente: nombre,
          whatsapp: wapp || '',
          email_cliente: email,
          actividad: producto.nombre,
          fecha: fecha || 'por_definir',
          hora: hora || 'por_definir',
          pax: personas,
          notas: `[Web Lead] Código: ${codigo}. ${notas || ''}`,
          fuente: 'web-agente',
          estatus: 'Por Aprobar',
          vendedor: 'Web Lead',
          solicitado_por: 'Cliente Web',
          gestionado_por: 'Sistema',
        });
      } catch (tourErr) {
        console.error('Error creating admin tour record:', tourErr.message);
      }
      
      // Send Telegram notification (async)
      notifications.onBookingCreated({
        codigo, producto: producto.nombre, slug, fecha: fecha || 'por_definir', hora: hora || 'por_definir',
        personas, nombre, email, whatsapp: wapp, precio_total: (producto.precio_base || 0) * personas,
        estado: 'pendiente_agente', modo: 'agente'
      }).catch(err => console.error('Booking notification error:', err.message));
      
      return success(res, {
        codigo,
        estado: 'pendiente_agente',
        mensaje: 'Un agente se pondrá en contacto contigo pronto.',
        producto: producto.nombre,
      }, null, 201);
    }
    
    // Direct booking mode — verify slot availability
    if (!slot_id && (!fecha || !hora)) {
      return error(res, 'VALIDATION_ERROR', 'Para reserva directa se requiere slot_id o fecha+hora', 400);
    }
    
    let slot;
    if (slot_id) {
      slot = db.prepare('SELECT * FROM horarios_slots WHERE id = ? AND bloqueado = 0').get(slot_id);
    } else {
      slot = db.prepare('SELECT * FROM horarios_slots WHERE actividad_id = ? AND fecha = ? AND hora = ? AND bloqueado = 0').get(producto.id, fecha, hora);
    }
    
    if (!slot) return error(res, 'NOT_FOUND', 'Horario no disponible', 404);
    
    const disponibles = slot.capacidad - slot.reservados;
    if (disponibles < personas) {
      return error(res, 'NO_AVAILABILITY', `Solo hay ${disponibles} cupo(s) disponible(s)`, 409);
    }
    
    // Create booking atomically
    const codigo = `BK-${Date.now().toString(36).toUpperCase()}`;
    const precioNeto = (producto.precio_base || 0) * personas;
    const itbm = Math.round(precioNeto * 0.07 * 100) / 100;
    const precioTotal = Math.round((precioNeto + itbm) * 100) / 100;
    
    const transaction = db.transaction(() => {
      // Update slot reservados
      db.prepare('UPDATE horarios_slots SET reservados = reservados + ? WHERE id = ?').run(personas, slot.id);
      
      // Create booking record
      db.prepare(`
        INSERT INTO reservas_booking (codigo, actividad_id, slug, fecha, hora, personas, nombre, email, whatsapp, notas, estado, modo, slot_id, precio_total, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente_pago', 'directo', ?, ?, datetime('now'))
      `).run(codigo, producto.id, slug, slot.fecha, slot.hora, personas, nombre, email, wapp || '', notas || '', slot.id, precioTotal);
    });
    transaction();
    
    success(res, {
      codigo,
      estado: 'pendiente_pago',
      producto: producto.nombre,
      fecha: slot.fecha,
      hora: slot.hora,
      personas,
      precio_total: precioTotal,
      moneda: 'USD',
    }, null, 201);
    
    // Create reservas_tours record so it appears in admin dashboard
    try {
      create('reservas_tours', {
        cliente: nombre,
        whatsapp: wapp || '',
        email_cliente: email,
        actividad: producto.nombre,
        fecha: slot.fecha,
        hora: slot.hora,
        pax: personas,
        notas: `[Web Directa] Código: ${codigo}. ${notas || ''}`,
        fuente: 'web-directo',
        estatus: 'Por Aprobar',
        precio_ingreso: precioTotal,
        vendedor: 'Web Directa',
        solicitado_por: 'Cliente Web',
        gestionado_por: 'Sistema',
        booking_codigo: codigo,
      });
    } catch (tourErr) {
      console.error('Error creating admin tour record:', tourErr.message);
    }
    
    // Send Telegram notification (async, don't block response)
    notifications.onBookingCreated({
      codigo, producto: producto.nombre, slug, fecha: slot.fecha, hora: slot.hora,
      personas, nombre, email, whatsapp: wapp, precio_total: precioTotal,
      estado: 'pendiente_pago', modo: 'directo'
    }).catch(err => console.error('Booking notification error:', err.message));
  } catch (err) {
    console.error('Error creating booking:', err);
    error(res, 'SERVER_ERROR', 'Error al crear reserva', 500);
  }
});

// Public: Check booking status
app.get('/api/v1/public/reserva/:codigo', publicRateLimit(30), (req, res) => {
  try {
    const db = getDb();
    const booking = db.prepare(`
      SELECT rb.*, a.nombre as actividad_nombre 
      FROM reservas_booking rb
      JOIN actividades a ON a.id = rb.actividad_id
      WHERE rb.codigo = ?
    `).get(req.params.codigo);
    
    if (!booking) return error(res, 'NOT_FOUND', 'Reserva no encontrada', 404);
    
    success(res, {
      codigo: booking.codigo,
      estado: booking.estado,
      producto: booking.actividad_nombre,
      fecha: booking.fecha,
      hora: booking.hora,
      personas: booking.personas,
      nombre: booking.nombre,
      precio_total: booking.precio_total,
      modo: booking.modo,
      created_at: booking.created_at,
    });
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error', 500);
  }
});

// Public: Confirm payment (PayPal callback)
app.post('/api/v1/public/pago/confirmar', publicRateLimit(10), (req, res) => {
  try {
    const { codigo, paypal_order_id, paypal_payer_id } = req.body;
    if (!codigo) return error(res, 'VALIDATION_ERROR', 'Código de reserva requerido', 400);
    
    const db = getDb();
    const booking = db.prepare('SELECT * FROM reservas_booking WHERE codigo = ?').get(codigo);
    if (!booking) return error(res, 'NOT_FOUND', 'Reserva no encontrada', 404);
    if (booking.estado !== 'pendiente_pago') {
      return error(res, 'INVALID_STATE', 'Esta reserva ya fue procesada', 400);
    }
    
    // Update booking status
    db.prepare(`
      UPDATE reservas_booking 
      SET estado = 'pagado', paypal_order_id = ?, paypal_payer_id = ?, paid_at = datetime('now')
      WHERE codigo = ?
    `).run(paypal_order_id || '', paypal_payer_id || '', codigo);
    
    // Send Telegram notification (async)
    notifications.onBookingPaid({
      ...booking, paypal_order_id: paypal_order_id || '',
    }).catch(err => console.error('Booking paid notification error:', err.message));
    
    success(res, {
      codigo,
      estado: 'pagado',
      mensaje: '¡Pago confirmado! Tu reserva está lista.',
    });
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error confirming payment', 500);
  }
});

// ══════════════════════════════════════
// PAYPAL ORDER API
// ══════════════════════════════════════

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

// Create PayPal order for a booking
app.post('/api/v1/public/paypal/create-order', publicRateLimit(10), async (req, res1) => {
  try {
    const { codigo } = req.body;
    if (!codigo) return error(res1, 'VALIDATION_ERROR', 'Código de reserva requerido', 400);
    if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
      return error(res1, 'CONFIG_ERROR', 'PayPal no está configurado', 500);
    }
    
    const db = getDb();
    const booking = db.prepare('SELECT * FROM reservas_booking WHERE codigo = ?').get(codigo);
    if (!booking) return error(res1, 'NOT_FOUND', 'Reserva no encontrada', 404);
    if (booking.estado !== 'pendiente_pago') {
      return error(res1, 'INVALID_STATE', 'Esta reserva ya fue procesada', 400);
    }
    
    const producto = db.prepare('SELECT nombre FROM actividades WHERE id = ?').get(booking.actividad_id);
    const accessToken = await getPayPalAccessToken();
    
    const orderRes = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: booking.codigo,
          description: `${producto?.nombre || booking.slug} - ${booking.fecha} ${booking.hora} (${booking.personas} pax)`,
          amount: {
            currency_code: 'USD',
            value: String(booking.precio_total.toFixed(2)),
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
      // Store PayPal order ID in booking
      db.prepare('UPDATE reservas_booking SET paypal_order_id = ? WHERE codigo = ?').run(orderData.id, codigo);
      success(res1, { orderID: orderData.id });
    } else {
      console.error('PayPal create order error:', orderData);
      error(res1, 'PAYPAL_ERROR', orderData.message || 'Error creating PayPal order', 500);
    }
  } catch (err) {
    console.error('PayPal create order error:', err);
    error(res1, 'SERVER_ERROR', 'Error creating PayPal order', 500);
  }
});

// Capture PayPal order (after buyer approves)
app.post('/api/v1/public/paypal/capture-order', publicRateLimit(10), async (req, res1) => {
  try {
    const { orderID, codigo } = req.body;
    if (!orderID || !codigo) return error(res1, 'VALIDATION_ERROR', 'orderID y codigo requeridos', 400);
    
    // Validate orderID format (prevent path traversal)
    if (!/^[A-Z0-9-]{10,50}$/i.test(orderID)) {
      return error(res1, 'VALIDATION_ERROR', 'Formato de orderID inválido', 400);
    }
    
    const db = getDb();
    const booking = db.prepare('SELECT * FROM reservas_booking WHERE codigo = ?').get(codigo);
    if (!booking) return error(res1, 'NOT_FOUND', 'Reserva no encontrada', 404);
    if (booking.estado !== 'pendiente_pago') {
      return error(res1, 'INVALID_STATE', 'Esta reserva ya fue procesada', 400);
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
      
      // Update booking as paid
      db.prepare(`
        UPDATE reservas_booking 
        SET estado = 'pagado', paypal_order_id = ?, paypal_payer_id = ?, paid_at = datetime('now')
        WHERE codigo = ?
      `).run(orderID, payerId, codigo);
      
      // Also update the reservas_tours record (by booking_codigo, not LIKE)
      db.prepare(`
        UPDATE reservas_tours SET estatus = 'Pagado' 
        WHERE booking_codigo = ?
      `).run(codigo);
      
      // Send notification
      notifications.onBookingPaid({
        ...booking, paypal_order_id: orderID, payer_email: payerEmail,
      }).catch(err => console.error('Booking paid notification error:', err.message));
      
      success(res1, {
        codigo,
        estado: 'pagado',
        paypal_status: 'COMPLETED',
        mensaje: '¡Pago confirmado! Tu reserva está lista.',
      });
    } else {
      console.error('PayPal capture failed:', captureData);
      error(res1, 'PAYPAL_ERROR', captureData.message || 'Payment not completed', 400);
    }
  } catch (err) {
    console.error('PayPal capture error:', err);
    error(res1, 'SERVER_ERROR', 'Error capturing payment', 500);
  }
});

// ══════════════════════════════════════
// PARTNER PAYPAL ENDPOINTS
// ══════════════════════════════════════

// Partner: Get PayPal config (reuses same global config)
app.get('/api/v1/partner/paypal-config', requireAuth, (req, res) => {
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
app.post('/api/v1/partner/paypal/create-order', requireAuth, async (req, res1) => {
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
app.post('/api/v1/partner/paypal/capture-order', requireAuth, async (req, res1) => {
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

// ══════════════════════════════════════
// QUALITY SYSTEM — TICKETS
// ══════════════════════════════════════

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

// List tickets
app.get('/api/v1/tickets', requireAuth, (req, res) => {
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
app.get('/api/v1/tickets/stats', requireAuth, (req, res) => {
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
app.get('/api/v1/tickets/recurrencia', requireAuth, (req, res) => {
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
app.get('/api/v1/tickets/:id', requireAuth, (req, res) => {
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
app.post('/api/v1/tickets', requireAuth, (req, res) => {
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
app.put('/api/v1/tickets/:id', requireAuth, requireRole('admin'), (req, res) => {
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
app.patch('/api/v1/tickets/:id/status', requireAuth, requireRole('admin'), (req, res) => {
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
app.patch('/api/v1/tickets/:id/assign', requireAuth, requireRole('admin'), (req, res) => {
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

// ══════════════════════════════════════
// QUALITY SYSTEM — SATISFACCIÓN
// ══════════════════════════════════════

// Get satisfaction scores
app.get('/api/v1/satisfaccion', requireAuth, (req, res) => {
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
app.get('/api/v1/satisfaccion/ranking', requireAuth, (req, res) => {
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
app.post('/api/v1/satisfaccion', requireAuth, (req, res) => {
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

// ══════════════════════════════════════
// QUALITY SYSTEM — PARTNER TICKETS
// ══════════════════════════════════════

app.get('/api/v1/partner/tickets', requireAuth, (req, res) => {
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

app.post('/api/v1/partner/tickets', requireAuth, (req, res) => {
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
app.get('/api/v1/partner/satisfaccion', requireAuth, (req, res) => {
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

// ══════════════════════════════════════
// QUALITY SYSTEM — PUBLIC REVIEW PAGE
// ══════════════════════════════════════

// Get review data (public, no auth)
app.get('/api/v1/public/resena/:codigo', (req, res) => {
  try {
    const db = getDb();
    const { codigo } = req.params;

    // Check if already reviewed
    const existing = db.prepare('SELECT id FROM satisfaccion_tours WHERE codigo_resena = ?').get(codigo);
    if (existing) {
      return error(res, 'ALREADY_REVIEWED', 'Esta reseña ya fue enviada', 400);
    }

    // Find tour by review code
    const tour = db.prepare('SELECT id, cliente, actividad, vendedor, responsable, fecha, hora FROM reservas_tours WHERE review_codigo = ?').get(codigo);
    if (!tour) {
      return error(res, 'NOT_FOUND', 'Enlace de reseña no válido o expirado', 404);
    }

    success(res, {
      codigo,
      cliente: tour.cliente,
      actividad: tour.actividad,
      vendedor: tour.vendedor,
      responsable: tour.responsable,
      fecha: tour.fecha,
      hora: tour.hora,
      tour_id: tour.id
    });
  } catch (err) {
    console.error('Error fetching review data:', err);
    error(res, 'SERVER_ERROR', 'Error fetching review data', 500);
  }
});

// Submit review (public, no auth)
app.post('/api/v1/public/resena/:codigo', (req, res) => {
  try {
    const db = getDb();
    const { codigo } = req.params;

    // Check if already reviewed
    const existingReview = db.prepare('SELECT id FROM satisfaccion_tours WHERE codigo_resena = ?').get(codigo);
    if (existingReview) {
      return error(res, 'ALREADY_REVIEWED', 'Esta reseña ya fue enviada', 400);
    }

    // Find tour
    const tour = db.prepare('SELECT * FROM reservas_tours WHERE review_codigo = ?').get(codigo);
    if (!tour) {
      return error(res, 'NOT_FOUND', 'Enlace de reseña no válido', 404);
    }

    const { score_general, score_guia, score_puntualidad, score_equipamiento, score_valor, comentario } = req.body;
    if (!score_general || score_general < 1 || score_general > 5) {
      return error(res, 'VALIDATION_ERROR', 'score_general (1-5) es requerido', 400);
    }

    const shouldRedirectGoogle = score_general >= 4;
    const tipoSolicitud = req.body.tipo_solicitud || 'link_resena';
    const fuente = tipoSolicitud === 'solicitada' ? 'solicitada' : 'link_resena';

    const review = create('satisfaccion_tours', {
      codigo_resena: codigo,
      tour_id: tour.id,
      actividad: tour.actividad,
      vendedor: tour.vendedor,
      responsable: tour.responsable,
      cliente: tour.cliente,
      score_general,
      score_guia: score_guia || null,
      score_puntualidad: score_puntualidad || null,
      score_equipamiento: score_equipamiento || null,
      score_valor: score_valor || null,
      comentario: comentario ? sanitize(comentario) : null,
      fuente,
      redirigido_google: shouldRedirectGoogle ? 1 : 0
    });

    // Auto-create ticket for low scores
    if (score_general <= 3) {
      try {
        const ticketData = {
          codigo: generateTicketCode(),
          tour_id: tour.id,
          actividad: tour.actividad,
          vendedor: tour.vendedor,
          responsable: tour.responsable,
          cliente: tour.cliente,
          whatsapp: tour.whatsapp,
          email: tour.email_cliente,
          tipo: 'queja',
          categoria: 'atencion',
          prioridad: score_general <= 2 ? 'alta' : 'media',
          canal_origen: 'resena',
          descripcion: comentario
            ? `Reseña con score ${score_general}/5: ${sanitize(comentario)}`
            : `Reseña con score ${score_general}/5 — sin comentario adicional`,
          creado_por: 'Sistema (auto-ticket por reseña baja)'
        };

        // Auto-escalate on recurrence
        const recurrence = detectRecurrence(ticketData.actividad, ticketData.categoria);
        if (recurrence.isRecurrent) ticketData.prioridad = 'alta';

        create('tickets_servicio', ticketData);
        console.log(`🎫 Auto-created ticket for low review score (${score_general}/5) on tour #${tour.id}`);

        // Notify
        setImmediate(async () => {
          try {
            await notifications.onTicketCreated?.({ ...ticketData, recurrence });
          } catch (err) {
            console.error('🔔 Notification error (auto-ticket):', err.message);
          }
        });
      } catch (ticketErr) {
        console.error('Error auto-creating ticket:', ticketErr);
      }
    }

    success(res, {
      review,
      redirect_google: shouldRedirectGoogle,
      google_review_url: shouldRedirectGoogle ? (process.env.GOOGLE_REVIEW_URL || 'https://g.page/r/YOUR_BUSINESS/review') : null
    }, null, 201);

    // Notify review
    setImmediate(async () => {
      try {
        await notifications.onReviewSubmitted?.({ ...review, tour_actividad: tour.actividad, tour_cliente: tour.cliente });
      } catch (err) {
        console.error('🔔 Notification error (review):', err.message);
      }
    });
  } catch (err) {
    console.error('Error submitting review:', err);
    error(res, 'SERVER_ERROR', 'Error submitting review', 500);
  }
});

// Generate review link for a tour
app.post('/api/v1/tours/:id/link-resena', requireAuth, (req, res) => {
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

// ══════════════════════════════════════
// STATIC FILES + SPA FALLBACK
// ══════════════════════════════════════

const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath) && fs.existsSync(path.join(distPath, 'index.html'))) {
  console.log('✅ Frontend found at:', distPath);
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    // Don't catch API routes or uploaded files
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Endpoint not found' } });
    }
    if (req.path.startsWith('/uploads/')) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'File not found' } });
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
app.listen(PORT, async () => {
  console.log(`🚀 Mahana Portal v2 running on port ${PORT}`);
  console.log(`📡 API: http://localhost:${PORT}/api/v1/api-status`);

  // Seed users only if table is empty — passwords read from env vars
  try {
    const db = getDb();
    const count = db.prepare('SELECT COUNT(*) as c FROM usuarios').get();
    if (count.c === 0) {
      const bcrypt = require('bcryptjs');
      const adminPass = process.env.SEED_ADMIN_PASSWORD || 'change-me-immediately';
      const partnerPass = process.env.SEED_PARTNER_PASSWORD || 'change-me-immediately';
      if (process.env.NODE_ENV === 'production' && (!process.env.SEED_ADMIN_PASSWORD || !process.env.SEED_PARTNER_PASSWORD)) {
        console.warn('⚠️  WARNING: Using default seed passwords. Set SEED_ADMIN_PASSWORD and SEED_PARTNER_PASSWORD env vars.');
      }
      const h1 = bcrypt.hashSync(adminPass, 10);
      const h2 = bcrypt.hashSync(partnerPass, 10);
      db.prepare('INSERT INTO usuarios (email, password_hash, nombre, rol, vendedor) VALUES (?, ?, ?, ?, ?)').run('admin@mahana.com', h1, 'Mahana Admin', 'admin', null);
      db.prepare('INSERT INTO usuarios (email, password_hash, nombre, rol, vendedor) VALUES (?, ?, ?, ?, ?)').run('caracol@playacaracol.com', h2, 'Playa Caracol', 'partner', 'Playa Caracol');
      console.log('✅ Users seeded at startup: 2 users');
    } else {
      console.log(`✅ Users table already has ${count.c} users, skipping seed`);
    }
  } catch (err) {
    console.error('❌ FATAL: Failed to seed users:', err);
  }

  // Verify email notification channel
  try {
    const status = await notifications.verifyAll();
    console.log('🔔 Notification channels:', JSON.stringify(status));
  } catch (err) {
    console.error('🔔 Error verifying notifications:', err.message);
  }

  // Initialize WhatsApp (will show QR code if needed)
  try {
    await notifications.initialize();
  } catch (err) {
    console.error('🔔 WhatsApp init error:', err.message);
  }

  // ── Daily Scheduler ──
  // Runs reminders at 6pm and summary at 7am (Panama time UTC-5)
  const NOTIFY_EMAIL_TEAM = process.env.NOTIFY_EMAIL_TEAM || '';
  
  function scheduleDailyJobs() {
    const now = new Date();
    // Panama is UTC-5
    const panamaHour = (now.getUTCHours() - 5 + 24) % 24;
    const panamaMinute = now.getUTCMinutes();
    
    // Check at 7:00am Panama = reminder for tomorrow tours sent at 6pm, summary at 7am
    if (panamaHour === 7 && panamaMinute < 5) {
      console.log('🔔 Running daily summary...');
      if (NOTIFY_EMAIL_TEAM) {
        const db = getDb();
        notifications.sendDailySummary(db, NOTIFY_EMAIL_TEAM).catch(err => {
          console.error('🔔 Daily summary error:', err.message);
        });
      }
    }
    
    if (panamaHour === 18 && panamaMinute < 5) {
      console.log('🔔 Running daily reminders...');
      const db = getDb();
      notifications.sendDailyReminders(db).catch(err => {
        console.error('🔔 Reminders error:', err.message);
      });
    }
  }
  
  // Check every 5 minutes
  setInterval(scheduleDailyJobs, 5 * 60 * 1000);
  console.log('⏰ Daily scheduler active (reminders @ 6pm, summary @ 7am Panama)');
});