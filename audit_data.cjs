const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const db = new Database(path.join(__dirname, 'data', 'mahana.db'));

let out = '';
const log = (s) => { out += s + '\n'; };

log('# DATA AUDIT REPORT');
log('');

// All tours
log('## All Tours');
log('| ID | Fecha | Cliente | Actividad | Status | Vendedor | Precio | Costo | Com% | Ganancia | Del |');
log('|---|---|---|---|---|---|---|---|---|---|---|');
const rows = db.prepare('SELECT * FROM reservas_tours ORDER BY id').all();
rows.forEach(r => {
  log(`| ${r.id} | ${r.fecha} | ${(r.cliente||'').substring(0,20)} | ${(r.actividad||'').substring(0,25)} | ${r.estatus} | ${r.vendedor} | ${r.precio_ingreso} | ${r.costo_pago} | ${r.comision_pct} | ${r.ganancia_mahana} | ${r.eliminado||0} |`);
});

// By vendedor
log('');
log('## By Vendedor (active, non-rejected)');
const byV = db.prepare("SELECT vendedor, COUNT(*) as cnt, COALESCE(SUM(CASE WHEN estatus NOT IN ('Rechazado','Cancelado') THEN precio_ingreso ELSE 0 END),0) as sum_precio, COALESCE(SUM(CASE WHEN estatus NOT IN ('Rechazado','Cancelado') THEN ganancia_mahana ELSE 0 END),0) as sum_ganancia, COALESCE(SUM(CASE WHEN estatus NOT IN ('Rechazado','Cancelado') AND comision_pct IS NOT NULL THEN precio_ingreso * comision_pct / 100.0 ELSE 0 END),0) as sum_comision FROM reservas_tours WHERE (eliminado IS NULL OR eliminado=0) GROUP BY vendedor").all();
log('| Vendedor | Count | Sum Precio | Sum Ganancia | Sum Comision |');
log('|---|---|---|---|---|');
byV.forEach(r => log(`| ${r.vendedor} | ${r.cnt} | ${r.sum_precio} | ${r.sum_ganancia} | ${r.sum_comision} |`));

// By month
log('');
log('## By Month (active, non-rejected)');
const byM = db.prepare("SELECT substr(fecha,1,7) as mes, COUNT(*) as cnt, COALESCE(SUM(CASE WHEN estatus NOT IN ('Rechazado','Cancelado') THEN precio_ingreso ELSE 0 END),0) as ingresos, COALESCE(SUM(CASE WHEN estatus NOT IN ('Rechazado','Cancelado') THEN ganancia_mahana ELSE 0 END),0) as ganancia FROM reservas_tours WHERE (eliminado IS NULL OR eliminado=0) GROUP BY substr(fecha,1,7)").all();
log('| Mes | Count | Ingresos | Ganancia |');
log('|---|---|---|---|');
byM.forEach(r => log(`| ${r.mes} | ${r.cnt} | ${r.ingresos} | ${r.ganancia} |`));

// By status
log('');
log('## By Status (active)');
const byS = db.prepare("SELECT estatus, COUNT(*) as cnt, COALESCE(SUM(precio_ingreso),0) as sum_precio FROM reservas_tours WHERE (eliminado IS NULL OR eliminado=0) GROUP BY estatus").all();
log('| Status | Count | Sum Precio |');
log('|---|---|---|');
byS.forEach(r => log(`| ${r.estatus} | ${r.cnt} | ${r.sum_precio} |`));

// Deleted
log('');
log('## Deleted Tours');
const del = db.prepare('SELECT id, cliente, actividad, precio_ingreso, eliminado_por, eliminado_at FROM reservas_tours WHERE eliminado=1').all();
log('| ID | Cliente | Actividad | Precio | Eliminado Por | Eliminado At |');
log('|---|---|---|---|---|---|');
del.forEach(r => log(`| ${r.id} | ${r.cliente} | ${r.actividad} | ${r.precio_ingreso} | ${r.eliminado_por} | ${r.eliminado_at} |`));
log(`**Total deleted: ${del.length}**`);

// Grand total
log('');
log('## Grand Total (active, non-rejected)');
const grand = db.prepare("SELECT COUNT(*) as tours, COALESCE(SUM(CASE WHEN estatus NOT IN ('Rechazado','Cancelado') THEN precio_ingreso ELSE 0 END),0) as total_precio, COALESCE(SUM(CASE WHEN estatus NOT IN ('Rechazado','Cancelado') THEN ganancia_mahana ELSE 0 END),0) as total_ganancia FROM reservas_tours WHERE (eliminado IS NULL OR eliminado=0)").get();
log(`- **Active tours:** ${grand.tours}`);
log(`- **Total precio (ingresos):** $${grand.total_precio}`);
log(`- **Total ganancia:** $${grand.total_ganancia}`);

const outPath = path.join('C:', 'Users', 'Usuario', '.gemini', 'antigravity', 'brain', 'fce9b2af-d098-4eca-af89-e1b6acfe1053', 'data_audit.md');
fs.writeFileSync(outPath, out);
console.log('Report written to:', outPath);

db.close();
