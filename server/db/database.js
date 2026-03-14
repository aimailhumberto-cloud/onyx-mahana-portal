const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/mahana.db');
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

    console.log('✅ Database initialized at', DB_PATH);
  }
  return db;
}

// ── Generic CRUD Helpers ──

function findAll(table, { where = {}, orderBy = 'id DESC', page = 1, limit = 50 } = {}) {
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
  const db = getDb();
  return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
}

function create(table, data) {
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
  const db = getDb();
  data.updated_at = new Date().toISOString();
  const fields = Object.keys(data);
  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values = [...Object.values(data), id];

  db.prepare(`UPDATE ${table} SET ${setClause} WHERE id = ?`).run(...values);
  return findById(table, id);
}

function remove(table, id) {
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
