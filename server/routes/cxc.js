const express = require('express');
const router = express.Router();
const { success, error } = require('../middleware/response');
const { getDb, findById, update } = require('../db/database');
const { requireAuth, requireRole, isPartner } = require('../auth');
const { sanitize } = require('../utils/sanitize');
const { calcCxC } = require('../utils/finance');

// ── Admin: List CxC with dashboard summary and aging analysis ──
router.get('/api/v1/cxc', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const db = getDb();
    const { vendedor, cxc_estatus, fecha_desde, fecha_hasta } = req.query;
    let where = '(eliminado IS NULL OR eliminado = 0) AND vendedor IS NOT NULL';
    const params = [];

    if (vendedor) { where += ' AND vendedor = ?'; params.push(vendedor); }
    if (cxc_estatus) { where += ' AND cxc_estatus = ?'; params.push(cxc_estatus); }
    if (fecha_desde) { where += ' AND fecha >= ?'; params.push(fecha_desde); }
    if (fecha_hasta) { where += ' AND fecha <= ?'; params.push(fecha_hasta); }

    const tours = db.prepare(`
      SELECT id, fecha, hora, cliente, actividad, vendedor, estatus,
        precio_ingreso, comision_pct, monto_comision, ganancia_mahana,
        cxc_subtotal, cxc_itbm, cxc_total, cxc_estatus,
        cxc_factura_url, cxc_fecha_emision, cxc_fecha_vencimiento, cxc_fecha_pago,
        comprobante_url
      FROM reservas_tours
      WHERE ${where}
      ORDER BY fecha DESC
    `).all(...params);

    // Summary KPIs
    const summary = db.prepare(`
      SELECT
        COUNT(*) as total_tours,
        COALESCE(SUM(cxc_total), 0) as total_cxc,
        COALESCE(SUM(CASE WHEN cxc_estatus = 'Sin Factura' OR cxc_estatus IS NULL THEN cxc_total ELSE 0 END), 0) as sin_factura,
        COALESCE(SUM(CASE WHEN cxc_estatus = 'Pendiente' THEN cxc_total ELSE 0 END), 0) as pendiente,
        COALESCE(SUM(CASE WHEN cxc_estatus = 'Enviada' THEN cxc_total ELSE 0 END), 0) as enviada,
        COALESCE(SUM(CASE WHEN cxc_estatus = 'Pagada' THEN cxc_total ELSE 0 END), 0) as pagado,
        SUM(CASE WHEN cxc_estatus = 'Sin Factura' OR cxc_estatus IS NULL THEN 1 ELSE 0 END) as count_sin_factura,
        SUM(CASE WHEN cxc_estatus = 'Pendiente' THEN 1 ELSE 0 END) as count_pendiente,
        SUM(CASE WHEN cxc_estatus = 'Enviada' THEN 1 ELSE 0 END) as count_enviada,
        SUM(CASE WHEN cxc_estatus = 'Pagada' THEN 1 ELSE 0 END) as count_pagado
      FROM reservas_tours
      WHERE ${where}
    `).get(...params);

    // Aging — how long have pending invoices been outstanding
    const today = new Date().toISOString().split('T')[0];
    const aging = db.prepare(`
      SELECT
        SUM(CASE WHEN julianday(?) - julianday(cxc_fecha_emision) <= 15 THEN cxc_total ELSE 0 END) as corriente,
        SUM(CASE WHEN julianday(?) - julianday(cxc_fecha_emision) > 15 AND julianday(?) - julianday(cxc_fecha_emision) <= 30 THEN cxc_total ELSE 0 END) as dias_15_30,
        SUM(CASE WHEN julianday(?) - julianday(cxc_fecha_emision) > 30 AND julianday(?) - julianday(cxc_fecha_emision) <= 60 THEN cxc_total ELSE 0 END) as dias_30_60,
        SUM(CASE WHEN julianday(?) - julianday(cxc_fecha_emision) > 60 THEN cxc_total ELSE 0 END) as dias_60_plus
      FROM reservas_tours
      WHERE (eliminado IS NULL OR eliminado = 0) AND cxc_estatus IN ('Pendiente', 'Enviada') AND cxc_fecha_emision IS NOT NULL
    `).get(today, today, today, today, today, today);

    // Per-vendor summary
    const porVendedor = db.prepare(`
      SELECT vendedor,
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN cxc_estatus = 'Pendiente' THEN cxc_total ELSE 0 END), 0) as pendiente,
        COALESCE(SUM(CASE WHEN cxc_estatus = 'Pagada' THEN cxc_total ELSE 0 END), 0) as pagado
      FROM reservas_tours
      WHERE (eliminado IS NULL OR eliminado = 0) AND vendedor IS NOT NULL AND vendedor != ''
      GROUP BY vendedor
      ORDER BY pendiente DESC
    `).all();

    success(res, { tours, summary, aging, porVendedor });
  } catch (err) {
    console.error('Error loading CxC:', err);
    error(res, 'SERVER_ERROR', 'Error loading CxC', 500);
  }
});

