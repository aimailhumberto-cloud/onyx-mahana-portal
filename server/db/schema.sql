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
CREATE INDEX IF NOT EXISTS idx_tours_vendedor ON reservas_tours(vendedor);
CREATE INDEX IF NOT EXISTS idx_estadias_estado ON reservas_estadias(estado);
CREATE INDEX IF NOT EXISTS idx_estadias_propiedad ON reservas_estadias(propiedad);
CREATE INDEX IF NOT EXISTS idx_estadias_checkin ON reservas_estadias(check_in);

-- Usuarios (autenticación y roles)
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nombre TEXT NOT NULL,
  rol TEXT DEFAULT 'partner',
  vendedor TEXT,
  activo INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Slots de disponibilidad por actividad/día/hora
CREATE TABLE IF NOT EXISTS horarios_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actividad_id INTEGER NOT NULL,
  fecha TEXT NOT NULL,
  hora TEXT NOT NULL,
  capacidad INTEGER DEFAULT 6,
  reservados INTEGER DEFAULT 0,
  bloqueado INTEGER DEFAULT 0,
  notas TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (actividad_id) REFERENCES actividades(id),
  UNIQUE(actividad_id, fecha, hora)
);

-- Plantillas semanales para generación en bulk
CREATE TABLE IF NOT EXISTS plantillas_horario (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actividad_id INTEGER NOT NULL,
  dia_semana INTEGER NOT NULL,
  hora TEXT NOT NULL,
  capacidad INTEGER DEFAULT 6,
  activa INTEGER DEFAULT 1,
  FOREIGN KEY (actividad_id) REFERENCES actividades(id)
);

CREATE INDEX IF NOT EXISTS idx_slots_fecha ON horarios_slots(fecha);
CREATE INDEX IF NOT EXISTS idx_slots_actividad ON horarios_slots(actividad_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
