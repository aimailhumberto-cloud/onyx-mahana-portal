-- Mahana Portal v2 - Database Schema
-- SQLite

-- Tours propios (ventas directas de Mahana Tours)
CREATE TABLE IF NOT EXISTS reservas_tours (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT,
  hora TEXT,
  cliente TEXT NOT NULL,
  whatsapp TEXT,
  estatus TEXT DEFAULT 'Consulta',
  vendedor TEXT DEFAULT 'Mahana Tours',
  actividad TEXT,
  responsable TEXT,
  precio_ingreso REAL DEFAULT 0,
  costo_pago REAL DEFAULT 0,
  comision_pct REAL,
  monto_comision REAL,
  ganancia_mahana REAL DEFAULT 0,
  notas TEXT,
  gestionado_por TEXT,
  fuente TEXT DEFAULT 'manual',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Estadías (reservas de habitaciones con comisión)
CREATE TABLE IF NOT EXISTS reservas_estadias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha_solicitud TEXT DEFAULT (date('now')),
  cliente TEXT NOT NULL,
  whatsapp TEXT,
  email TEXT,
  propiedad TEXT,
  tipo TEXT,
  check_in TEXT,
  check_out TEXT,
  huespedes TEXT,
  habitaciones TEXT,
  precio_cotizado TEXT,
  precio_final REAL,
  comision_pct REAL DEFAULT 20,
  monto_comision REAL,
  estado TEXT DEFAULT 'Solicitada',
  responsable TEXT,
  notas TEXT,
  fuente TEXT DEFAULT 'manual',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Catálogo de actividades
CREATE TABLE IF NOT EXISTS actividades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  tipo TEXT DEFAULT 'tour',
  precio_base REAL,
  costo_base REAL,
  activa INTEGER DEFAULT 1
);

-- Staff (instructores y responsables)
CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  rol TEXT DEFAULT 'instructor',
  activo INTEGER DEFAULT 1
);

-- Índices para queries frecuentes
CREATE INDEX IF NOT EXISTS idx_tours_fecha ON reservas_tours(fecha);
CREATE INDEX IF NOT EXISTS idx_tours_estatus ON reservas_tours(estatus);
CREATE INDEX IF NOT EXISTS idx_tours_actividad ON reservas_tours(actividad);
CREATE INDEX IF NOT EXISTS idx_tours_responsable ON reservas_tours(responsable);
CREATE INDEX IF NOT EXISTS idx_estadias_estado ON reservas_estadias(estado);
CREATE INDEX IF NOT EXISTS idx_estadias_propiedad ON reservas_estadias(propiedad);
CREATE INDEX IF NOT EXISTS idx_estadias_checkin ON reservas_estadias(check_in);
