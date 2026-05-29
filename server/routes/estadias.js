const express = require('express');
const router = express.Router();
const { success, error } = require('../middleware/response');
const { getDb, findAll, findById, create, update, remove } = require('../db/database');
const { requireAuth, isPartner } = require('../auth');
const { sanitize } = require('../utils/sanitize');
const notifications = require('../notifications');

// ── LODGING / ESTADIAS CRUD ──

router.get('/api/v1/estadias', requireAuth, (req, res) => {
  try {
    const { estado, propiedad, page = 1, limit = 50 } = req.query;
    const where = {};
    if (estado) where.estado = estado;
    if (propiedad) where.propiedad_like = propiedad;

    // Partner scoping: only see their own lodging reservations
    if (isPartner(req)) {
      where.vendedor = req.user.vendedor;
    }

    const result = findAll('reservas_estadias', { where, page: Number(page), limit: Number(limit), orderBy: 'check_in DESC' });
    success(res, result.data, result.meta);
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error listing estadias', 500);
  }
});

router.get('/api/v1/estadias/:id', requireAuth, (req, res) => {
  try {
    const item = findById('reservas_estadias', req.params.id);
    if (!item) return error(res, 'NOT_FOUND', `Estadía ${req.params.id} not found`, 404);

    // Partner scope validation
    if (isPartner(req) && item.vendedor !== req.user.vendedor) {
      return error(res, 'FORBIDDEN', 'No tienes acceso a esta estadía', 403);
    }

    success(res, item);
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error fetching estadía', 500);
  }
});

router.post('/api/v1/estadias', requireAuth, (req, res) => {
  try {
    const { cliente, propiedad, check_in, check_out } = req.body;
    if (!cliente || !propiedad || !check_in) {
      return error(res, 'VALIDATION_ERROR', 'Campos requeridos: cliente, propiedad, check_in', 400);
    }

    const data = {};
    const allowed = ['cliente', 'whatsapp', 'email', 'propiedad', 'check_in', 'check_out',
      'huespedes', 'estado', 'vendedor', 'precio_final', 'comision_pct',
      'monto_comision', 'fuente', 'notas', 'comprobante_url'];

    for (const field of allowed) {
      if (req.body[field] !== undefined && req.body[field] !== null) {
        data[field] = typeof req.body[field] === 'string' ? sanitize(req.body[field]) : req.body[field];
      }
    }

    // Auto-calculate comision if not provided
    if (data.precio_final !== undefined && data.monto_comision === undefined) {
      const precio = data.precio_final || 0;
      const comPct = data.comision_pct || 0;
      data.monto_comision = Math.round((precio * comPct / 100) * 100) / 100;
    }

    if (!data.fuente) data.fuente = 'api';

    const item = create('reservas_estadias', data);
    success(res, item, null, 201);

    // Send notifications asynchronously
    setImmediate(async () => {
      try {
        await notifications.onEstadiaCreated(item);
      } catch (err) {
        console.error('🔔 Notification error (estadia create):', err.message);
      }
    });
  } catch (err) {
    console.error('Error creating estadía:', err);
    error(res, 'SERVER_ERROR', 'Error creating estadía', 500);
  }
});

router.put('/api/v1/estadias/:id', requireAuth, (req, res) => {
  try {
    const existing = findById('reservas_estadias', req.params.id);
    if (!existing) return error(res, 'NOT_FOUND', `Estadía ${req.params.id} not found`, 404);

    // Partner scope validation
    if (isPartner(req) && existing.vendedor !== req.user.vendedor) {
      return error(res, 'FORBIDDEN', 'No tienes permiso para editar esta estadía', 403);
    }

    const data = {};
    const allowed = ['cliente', 'whatsapp', 'email', 'propiedad', 'check_in', 'check_out',
      'huespedes', 'estado', 'vendedor', 'precio_final', 'comision_pct',
      'monto_comision', 'notas', 'comprobante_url'];

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        data[field] = typeof req.body[field] === 'string' ? sanitize(req.body[field]) : req.body[field];
      }
    }

    // Recalculate comision if final price or comision pct changes
    const merged = { ...existing, ...data };
    if (data.precio_final !== undefined || data.comision_pct !== undefined) {
      const precio = merged.precio_final || 0;
      const comPct = merged.comision_pct || 0;
      data.monto_comision = Math.round((precio * comPct / 100) * 100) / 100;
    }

    const updated = update('reservas_estadias', req.params.id, data);
    success(res, updated);

    // Notify status changes
    if (data.estado && data.estado !== existing.estado) {
      setImmediate(async () => {
        try {
          await notifications.onEstadiaStatusChanged(updated, existing.estado, data.estado);
        } catch (err) {
          console.error('🔔 Notification error (estadia update):', err.message);
        }
      });
    }
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error updating estadía', 500);
  }
});

router.delete('/api/v1/estadias/:id', requireAuth, (req, res) => {
  try {
    const existing = findById('reservas_estadias', req.params.id);
    if (!existing) return error(res, 'NOT_FOUND', `Estadía ${req.params.id} not found`, 404);

    // Partner scope validation
    if (isPartner(req) && existing.vendedor !== req.user.vendedor) {
      return error(res, 'FORBIDDEN', 'No tienes permiso para eliminar esta estadía', 403);
    }

    const removed = remove('reservas_estadias', req.params.id);
    success(res, { deleted: true, id: req.params.id });
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error deleting estadía', 500);
  }
});

// ── PARTNER LODGING ENDPOINTS ──

router.get('/api/v1/partner/estadias', requireAuth, (req, res) => {
  try {
    if (!isPartner(req)) return error(res, 'FORBIDDEN', 'Solo para partners', 403);
    const { estado, page = 1, limit = 50 } = req.query;

    const where = { vendedor: req.user.vendedor };
    if (estado) where.estado = estado;

    const result = findAll('reservas_estadias', { where, page: Number(page), limit: Number(limit), orderBy: 'check_in DESC' });
    success(res, result.data, result.meta);
  } catch (err) {
    error(res, 'SERVER_ERROR', 'Error listing partner lodging', 500);
  }
});

router.post('/api/v1/partner/estadias', requireAuth, (req, res) => {
  try {
    if (!isPartner(req)) return error(res, 'FORBIDDEN', 'Solo para partners', 403);
    const { cliente, propiedad, check_in, check_out } = req.body;
    if (!cliente || !propiedad || !check_in) {
      return error(res, 'VALIDATION_ERROR', 'Campos requeridos: cliente, propiedad, check_in', 400);
    }

    const data = {};
    const allowed = ['cliente', 'whatsapp', 'email', 'propiedad', 'check_in', 'check_out',
      'huespedes', 'notas', 'comprobante_url'];

    for (const field of allowed) {
      if (req.body[field] !== undefined && req.body[field] !== null) {
        data[field] = typeof req.body[field] === 'string' ? sanitize(req.body[field]) : req.body[field];
      }
    }

    data.vendedor = req.user.vendedor;
    data.fuente = 'partner-portal';
    data.estado = 'Solicitada'; // always start as Solicitada for partners

    const item = create('reservas_estadias', data);
    success(res, item, null, 201);

    // Send notifications
    setImmediate(async () => {
      try {
        await notifications.onEstadiaCreated(item);
      } catch (err) {
        console.error('🔔 Notification error (partner estadia create):', err.message);
      }
    });
  } catch (err) {
    console.error('Error creating partner estadía:', err);
    error(res, 'SERVER_ERROR', 'Error creating partner estadía', 500);
  }
});

module.exports = router;
