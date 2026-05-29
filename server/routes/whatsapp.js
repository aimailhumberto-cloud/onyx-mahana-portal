const express = require('express');
const router = express.Router();
const { success, error } = require('../middleware/response');
const { requireAuth, requireRole } = require('../auth');
const notifications = require('../notifications');

// ── WHATSAPP INTEGRATION ──

router.get('/api/v1/whatsapp/status', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const status = await notifications.getWhatsAppStatus?.() || { status: 'disconnected', qr: null };
    success(res, status);
  } catch (err) {
    console.error('WhatsApp status error:', err);
    error(res, 'SERVER_ERROR', 'Error fetching WhatsApp status', 500);
  }
});

router.post('/api/v1/whatsapp/send', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { to, message } = req.body;
    if (!to || !message) {
      return error(res, 'VALIDATION_ERROR', 'Campos "to" y "message" son requeridos', 400);
    }

    const cleanPhone = to.replace(/\D/g, '');
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      return error(res, 'VALIDATION_ERROR', 'Formato de teléfono inválido (debe tener entre 10 y 15 dígitos)', 400);
    }

    const sent = await notifications.sendWhatsAppMessage?.(cleanPhone, message);
    if (sent) {
      success(res, { message: 'Mensaje enviado exitosamente', phone: cleanPhone });
    } else {
      error(res, 'WHATSAPP_ERROR', 'WhatsApp no está listo o conectado', 500);
    }
  } catch (err) {
    console.error('Error sending WhatsApp message:', err);
    error(res, 'SERVER_ERROR', err.message || 'Error al enviar WhatsApp', 500);
  }
});

module.exports = router;
