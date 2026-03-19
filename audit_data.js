const db = require('./server/db/database').getDb();

// All tours
const rows = db.prepare(`
  SELECT id, fecha, substr(cliente,1,20) as cli, 
    substr(actividad,1,25) as act, estatus, vendedor,
    precio_ingreso as precio, costo_pago as costo, 
    comision_pct as com_pct, ganancia_mahana as ganancia, eliminado
  FROM reservas_tours ORDER BY id
`).all();

console.log('=== ALL TOURS ===');
console.log('ID | Fecha      | Cliente             | Actividad                | Status      | Vendedor       | Precio | Costo  | Com%  | Ganancia | Del');
console.log('-'.repeat(150));
rows.forEach(r => {
  console.log(
    `${String(r.id).padStart(2)} | ${r.fecha || '          '} | ${(r.cli||'').padEnd(19)} | ${(r.act||'').padEnd(24)} | ${(r.estatus||'').padEnd(11)} | ${(r.vendedor||'').padEnd(14)} | ${String(r.precio||0).padStart(6)} | ${String(r.costo||0).padStart(6)} | ${String(r.com_pct||0).padStart(5)} | ${String(r.ganancia||0).padStart(8)} | ${r.eliminado}`
  );
});

// Totals by vendedor (active only)
console.log('\n=== TOTALS BY VENDEDOR (active, non-rejected) ===');
const byVendedor = db.prepare(`
  SELECT vendedor,
    COUNT(*) as total,
    SUM(CASE WHEN estatus NOT IN ('Rechazado','Cancelado') THEN precio_ingreso ELSE 0 END) as sum_precio,
    SUM(CASE WHEN estatus NOT IN ('Rechazado','Cancelado') THEN costo_pago ELSE 0 END) as sum_costo,
    SUM(CASE WHEN estatus NOT IN ('Rechazado','Cancelado') THEN ganancia_mahana ELSE 0 END) as sum_ganancia,
    SUM(CASE WHEN estatus NOT IN ('Rechazado','Cancelado') AND comision_pct IS NOT NULL THEN precio_ingreso * comision_pct / 100.0 ELSE 0 END) as sum_comision_calc
  FROM reservas_tours
  WHERE (eliminado IS NULL OR eliminado = 0)
  GROUP BY vendedor
`).all();
byVendedor.forEach(r => console.log(JSON.stringify(r)));

// Totals by month
console.log('\n=== TOTALS BY MONTH (active, non-rejected) ===');
const byMonth = db.prepare(`
  SELECT substr(fecha,1,7) as mes,
    COUNT(*) as total,
    SUM(CASE WHEN estatus NOT IN ('Rechazado','Cancelado') THEN precio_ingreso ELSE 0 END) as ingresos,
    SUM(CASE WHEN estatus NOT IN ('Rechazado','Cancelado') THEN ganancia_mahana ELSE 0 END) as ganancia
  FROM reservas_tours
  WHERE (eliminado IS NULL OR eliminado = 0)
  GROUP BY substr(fecha,1,7)
`).all();
byMonth.forEach(r => console.log(JSON.stringify(r)));

// Totals by status
console.log('\n=== COUNT BY STATUS (active only) ===');
const byStatus = db.prepare(`
  SELECT estatus, COUNT(*) as cnt, COALESCE(SUM(precio_ingreso),0) as sum_precio
  FROM reservas_tours
  WHERE (eliminado IS NULL OR eliminado = 0)
  GROUP BY estatus
`).all();
byStatus.forEach(r => console.log(JSON.stringify(r)));

// Deleted tours
console.log('\n=== DELETED TOURS ===');
const deleted = db.prepare(`
  SELECT id, cliente, actividad, precio_ingreso, eliminado_por, eliminado_at
  FROM reservas_tours WHERE eliminado = 1
`).all();
deleted.forEach(r => console.log(JSON.stringify(r)));

console.log('\nTotal deleted:', deleted.length);

// Grand total
console.log('\n=== GRAND TOTALS (active, non-rejected) ===');
const grand = db.prepare(`
  SELECT 
    COUNT(*) as active_tours,
    SUM(CASE WHEN estatus NOT IN ('Rechazado','Cancelado') THEN precio_ingreso ELSE 0 END) as total_precio,
    SUM(CASE WHEN estatus NOT IN ('Rechazado','Cancelado') THEN ganancia_mahana ELSE 0 END) as total_ganancia
  FROM reservas_tours
  WHERE (eliminado IS NULL OR eliminado = 0)
`).get();
console.log(JSON.stringify(grand));