// ── Admin: Update CxC details on a tour (PATCH) ──
router.patch('/api/v1/tours/:id/cxc', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const tour = findById('reservas_tours', req.params.id);
    if (!tour) return error(res, 'NOT_FOUND', 'Tour no encontrado', 404);

    const data = {};
    const allowed = ['cxc_estatus', 'cxc_factura_url', 'cxc_fecha_emision', 'cxc_fecha_vencimiento', 'cxc_fecha_pago'];
    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        data[field] = req.body[field];
      }
    }

    // If marking as Pendiente and no dates set, auto-fill
    if (data.cxc_estatus === 'Pendiente') {
      if (!data.cxc_fecha_emision && !tour.cxc_fecha_emision) {
        data.cxc_fecha_emision = new Date().toISOString().split('T')[0];
      }
      if (!data.cxc_fecha_vencimiento && !tour.cxc_fecha_vencimiento) {
        const venc = new Date();
        venc.setDate(venc.getDate() + 15);
        data.cxc_fecha_vencimiento = venc.toISOString().split('T')[0];
      }
    }

    // If marking as Pagada, auto-fill payment date
    if (data.cxc_estatus === 'Pagada' && !data.cxc_fecha_pago) {
      data.cxc_fecha_pago = new Date().toISOString().split('T')[0];
    }

    // Recalculate CxC amounts if not yet calculated
    if (!tour.cxc_total && tour.precio_ingreso) {
      Object.assign(data, calcCxC(tour));
    }

    const updated = update('reservas_tours', req.params.id, data);
    success(res, updated);
  } catch (err) {
    console.error('Error updating CxC:', err);
    error(res, 'SERVER_ERROR', 'Error updating CxC', 500);
  }
});

// ── Admin: Get CxC Email Preview ──
router.get('/api/v1/tours/:id/cxc/email-preview', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const tour = findById('reservas_tours', req.params.id);
    if (!tour) return error(res, 'NOT_FOUND', 'Tour no encontrado', 404);

    const { tipo } = req.query; // emitida, enviada, pagada
    const email = require('../notifications/email');

    // Find partner email
    const db = getDb();
    const partner = tour.vendedor
      ? db.prepare('SELECT email FROM usuarios WHERE vendedor = ? AND rol = ? AND activo = 1').get(tour.vendedor, 'partner')
      : null;

    let html, subject, to;
    const cc = process.env.NOTIFY_EMAIL_CC || '';

    if (tipo === 'pagada') {
      html = email.facturaPagadaTemplate(tour);
      subject = `💰 Pago Registrado — ${tour.vendedor || ''} | Mahana`;
      to = partner?.email || '';
    } else {
      html = email.facturaEnviadaTemplate(tour);
      subject = tipo === 'emitida'
        ? `📄 Factura Generada — ${tour.actividad || 'Tour'} | Mahana`
        : `📄 Factura Enviada al Cobro — ${tour.actividad || 'Tour'} | Mahana`;
      to = partner?.email || '';
    }

    success(res, {
      to,
      cc,
      subject,
      html,
      has_attachment: !!tour.cxc_factura_url,
      attachment_url: tour.cxc_factura_url || null,
      tour_id: tour.id,
      vendedor: tour.vendedor,
    });
  } catch (err) {
    console.error('Error email preview:', err);
    error(res, 'SERVER_ERROR', 'Error generating preview', 500);
  }
});

