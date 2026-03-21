const Database = require('better-sqlite3');
const db = new Database('./data/mahana.db', { readonly: true });

console.log('=== FUENTE values ===');
console.log(JSON.stringify(db.prepare('SELECT fuente, COUNT(*) as cnt FROM reservas_tours GROUP BY fuente').all(), null, 2));

console.log('\n=== VENDEDOR values ===');
console.log(JSON.stringify(db.prepare('SELECT vendedor, COUNT(*) as cnt FROM reservas_tours WHERE (eliminado IS NULL OR eliminado = 0) GROUP BY vendedor').all(), null, 2));

console.log('\n=== INGRESOS TOTAL (excl rechazados/cancelados/eliminados) ===');
const q = `SELECT COUNT(*) as total, 
  COALESCE(SUM(CASE WHEN estatus NOT IN ('Rechazado','Cancelado') THEN precio_ingreso ELSE 0 END),0) as ingresos,
  COALESCE(SUM(CASE WHEN estatus NOT IN ('Rechazado','Cancelado') THEN ganancia_mahana ELSE 0 END),0) as ganancia
  FROM reservas_tours WHERE (eliminado IS NULL OR eliminado = 0)`;
console.log(JSON.stringify(db.prepare(q).get(), null, 2));

console.log('\n=== INGRESOS POR VENDEDOR ===');
const q2 = `SELECT vendedor, COUNT(*) as cnt, 
  COALESCE(SUM(precio_ingreso),0) as ingresos 
  FROM reservas_tours 
  WHERE (eliminado IS NULL OR eliminado = 0) AND estatus NOT IN ('Rechazado','Cancelado') 
  GROUP BY vendedor`;
console.log(JSON.stringify(db.prepare(q2).all(), null, 2));

console.log('\n=== ESTATUS distribution ===');
const q3 = `SELECT estatus, COUNT(*) as cnt, 
  COALESCE(SUM(precio_ingreso),0) as ingresos 
  FROM reservas_tours WHERE (eliminado IS NULL OR eliminado = 0) 
  GROUP BY estatus`;
console.log(JSON.stringify(db.prepare(q3).all(), null, 2));

console.log('\n=== Dashboard split: Mahana vs Partners ===');
const qMahana = `SELECT COUNT(*) as total,
  COALESCE(SUM(CASE WHEN estatus NOT IN ('Rechazado','Cancelado') THEN precio_ingreso ELSE 0 END),0) as ingresos
  FROM reservas_tours WHERE (eliminado IS NULL OR eliminado = 0) AND vendedor = 'Mahana Tours'`;
const qPartners = `SELECT COUNT(*) as total,
  COALESCE(SUM(CASE WHEN estatus NOT IN ('Rechazado','Cancelado') THEN precio_ingreso ELSE 0 END),0) as ingresos
  FROM reservas_tours WHERE (eliminado IS NULL OR eliminado = 0) AND vendedor != 'Mahana Tours'`;
console.log('Mahana Tours:', JSON.stringify(db.prepare(qMahana).get()));
console.log('Partners (non-Mahana):', JSON.stringify(db.prepare(qPartners).get()));

console.log('\n=== Charts: periodos.todo (used by ToursList KPI) ===');
console.log(JSON.stringify(db.prepare('SELECT COUNT(*) as cantidad, COALESCE(SUM(precio_ingreso),0) as ingresos, COALESCE(SUM(ganancia_mahana),0) as ganancia FROM reservas_tours WHERE (eliminado IS NULL OR eliminado = 0)').get(), null, 2));

console.log('\n=== Soft-deleted tours ===');
console.log(JSON.stringify(db.prepare('SELECT COUNT(*) as cnt FROM reservas_tours WHERE eliminado = 1').get()));

console.log('\n=== Sample: first 5 tours (fuente, vendedor, precio) ===');
console.log(JSON.stringify(db.prepare('SELECT id, cliente, vendedor, fuente, precio_ingreso, estatus FROM reservas_tours WHERE (eliminado IS NULL OR eliminado = 0) ORDER BY id ASC LIMIT 5').all(), null, 2));

db.close();
