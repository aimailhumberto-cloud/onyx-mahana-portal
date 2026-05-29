const express = require('express');
const router = express.Router();
const { success, error } = require('../middleware/response');
const { getDb, findAll, findById, update } = require('../db/database');
const { requireAuth } = require('../auth');
const { sanitize } = require('../utils/sanitize');

// ── ACCOUNTS RECEIVABLE (CxC) CRUD ──

router.get('/api/v1/cxc', requireAuth, (req, res) => {
  try {
    const { cxc_estatus, vendedor, page = 1, limit = 50 } = req.query;
    const where = {};
    if (cxc_estatus) where.cxc_estatus = cxc_estatus;
    if (vendedor) where.vendedor_like = vendedor;

    // CxC is only generated for partner tours, exclude Mahana Tours
    where.vendedor_not = 'Mahana Tours';
    where.eliminado = 0;

    const result = findAll('reservas_tours', { where, page: Number(page), limit: Number(limit), orderBy: 'fecha DESC' });
    
    // Strip private internal financial data, only expose CxC specific data
    const safeData = result.data.map(t => ({
      id: t.id,
      cliente: t.cliente,
      actividad: t.actividad,
      fecha: t.fecha,
      vendedor: t.vendedor,
      estatus: t.estatus,
      precio_ingreso: t.precio_ingreso,
      monto_comision: t.monto_comision,
      cxc_subtotal: t.cxc_subtotal,
      cxc_itbm: t.cxc_itbm,
      cxc_total: t.cxc_total,
      cxc_estatus: t.cxc_estatus || 'Pendiente',
      cxc_fecha_emision: t.cxc_fecha_emision,
      cxc_fecha_pago: t.cxc_fecha_pago,
      cxc_comprobante: t.cxc_comprobante,
    }));

    success(res, safeData, result.meta);
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error listing accounts receivable', 500);
  }
});

// CxC dashboard metrics
router.get('/api/v1/cxc/dashboard', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total_cuentas,
        COALESCE(SUM(CASE WHEN cxc_estatus = 'Pagada' THEN cxc_total ELSE 0 END), 0) as cobrado,
        COALESCE(SUM(CASE WHEN cxc_estatus != 'Pagada' OR cxc_estatus IS NULL THEN cxc_total ELSE 0 END), 0) as pendiente,
        COALESCE(SUM(cxc_total), 0) as total_monto
      FROM reservas_tours
      WHERE (eliminado IS NULL OR eliminado = 0) AND vendedor != 'Mahana Tours' AND cxc_total IS NOT NULL
    `).get();

    const porVendedor = db.prepare(`
      SELECT 
        vendedor,
        COUNT(*) as total_cuentas,
        COALESCE(SUM(CASE WHEN cxc_estatus = 'Pagada' THEN cxc_total ELSE 0 END), 0) as cobrado,
        COALESCE(SUM(CASE WHEN cxc_estatus != 'Pagada' OR cxc_estatus IS NULL THEN cxc_total ELSE 0 END), 0) as pendiente
      FROM reservas_tours
      WHERE (eliminado IS NULL OR eliminado = 0) AND vendedor != 'Mahana Tours' AND cxc_total IS NOT NULL
      GROUP BY vendedor
      ORDER BY pendiente DESC
    `).all();

    success(res, { stats, porVendedor });
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error fetching CxC dashboard', 500);
  }
});

// Patch CxC payment status
router.patch('/api/v1/cxc/:id/pago', requireAuth, (req, res) => {
  try {
    const { cxc_estatus, cxc_comprobante } = req.body;
    if (!cxc_estatus) return error(res, 'VALIDATION_ERROR', 'cxc_estatus es requerido', 400);

    const tour = findById('reservas_tours', req.params.id);
    if (!tour) return error(res, 'NOT_FOUND', 'Registro no encontrado', 404);

    const data = { cxc_estatus };
    if (cxc_estatus === 'Pagada') {
      data.cxc_fecha_pago = new Date().toISOString().split('T')[0];
    }
    if (cxc_comprobante) {
      data.cxc_comprobante = sanitize(cxc_comprobante);
    }

    const updated = update('reservas_tours', req.params.id, data);
    success(res, {
      id: updated.id,
      cxc_estatus: updated.cxc_estatus,
      cxc_fecha_pago: updated.cxc_fecha_pago,
      cxc_comprobante: updated.cxc_comprobante,
    });
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error updating CxC payment status', 500);
  }
});

module.exports = router;