// ── Admin: Send CxC Email ──
router.post('/api/v1/tours/:id/cxc/send-email', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const tour = findById('reservas_tours', req.params.id);
    if (!tour) return error(res, 'NOT_FOUND', 'Tour no encontrado', 404);

    const { to, cc, subject, attach_factura } = req.body;
    if (!to || !subject) return error(res, 'VALIDATION_ERROR', 'to y subject son requeridos', 400);

    const emailModule = require('../notifications/email');

    let result;
    if (attach_factura && tour.cxc_factura_url) {
      result = await emailModule.sendEmailWithAttachment(
        to,
        subject,
        emailModule.facturaEnviadaTemplate(tour),
        tour.cxc_factura_url,
        `Factura_Mahana_${tour.id}.pdf`
      );
    } else {
      const tipo = tour.cxc_estatus === 'Pagada' ? 'pagada' : 'enviada';
      const html = tipo === 'pagada'
        ? emailModule.facturaPagadaTemplate(tour)
        : emailModule.facturaEnviadaTemplate(tour);
      result = await emailModule.sendEmail(to, subject, html, cc || undefined);
    }

    if (result.success) {
      success(res, { sent: true, messageId: result.messageId });
    } else {
      error(res, 'EMAIL_FAILED', result.error || 'Error sending', 500);
    }
  } catch (err) {
    console.error('Error sending CxC email:', err);
    error(res, 'SERVER_ERROR', 'Error sending email', 500);
  }
});

// ── Partner: View their own CxC ──
router.get('/api/v1/partner/cxc', requireAuth, (req, res) => {
  try {
    if (!isPartner(req)) return error(res, 'FORBIDDEN', 'Solo para partners', 403);
    const db = getDb();
    const vendedor = req.user.vendedor;

    const tours = db.prepare(`
      SELECT id, fecha, hora, cliente, actividad, estatus,
        precio_ingreso, comision_pct, monto_comision,
        cxc_subtotal, cxc_itbm, cxc_total, cxc_estatus,
        cxc_factura_url, cxc_fecha_emision, cxc_fecha_vencimiento, cxc_fecha_pago
      FROM reservas_tours
      WHERE (eliminado IS NULL OR eliminado = 0) AND vendedor = ?
        AND cxc_estatus IS NOT NULL AND cxc_estatus != 'Sin Factura'
      ORDER BY fecha DESC
    `).all(vendedor);

    const summary = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN cxc_estatus = 'Pendiente' THEN cxc_total ELSE 0 END), 0) as pendiente,
        COALESCE(SUM(CASE WHEN cxc_estatus = 'Enviada' THEN cxc_total ELSE 0 END), 0) as enviada,
        COALESCE(SUM(CASE WHEN cxc_estatus IN ('Pendiente', 'Enviada') THEN cxc_total ELSE 0 END), 0) as por_pagar,
        COALESCE(SUM(CASE WHEN cxc_estatus = 'Pagada' THEN cxc_total ELSE 0 END), 0) as pagado,
        SUM(CASE WHEN cxc_estatus = 'Pendiente' THEN 1 ELSE 0 END) as count_pendiente,
        SUM(CASE WHEN cxc_estatus = 'Enviada' THEN 1 ELSE 0 END) as count_enviada,
        SUM(CASE WHEN cxc_estatus IN ('Pendiente', 'Enviada') THEN 1 ELSE 0 END) as count_por_pagar,
        SUM(CASE WHEN cxc_estatus = 'Pagada' THEN 1 ELSE 0 END) as count_pagado
      FROM reservas_tours
      WHERE (eliminado IS NULL OR eliminado = 0) AND vendedor = ?
        AND cxc_estatus IS NOT NULL AND cxc_estatus != 'Sin Factura'
    `).get(vendedor);

    success(res, { tours, summary });
  } catch (err) {
    console.error('Error loading partner CxC:', err);
    error(res, 'SERVER_ERROR', 'Error loading CxC', 500);
  }
});

module.exports = router;
