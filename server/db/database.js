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

    // Product image support
    addCol('actividades', 'imagen_url', 'TEXT');

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

    // ── Actividades: expand with product catalog fields ──
    addCol('actividades', 'categoria', 'TEXT');
    addCol('actividades', 'descripcion', 'TEXT');
    addCol('actividades', 'unidad', 'TEXT');          // "Por pax", "Por bote"
    addCol('actividades', 'duracion', 'TEXT');         // "2 horas", "Full day"
    addCol('actividades', 'horario', 'TEXT');           // "8:00am, 2:00pm"
    addCol('actividades', 'punto_encuentro', 'TEXT');
    addCol('actividades', 'que_incluye', 'TEXT');       // "Water, Equipo, Foto"
    addCol('actividades', 'que_llevar', 'TEXT');        // "Bloqueador, Toalla"
    addCol('actividades', 'requisitos', 'TEXT');
    addCol('actividades', 'disponibilidad', 'TEXT');    // "Todo el año"
    addCol('actividades', 'costo_instructor', 'REAL');
    addCol('actividades', 'comision_caracol_pct', 'REAL');
    addCol('actividades', 'capacidad_max', 'INTEGER');
    addCol('actividades', 'transporte', 'INTEGER');

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

    console.log('✅ Database initialized at', DB_PATH);
  }
  return db;
}

// ── Table whitelist (prevents SQL injection via table names) ──

const VALID_TABLES = ['reservas_tours', 'reservas_estadias', 'actividades', 'propiedades', 'staff', 'usuarios', 'horarios_slots', 'plantillas_horario', 'alertas'];

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
  data.updated_at = new Date().toISOString();
  const fields = Object.keys(data);
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
