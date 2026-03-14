/**
 * Migration script: Import existing JSON data into SQLite
 * Run once: node server/db/migrate.js
 */
const path = require('path');
const fs = require('fs');
const { getDb, closeDb } = require('./database');

const DATA_DIR = path.join(__dirname, '../../data');

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'));
  } catch (e) {
    console.warn(`⚠️ Could not read ${file}:`, e.message);
    return [];
  }
}

function normalizeNum(val) {
  if (val === '' || val === null || val === undefined) return null;
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
}

function migrateTours() {
  const db = getDb();
  const tours = readJSON('tours.json');
  console.log(`📦 Migrating ${tours.length} tours...`);

  const stmt = db.prepare(`
    INSERT INTO reservas_tours 
    (fecha, hora, cliente, estatus, vendedor, actividad, responsable,
     precio_ingreso, costo_pago, comision_pct, monto_comision, ganancia_mahana,
     notas, gestionado_por, fuente)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'migrated')
  `);

  const insertMany = db.transaction((items) => {
    for (const t of items) {
      stmt.run(
        t.Fecha || null,
        t.Hora || null,
        t.Cliente || 'Sin cliente',
        t.Estatus || 'Consulta',
        t.Vendedor || 'Mahana Tours',
        t.Actividad || null,
        t.Responsable || null,
        normalizeNum(t['Precio (Ingreso)']),
        normalizeNum(t['Costo (Pago)']),
        normalizeNum(t['Comisión (%)']),
        normalizeNum(t['Monto Comisión']),
        normalizeNum(t['Ganancia Mahana']),
        t.Notas || null,
        t['Gestionado por'] || null
      );
    }
  });

  insertMany(tours);
  console.log(`✅ ${tours.length} tours migrated`);
}

function migrateVentasCaracol() {
  const db = getDb();
  const ventas = readJSON('ventas-caracol.json');
  console.log(`📦 Migrating ${ventas.length} ventas Caracol...`);

  const stmt = db.prepare(`
    INSERT INTO reservas_tours 
    (fecha, hora, cliente, estatus, vendedor, actividad, responsable,
     precio_ingreso, costo_pago, comision_pct, monto_comision, ganancia_mahana,
     notas, gestionado_por, fuente)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'migrated')
  `);

  const insertMany = db.transaction((items) => {
    for (const v of items) {
      stmt.run(
        v.Fecha || null,
        v.Hora || null,
        v.Cliente || 'Sin cliente',
        v.Estatus || 'Consulta',
        v.Vendedor || 'Playa Caracol',
        v.Actividad || null,
        v.Responsable || null,
        normalizeNum(v['Precio (Ingreso)']),
        normalizeNum(v['Costo (Pago)']),
        normalizeNum(v['Comisión (%)']),
        normalizeNum(v['Monto Comisión']),
        normalizeNum(v['Ganancia Mahana']),
        v.Notas || null,
        v['Gestionado por'] || null
      );
    }
  });

  insertMany(ventas);
  console.log(`✅ ${ventas.length} ventas Caracol migrated`);
}

function migrateCRM() {
  const db = getDb();
  const crm = readJSON('crm.json');
  console.log(`📦 Migrating ${crm.length} CRM requests...`);

  const stmt = db.prepare(`
    INSERT INTO reservas_estadias 
    (fecha_solicitud, cliente, whatsapp, email, propiedad, tipo,
     check_in, check_out, huespedes, habitaciones, precio_cotizado,
     comision_pct, estado, responsable, notas, fuente)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 20, ?, ?, ?, 'migrated')
  `);

  const insertMany = db.transaction((items) => {
    for (const c of items) {
      // Clean estado: remove emoji prefix
      let estado = c.Estado || 'Solicitada';
      estado = estado.replace(/^[📥✅❌🔄]\s*/, '');

      stmt.run(
        c['Fecha Solicitud'] || null,
        c.Cliente || 'Sin cliente',
        c.WhatsApp || null,
        c.Email || null,
        c.Propiedad || null,
        c.Tipo || null,
        c['Check-in'] || null,
        c['Check-out'] || null,
        c.Huéspedes || c['Huéspedes'] || null,
        c.Habitaciones || null,
        c['Precio Cotizado'] || null,
        estado,
        c.Responsable || null,
        c.Notas || null
      );
    }
  });

  insertMany(crm);
  console.log(`✅ ${crm.length} CRM requests migrated`);
}

function extractActividades() {
  const db = getDb();
  const tours = readJSON('tours.json');
  const ventas = readJSON('ventas-caracol.json');
  const all = [...tours, ...ventas];

  const actividades = new Set();
  for (const item of all) {
    if (item.Actividad) actividades.add(item.Actividad.trim());
  }

  console.log(`📦 Extracting ${actividades.size} actividades...`);

  const stmt = db.prepare(
    `INSERT OR IGNORE INTO actividades (nombre, tipo) VALUES (?, 'tour')`
  );

  const insertMany = db.transaction((items) => {
    for (const nombre of items) {
      stmt.run(nombre);
    }
  });

  insertMany([...actividades]);
  console.log(`✅ ${actividades.size} actividades extracted`);
}

function extractStaff() {
  const db = getDb();
  const tours = readJSON('tours.json');
  const ventas = readJSON('ventas-caracol.json');
  const all = [...tours, ...ventas];

  const staffSet = new Set();
  for (const item of all) {
    if (item.Responsable) {
      // Split multi-person entries like "Jairo, Daniel"
      const names = item.Responsable.split(/[,\/y&]+/).map(n => n.trim()).filter(Boolean);
      for (const name of names) {
        if (name.toUpperCase() !== 'POR DEFINIR' && name.toUpperCase() !== 'POR ASIGNAR') {
          staffSet.add(name.charAt(0).toUpperCase() + name.slice(1).toLowerCase());
        }
      }
    }
  }

  console.log(`📦 Extracting ${staffSet.size} staff members...`);

  const stmt = db.prepare(
    `INSERT OR IGNORE INTO staff (nombre, rol) VALUES (?, 'instructor')`
  );

  // Need unique constraint - add it
  try {
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_nombre ON staff(nombre)');
  } catch (e) { /* ignore if exists */ }

  const insertMany = db.transaction((items) => {
    for (const nombre of items) {
      try { stmt.run(nombre); } catch (e) { /* skip duplicates */ }
    }
  });

  insertMany([...staffSet]);
  console.log(`✅ ${staffSet.size} staff members extracted`);
}

// ── Run migration ──
console.log('🚀 Starting migration...\n');

try {
  migrateTours();
  migrateVentasCaracol();
  migrateCRM();
  extractActividades();
  extractStaff();

  // Print summary
  const db = getDb();
  const counts = {
    tours: db.prepare('SELECT COUNT(*) as c FROM reservas_tours').get().c,
    estadias: db.prepare('SELECT COUNT(*) as c FROM reservas_estadias').get().c,
    actividades: db.prepare('SELECT COUNT(*) as c FROM actividades').get().c,
    staff: db.prepare('SELECT COUNT(*) as c FROM staff').get().c,
  };

  console.log('\n📊 Migration Summary:');
  console.log(`   Tours:       ${counts.tours}`);
  console.log(`   Estadías:    ${counts.estadias}`);
  console.log(`   Actividades: ${counts.actividades}`);
  console.log(`   Staff:       ${counts.staff}`);
  console.log('\n✅ Migration complete!');

  closeDb();
} catch (err) {
  console.error('❌ Migration failed:', err);
  closeDb();
  process.exit(1);
}
