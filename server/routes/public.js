const express = require('express');
const router = express.Router();
const { success, error } = require('../middleware/response');
const { getDb, findAll, findById, create, update } = require('../db/database');
const { verifyPassword, generateToken, requireAuth, isPartner } = require('../auth');
const { sanitize } = require('../utils/sanitize');
const { calcCxC } = require('../utils/finance');
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

// ── API Status ──
router.get('/api/v1/api-status', (req, res) => {
  success(res, {
    status: 'ok',
    version: '2.0.0',
    name: 'Mahana Portal API',
    timestamp: new Date().toISOString()
  });
});

// ── AUTH ENDPOINTS ──
router.post('/api/v1/auth/login', (req, res) => {
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

router.get('/api/v1/auth/me', requireAuth, (req, res) => {
  success(res, {
    id: req.user.id,
    email: req.user.email,
    nombre: req.user.nombre,
    rol: req.user.rol,
    vendedor: req.user.vendedor
  });
});

// ── PUBLIC API (NO AUTH ── Rate Limited) ──

// Public: Get all visible products
router.get('/api/v1/public/productos', publicRateLimit(60), (req, res) => {
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
router.get('/api/v1/public/productos/:slug', publicRateLimit(60), (req, res) => {
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
router.get('/api/v1/public/disponibilidad/:slug', publicRateLimit(60), (req, res) => {
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
router.get('/api/v1/public/slots/:slug', publicRateLimit(60), (req, res) => {
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
router.post('/api/v1/public/reservar', publicRateLimit(5, 60000), (req, res) => {
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
router.get('/api/v1/public/reserva/:codigo', publicRateLimit(30), (req, res) => {
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
router.post('/api/v1/public/pago/confirmar', publicRateLimit(10), (req, res) => {
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

// Create PayPal order for a booking
router.post('/api/v1/public/paypal/create-order', publicRateLimit(10), async (req, res1) => {
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
router.post('/api/v1/public/paypal/capture-order', publicRateLimit(10), async (req, res1) => {
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

// Get review data (public, no auth)
router.get('/api/v1/public/resena/:codigo', (req, res) => {
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
router.post('/api/v1/public/resena/:codigo', (req, res) => {
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

module.exports = router;
