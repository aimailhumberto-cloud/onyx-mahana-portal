const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { getDb, findAll, findById, create, update, remove } = require('./db/database');
const { verifyPassword, hashPassword, generateToken, requireAuth, requireRole, isPartner } = require('./auth');
const notifications = require('./notifications');

// ── Multer config for file uploads ──
const uploadsDir = path.join(__dirname, '../uploads');
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
  console.warn('⚠️  WARNING: Using default API_KEY in production. Set API_KEY env var.');
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
  return str.replace(/[<>]/g, '');
}

// CxC auto-calculation: subtotal = precio - comision, itbm = 7%, total = subtotal + itbm
function calcCxC(data) {
  const precio = parseFloat(data.precio_ingreso) || 0;
  const comPct = parseFloat(data.comision_pct) || 0;
  const comision = parseFloat(data.monto_comision) || (precio * comPct / 100);
  const subtotal = Math.round((precio - comision) * 100) / 100;
  const itbm = Math.round((subtotal * 0.07) * 100) / 100;
  const total = Math.round((subtotal + itbm) * 100) / 100;
  return { cxc_subtotal: subtotal, cxc_itbm: itbm, cxc_total: total };
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

    const updated = update('reservas_tours', tour.id, { estatus: 'Aprobado' });

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
      'capacidad_max', 'transporte', 'imagen_url'];

    for (const field of allowed) {
      if (req.body[field] !== undefined && req.body[field] !== null) {
        data[field] = typeof req.body[field] === 'string' ? sanitize(req.body[field]) : req.body[field];
      }
    }

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
      'capacidad_max', 'transporte', 'imagen_url'];

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        data[field] = typeof req.body[field] === 'string' ? sanitize(req.body[field]) : req.body[field];
      }
    }

    const updated = update('actividades', req.params.id, data);
    success(res, updated);
  } catch (err) {
    console.error('Error updating actividad:', err.message, err.stack);
    if (err.message?.includes('UNIQUE')) {
      return error(res, 'DUPLICATE', 'Ya existe una actividad con ese nombre', 409);
    }
    error(res, 'SERVER_ERROR', 'Error updating actividad: ' + err.message, 500);
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

app.get('/api/v1/tours/export', (req, res) => {
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

app.get('/api/v1/estadias/export', (req, res) => {
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

app.get('/api/v1/calendar', (req, res) => {
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
        const dateStr = date.toISOString().split('T')[0];

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
        cxc_factura_url, cxc_fecha_emision, cxc_fecha_vencimiento, cxc_fecha_pago
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
  } catch (err) {
    console.error('Error updating CxC:', err);
    error(res, 'SERVER_ERROR', 'Error updating CxC', 500);
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
app.listen(PORT, async () => {
  console.log(`🚀 Mahana Portal v2 running on port ${PORT}`);
  console.log(`📡 API: http://localhost:${PORT}/api/v1/api-status`);

  // Seed users only if table is empty
  try {
    const db = getDb();
    const count = db.prepare('SELECT COUNT(*) as c FROM usuarios').get();
    if (count.c === 0) {
      const bcrypt = require('bcryptjs');
      const h1 = bcrypt.hashSync('mahana2026', 10);
      const h2 = bcrypt.hashSync('caracol2026', 10);
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