const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { hashPassword } = require('../auth');

// Use Render persistent disk at /data if available; otherwise local data/ folder
const DB_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, '../../data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
const DB_PATH = path.join(DB_DIR, 'mahana.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Initialize schema
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
    db.exec(schema);

    // Migrations — safe to run multiple times
    const addCol = (table, col, type) => {
      try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`); } catch {}
    };
    addCol('reservas_estadias', 'base_caracol', 'REAL');
    addCol('reservas_estadias', 'impuesto', 'REAL');
    addCol('reservas_estadias', 'cleaning_fee', 'REAL');

    // Partner tour request extra fields
    addCol('reservas_tours', 'comprobante_url', 'TEXT');
    addCol('reservas_tours', 'email_cliente', 'TEXT');
    addCol('reservas_tours', 'hotel', 'TEXT');
    addCol('reservas_tours', 'nacionalidad', 'TEXT');
    addCol('reservas_tours', 'idioma', 'TEXT');
    addCol('reservas_tours', 'edades', 'TEXT');
    addCol('reservas_tours', 'motivo_rechazo', 'TEXT');
    addCol('reservas_tours', 'solicitado_por', 'TEXT');
    addCol('reservas_tours', 'pax', 'INTEGER');

    // Soft delete support
    addCol('reservas_tours', 'eliminado', 'INTEGER DEFAULT 0');
    addCol('reservas_tours', 'eliminado_por', 'TEXT');
    addCol('reservas_tours', 'eliminado_at', 'TEXT');

    // CxC (Cuentas por Cobrar) — per-tour invoicing
    addCol('reservas_tours', 'cxc_subtotal', 'REAL');
    addCol('reservas_tours', 'cxc_itbm', 'REAL');
    addCol('reservas_tours', 'cxc_total', 'REAL');
    addCol('reservas_tours', 'cxc_estatus', "TEXT DEFAULT 'Sin Factura'");
    addCol('reservas_tours', 'cxc_factura_url', 'TEXT');
    addCol('reservas_tours', 'cxc_fecha_emision', 'TEXT');
    addCol('reservas_tours', 'cxc_fecha_vencimiento', 'TEXT');
    addCol('reservas_tours', 'cxc_fecha_pago', 'TEXT');

    // Booking link field (replaces LIKE match on notas)
    addCol('reservas_tours', 'booking_codigo', 'TEXT');
    // PayPal fields
    addCol('reservas_tours', 'paypal_order_id', 'TEXT');
    addCol('reservas_tours', 'paypal_payer_id', 'TEXT');
    addCol('reservas_tours', 'paypal_payer_email', 'TEXT');
    // Slot reference for capacity release on cancel
    addCol('reservas_tours', 'slot_id', 'INTEGER');

    // Backfill CxC for existing tours that have pricing but no CxC calculated
    try {
      const toursToBackfill = db.prepare(`
        SELECT id, precio_ingreso, comision_pct, monto_comision
        FROM reservas_tours
        WHERE precio_ingreso IS NOT NULL AND precio_ingreso > 0
          AND (cxc_total IS NULL OR cxc_total = 0)
      `).all();
      if (toursToBackfill.length > 0) {
        const updateCxC = db.prepare(`
          UPDATE reservas_tours SET cxc_subtotal = ?, cxc_itbm = ?, cxc_total = ?, cxc_estatus = COALESCE(cxc_estatus, 'Sin Factura')
          WHERE id = ?
        `);
        const backfillTx = db.transaction(() => {
          for (const t of toursToBackfill) {
            const precio = parseFloat(t.precio_ingreso) || 0;
            const comPct = parseFloat(t.comision_pct) || 0;
            const comision = parseFloat(t.monto_comision) || (precio * comPct / 100);
            const subtotal = Math.round((precio - comision) * 100) / 100;
            const itbm = Math.round((subtotal * 0.07) * 100) / 100;
            const total = Math.round((subtotal + itbm) * 100) / 100;
            updateCxC.run(subtotal, itbm, total, t.id);
          }
        });
        backfillTx();
        console.log(`✅ CxC backfill: ${toursToBackfill.length} tours updated`);
      }
    } catch (err) {
      console.error('⚠️ CxC backfill failed (non-fatal):', err.message);
    }

    // Product catalog columns for actividades
    addCol('actividades', 'categoria', 'TEXT');
    addCol('actividades', 'descripcion', 'TEXT');
    addCol('actividades', 'unidad', 'TEXT');
    addCol('actividades', 'duracion', 'TEXT');
    addCol('actividades', 'horario', 'TEXT');
    addCol('actividades', 'punto_encuentro', 'TEXT');
    addCol('actividades', 'que_incluye', 'TEXT');
    addCol('actividades', 'que_llevar', 'TEXT');
    addCol('actividades', 'requisitos', 'TEXT');
    addCol('actividades', 'disponibilidad', 'TEXT');
    addCol('actividades', 'costo_instructor', 'REAL');
    addCol('actividades', 'comision_caracol_pct', 'REAL');
    addCol('actividades', 'capacidad_max', 'INTEGER');
    addCol('actividades', 'transporte', 'INTEGER DEFAULT 0');

    // Product image support
    addCol('actividades', 'imagen_url', 'TEXT');

    // Booking system: slug, multi-site, web visibility, duration in minutes, booking mode
    addCol('actividades', 'slug', 'TEXT');
    addCol('actividades', 'sitios', "TEXT DEFAULT '[]'"); // JSON array, e.g. ["mahanatours","ans-surf"]
    addCol('actividades', 'visible_web', 'INTEGER DEFAULT 0');
    addCol('actividades', 'duracion_min', 'INTEGER'); // duration in minutes for slot calculation
    addCol('actividades', 'modo_booking', "TEXT DEFAULT 'directo'"); // 'directo' = calendar+pay, 'agente' = contact form

    // Timestamps for actividades (update() always sets updated_at)
    addCol('actividades', 'created_at', "TEXT DEFAULT (datetime('now'))");
    addCol('actividades', 'updated_at', "TEXT DEFAULT (datetime('now'))");

    // Auto-generate slugs for existing actividades that don't have one
    try {
      const noSlug = db.prepare("SELECT id, nombre FROM actividades WHERE slug IS NULL OR slug = ''").all();
      if (noSlug.length > 0) {
        const updateSlug = db.prepare('UPDATE actividades SET slug = ? WHERE id = ?');
        for (const a of noSlug) {
          const slug = a.nombre.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
            .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          updateSlug.run(slug, a.id);
        }
        console.log(`✅ Generated slugs for ${noSlug.length} actividades`);
      }
    } catch (err) {
      console.error('⚠️ Slug generation failed (non-fatal):', err.message);
    }

    // Auto-enable visible_web for products where it's NULL (first-time migration only)
    try {
      const updated = db.prepare("UPDATE actividades SET visible_web = 1 WHERE activa = 1 AND visible_web IS NULL").run();
      if (updated.changes > 0) {
        console.log(`✅ Auto-enabled visible_web for ${updated.changes} active products (first migration)`);
      }
    } catch (err) {
      console.error('⚠️ visible_web migration failed (non-fatal):', err.message);
    }

    // Ensure slug uniqueness
    try {
      db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_actividades_slug ON actividades(slug) WHERE slug IS NOT NULL AND slug != ""').run();
    } catch (slugErr) {
      console.error('⚠️ Slug unique index failed (non-fatal):', slugErr.message);
    }

    // Rename old categories to new names
    const renameCat = (oldName, newName) => {
      db.prepare('UPDATE actividades SET categoria = ? WHERE categoria = ?').run(newName, oldName);
    };
    renameCat('Acuática', 'Acuáticas');
    renameCat('Eco Adventure', 'Premium Adventures');
    renameCat('City Tour', 'City Tours');

    // Alertas table for AI agent monitoring
    db.exec(`
      CREATE TABLE IF NOT EXISTS alertas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT NOT NULL,
        mensaje TEXT NOT NULL,
        referencia_tipo TEXT,
        referencia_id INTEGER,
        datos_extra TEXT,
        leida INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // Rename Cancelada → Perdida in existing data
    db.prepare(`UPDATE reservas_estadias SET estado = 'Perdida' WHERE estado = 'Cancelada'`).run();

    // (actividades columns already added above at lines 49-65)

    // Ensure actividades catalog has Otro and Academia de Surf
    const ensureAct = (nombre) => {
      try { db.prepare('INSERT INTO actividades (nombre, tipo) VALUES (?, ?)').run(nombre, 'tour'); } catch {}
    };
    ensureAct('Academia de Surf');
    ensureAct('Otro');

    // Assign categories to existing activities (safe to run multiple times)
    const setCat = (nombre, categoria) => {
      db.prepare("UPDATE actividades SET categoria = ? WHERE nombre = ? AND (categoria IS NULL OR categoria = '')").run(categoria, nombre);
    };
    setCat('Academia de Surf', 'Acuáticas');
    setCat('Mulita', 'Acuáticas');
    setCat('Tour de Pesca Otoque y Bona', 'Acuáticas');
    setCat('Tubing Inflable', 'Acuáticas');
    setCat('Ratfing Tubing Cajones', 'Acuáticas');
    setCat('Rafting Tubing Cajones', 'Acuáticas');
    setCat('Rappel Cascada Filipinas', 'Premium Adventures');
    setCat('Hiking Cerro Chame', 'Hiking & Tours');
    setCat('Tour Cascada Filipinas', 'Hiking & Tours');
    setCat('Day Trip El Valle de Antón', 'City Tours');
    setCat('Escápate a Isla Otoque y Bona', 'City Tours');
    setCat('Otro', 'Otro');

    // ── Propiedades table ──
    db.exec(`
      CREATE TABLE IF NOT EXISTS propiedades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL UNIQUE,
        descripcion TEXT,
        tipo TEXT,
        habitaciones INTEGER,
        capacidad INTEGER,
        precio_noche REAL,
        impuesto_pct REAL DEFAULT 0,
        cleaning_fee REAL DEFAULT 0,
        amenidades TEXT,
        activa INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // Seed propiedades if empty
    const propCount = db.prepare('SELECT COUNT(*) as c FROM propiedades').get();
    if (propCount.c === 0) {
      const insertProp = db.prepare('INSERT INTO propiedades (nombre, tipo, impuesto_pct, cleaning_fee, activa) VALUES (?, ?, ?, ?, 1)');
      insertProp.run('Radisson', 'Hotel', 10, 0);
      insertProp.run('Caracol Residences', 'Apartamento', 0, 0);
      insertProp.run('Casa Mahana', 'Casa', 10, 0);
      console.log('✅ Seeded 3 propiedades');
    }

    // User seeding is now handled at server startup in server.js

    // ── Plantillas vigencia (fecha_inicio, fecha_fin) ──
    addCol('plantillas_horario', 'fecha_inicio', 'TEXT'); // null = desde siempre
    addCol('plantillas_horario', 'fecha_fin', 'TEXT');     // null = para siempre

    // ── Bloqueos de fechas (por producto o globales) ──
    db.exec(`
      CREATE TABLE IF NOT EXISTS bloqueos_fechas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actividad_id INTEGER,
        fecha TEXT NOT NULL,
        motivo TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (actividad_id) REFERENCES actividades(id)
      );
    `);

    // ── Booking config (global settings) ──
    db.exec(`
      CREATE TABLE IF NOT EXISTS reservas_config (
        clave TEXT PRIMARY KEY,
        valor TEXT NOT NULL DEFAULT '',
        descripcion TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // Seed booking config defaults
    const bookingConfigCount = db.prepare('SELECT COUNT(*) as c FROM reservas_config').get();
    if (bookingConfigCount.c === 0) {
      const insertBooking = db.prepare('INSERT INTO reservas_config (clave, valor, descripcion) VALUES (?, ?, ?)');
      insertBooking.run('anticipacion_min_horas', '24', 'Horas mínimas de anticipación para reservar');
      insertBooking.run('anticipacion_max_dias', '60', 'Días máximos hacia el futuro para reservar');
      insertBooking.run('buffer_entre_slots_min', '0', 'Minutos de buffer entre slots');
      insertBooking.run('auto_generar_dias', '60', 'Días hacia el futuro para auto-generar slots');
      insertBooking.run('politica_cancelacion', 'Las cancelaciones deben realizarse con al menos 24 horas de anticipación.', 'Política de cancelación pública');
      console.log('✅ Booking config seeded');
    }

    // ── Payment config (PayPal, etc.) ──
    db.exec(`
      CREATE TABLE IF NOT EXISTS configuracion_pagos (
        clave TEXT PRIMARY KEY,
        valor TEXT NOT NULL DEFAULT '',
        descripcion TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // Seed payment config defaults
    const payConfigCount = db.prepare('SELECT COUNT(*) as c FROM configuracion_pagos').get();
    if (payConfigCount.c === 0) {
      const insertPay = db.prepare('INSERT INTO configuracion_pagos (clave, valor, descripcion) VALUES (?, ?, ?)');
      insertPay.run('paypal_client_id', '', 'PayPal Client ID (global)');
      insertPay.run('paypal_secret', '', 'PayPal Secret (global)');
      insertPay.run('paypal_mode', 'sandbox', 'sandbox o live');
      insertPay.run('paypal_enabled', 'false', 'Habilitar pagos con PayPal');
      insertPay.run('moneda', 'USD', 'Moneda para pagos (USD, PAB)');
      console.log('✅ Payment config seeded');
    }

    // ── Notification config table ──
    db.exec(`
      CREATE TABLE IF NOT EXISTS configuracion_notificaciones (
        clave TEXT PRIMARY KEY,
        valor TEXT NOT NULL DEFAULT '',
        descripcion TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // Seed defaults if empty
    const configCount = db.prepare('SELECT COUNT(*) as c FROM configuracion_notificaciones').get();
    if (configCount.c === 0) {
      const insertConfig = db.prepare('INSERT INTO configuracion_notificaciones (clave, valor, descripcion) VALUES (?, ?, ?)');
      insertConfig.run('email_cc_default', '', 'CC automático en emails al cliente');
      insertConfig.run('email_team', '', 'Emails del equipo para resumen diario (separados por coma)');
      insertConfig.run('email_caracol', '', 'Email de Caracol para copias de estadías');
      insertConfig.run('whatsapp_notify', '', 'Número WhatsApp para alertas del equipo');
      insertConfig.run('whatsapp_caracol', '', 'Número WhatsApp de Caracol');
      insertConfig.run('telegram_chat_id', '', 'Chat ID de Telegram (grupo o personal)');
      insertConfig.run('politica_cancelacion', 'Las cancelaciones deben realizarse con al menos 24 horas de anticipación. Cancelaciones tardías están sujetas a un cargo del 50%.', 'Política de cancelación para emails');
      insertConfig.run('email_enabled', 'true', 'Habilitar notificaciones por email');
      insertConfig.run('whatsapp_enabled', 'false', 'Habilitar notificaciones por WhatsApp');
      insertConfig.run('telegram_enabled', 'true', 'Habilitar notificaciones por Telegram');
      console.log('✅ Notification config seeded');
    }

    // Auto-fix: partner users must have vendedor set
    const brokenPartners = db.prepare("SELECT id, email FROM usuarios WHERE rol = 'partner' AND (vendedor IS NULL OR vendedor = '')").all();
    if (brokenPartners.length > 0) {
      db.prepare("UPDATE usuarios SET vendedor = 'Playa Caracol' WHERE rol = 'partner' AND (vendedor IS NULL OR vendedor = '')").run();
      console.log(`⚠️ Fixed ${brokenPartners.length} partner user(s) with missing vendedor → set to 'Playa Caracol'`);
    }

    // ── Reservas Booking (public bookings) ──
    db.exec(`
      CREATE TABLE IF NOT EXISTS reservas_booking (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT NOT NULL UNIQUE,
        actividad_id INTEGER NOT NULL,
        slug TEXT NOT NULL,
        fecha TEXT NOT NULL,
        hora TEXT NOT NULL,
        personas INTEGER NOT NULL DEFAULT 1,
        nombre TEXT NOT NULL,
        email TEXT NOT NULL,
        whatsapp TEXT DEFAULT '',
        notas TEXT DEFAULT '',
        estado TEXT NOT NULL DEFAULT 'pendiente_pago',
        modo TEXT NOT NULL DEFAULT 'directo',
        slot_id INTEGER,
        precio_total REAL DEFAULT 0,
        paypal_order_id TEXT DEFAULT '',
        paypal_payer_id TEXT DEFAULT '',
        paid_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (actividad_id) REFERENCES actividades(id),
        FOREIGN KEY (slot_id) REFERENCES horarios_slots(id)
      );
    `);

    // ── Tickets de Servicio (Quality System) ──
    db.exec(`
      CREATE TABLE IF NOT EXISTS tickets_servicio (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE,
        tour_id INTEGER,
        actividad TEXT,
        vendedor TEXT,
        responsable TEXT,
        cliente TEXT NOT NULL,
        whatsapp TEXT,
        email TEXT,
        tipo TEXT DEFAULT 'queja',
        categoria TEXT,
        prioridad TEXT DEFAULT 'media',
        canal_origen TEXT DEFAULT 'portal',
        descripcion TEXT NOT NULL,
        evidencia_url TEXT,
        estatus TEXT DEFAULT 'Abierto',
        asignado_a TEXT,
        respuesta TEXT,
        accion_correctiva TEXT,
        satisfaccion_resolucion INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        resuelto_at TEXT,
        cerrado_at TEXT,
        creado_por TEXT,
        resuelto_por TEXT
      );
    `);
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_tickets_estatus ON tickets_servicio(estatus)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_tickets_actividad ON tickets_servicio(actividad)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_tickets_vendedor ON tickets_servicio(vendedor)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_tickets_categoria ON tickets_servicio(categoria)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_tickets_prioridad ON tickets_servicio(prioridad)');
    } catch {}

    // ── Satisfacción de Tours (Reviews) ──
    db.exec(`
      CREATE TABLE IF NOT EXISTS satisfaccion_tours (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo_resena TEXT UNIQUE,
        tour_id INTEGER,
        actividad TEXT,
        vendedor TEXT,
        responsable TEXT,
        cliente TEXT,
        score_general INTEGER NOT NULL,
        score_guia INTEGER,
        score_puntualidad INTEGER,
        score_equipamiento INTEGER,
        score_valor INTEGER,
        comentario TEXT,
        fuente TEXT DEFAULT 'manual',
        redirigido_google INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_satisfaccion_actividad ON satisfaccion_tours(actividad)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_satisfaccion_vendedor ON satisfaccion_tours(vendedor)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_satisfaccion_codigo ON satisfaccion_tours(codigo_resena)');
    } catch {}

    // Add review link field to tours
    addCol('reservas_tours', 'review_codigo', 'TEXT');

    console.log('✅ Database initialized at', DB_PATH);
  }
  return db;
}

// ── Table whitelist (prevents SQL injection via table names) ──

const VALID_TABLES = ['reservas_tours', 'reservas_estadias', 'actividades', 'propiedades', 'staff', 'usuarios', 'horarios_slots', 'plantillas_horario', 'alertas', 'configuracion_notificaciones', 'bloqueos_fechas', 'reservas_config', 'configuracion_pagos', 'reservas_booking', 'tickets_servicio', 'satisfaccion_tours'];

function validateTable(table) {
  if (!VALID_TABLES.includes(table)) {
    throw new Error(`Invalid table name: ${table}`);
  }
}

// ── Generic CRUD Helpers ──

function findAll(table, { where = {}, orderBy = 'id DESC', page = 1, limit = 50 } = {}) {
  validateTable(table);
  const db = getDb();
  const conditions = [];
  const values = [];

  for (const [key, value] of Object.entries(where)) {
    if (value !== undefined && value !== null && value !== '') {
      if (key.endsWith('_gte')) {
        conditions.push(`${key.replace('_gte', '')} >= ?`);
        values.push(value);
      } else if (key.endsWith('_lte')) {
        conditions.push(`${key.replace('_lte', '')} <= ?`);
        values.push(value);
      } else if (key.endsWith('_like')) {
        conditions.push(`${key.replace('_like', '')} LIKE ?`);
        values.push(`%${value}%`);
      } else {
        conditions.push(`${key} = ?`);
        values.push(value);
      }
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM ${table} ${whereClause}`);
  const { total } = countStmt.get(...values);

  const dataStmt = db.prepare(
    `SELECT * FROM ${table} ${whereClause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
  );
  const data = dataStmt.all(...values, limit, offset);

  return {
    data,
    meta: {
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / limit)
    }
  };
}

function findById(table, id) {
  validateTable(table);
  const db = getDb();
  return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
}

function create(table, data) {
  validateTable(table);
  const db = getDb();
  const fields = Object.keys(data);
  const placeholders = fields.map(() => '?').join(', ');
  const values = Object.values(data);

  const stmt = db.prepare(
    `INSERT INTO ${table} (${fields.join(', ')}) VALUES (${placeholders})`
  );
  const result = stmt.run(...values);
  return findById(table, result.lastInsertRowid);
}

function update(table, id, data) {
  validateTable(table);
  const db = getDb();
  // Only add updated_at if the table actually has that column
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (cols.some(c => c.name === 'updated_at')) {
      data.updated_at = new Date().toISOString();
    }
  } catch {}
  const fields = Object.keys(data);
  if (fields.length === 0) return findById(table, id);
  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values = [...Object.values(data), id];

  db.prepare(`UPDATE ${table} SET ${setClause} WHERE id = ?`).run(...values);
  return findById(table, id);
}

function remove(table, id) {
  validateTable(table);
  const db = getDb();
  const item = findById(table, id);
  if (!item) return null;
  db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
  return item;
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  getDb,
  findAll,
  findById,
  create,
  update,
  remove,
  closeDb
};
