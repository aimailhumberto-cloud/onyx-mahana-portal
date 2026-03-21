/**
 * WhatsApp Notification Module — Mahana Tours
 * Uses Baileys (unofficial WhatsApp Web API)
 * 
 * QR code is served via GET /api/v1/whatsapp/qr (as base64 PNG)
 * Admin can scan it from the portal's admin panel.
 */
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

const WHATSAPP_ENABLED = process.env.WHATSAPP_ENABLED === 'true';
const SESSION_DIR = path.join(__dirname, '../../data/whatsapp-session');
const WHATSAPP_NOTIFY_NUMBER = process.env.WHATSAPP_NOTIFY_NUMBER || '';

let sock = null;
let isConnected = false;
let connectionRetries = 0;
let currentQR = null; // Stores the latest QR code as base64 PNG data URL
const MAX_RETRIES = 5;

// Ensure session directory exists
if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

// Clear stale/corrupted session
function clearSession() {
  try {
    if (fs.existsSync(SESSION_DIR)) {
      fs.rmSync(SESSION_DIR, { recursive: true, force: true });
      fs.mkdirSync(SESSION_DIR, { recursive: true });
      console.log('💬 WhatsApp session cleared.');
    }
  } catch (err) {
    console.error('💬 Error clearing session:', err.message);
  }
}

async function connectWhatsApp() {
  if (!WHATSAPP_ENABLED) {
    console.log('💬 WhatsApp disabled (set WHATSAPP_ENABLED=true to enable)');
    return null;
  }

  try {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

    sock = makeWASocket({
      auth: state,
      browser: ['Mahana Portal', 'Server', '1.0.0'],
      logger: {
        level: 'silent',
        trace: () => {},
        debug: () => {},
        info: () => {},
        warn: console.warn,
        error: console.error,
        fatal: console.error,
        child: function() {
          return {
            trace: () => {},
            debug: () => {},
            info: () => {},
            warn: console.warn,
            error: console.error,
            fatal: console.error,
            child: function() { return this; },
          };
        },
      },
    });

    // Save credentials on update
    sock.ev.on('creds.update', saveCreds);

    // Connection status
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        // Generate QR code as base64 PNG
        try {
          currentQR = await QRCode.toDataURL(qr, { width: 400, margin: 2 });
          console.log('💬 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('💬 QR CODE READY — Scan from your portal:');
          console.log('💬 Go to Admin → WhatsApp → Scan QR');
          console.log('💬 Or visit: GET /api/v1/whatsapp/qr');
          console.log('💬 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        } catch (err) {
          console.error('💬 Error generating QR code:', err.message);
        }
      }

      if (connection === 'close') {
        isConnected = false;
        currentQR = null;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        
        // 405 = stale/corrupted session — clear and retry fresh
        if (statusCode === 405 || statusCode === 401 || statusCode === 403) {
          console.log(`💬 WhatsApp auth error (code: ${statusCode}). Clearing session and retrying...`);
          clearSession();
          if (connectionRetries < MAX_RETRIES) {
            connectionRetries++;
            setTimeout(connectWhatsApp, 3000);
          } else {
            console.error('💬 WhatsApp max retries after session clear. Check WHATSAPP_ENABLED and restart.');
          }
        } else if (shouldReconnect && connectionRetries < MAX_RETRIES) {
          connectionRetries++;
          console.log(`💬 WhatsApp disconnected (code: ${statusCode}). Reconnecting (${connectionRetries}/${MAX_RETRIES})...`);
          setTimeout(connectWhatsApp, 5000);
        } else if (!shouldReconnect) {
          console.log('💬 WhatsApp logged out. Clearing session...');
          clearSession();
        } else {
          console.error('💬 WhatsApp max retries reached. Restart server to try again.');
        }
      }

      if (connection === 'open') {
        isConnected = true;
        connectionRetries = 0;
        currentQR = null; // Clear QR once connected
        console.log('💬 WhatsApp connected ✅');
      }
    });

    return sock;
  } catch (err) {
    console.error('💬 WhatsApp connection error:', err.message);
    return null;
  }
}

// Format phone number for WhatsApp (must be: countrycode+number@s.whatsapp.net)
function formatNumber(number) {
  let clean = number.replace(/[\s\-\+\(\)]/g, '');
  return `${clean}@s.whatsapp.net`;
}

function formatGroup(groupId) {
  if (groupId.includes('@')) return groupId;
  return `${groupId}@g.us`;
}

async function sendWhatsApp(to, message) {
  if (!WHATSAPP_ENABLED || !isConnected || !sock) {
    console.warn('💬 WhatsApp not available. Message not sent to', to);
    return { success: false, reason: !WHATSAPP_ENABLED ? 'disabled' : 'not_connected' };
  }

  try {
    const jid = to.includes('@') ? to : formatNumber(to);
    await sock.sendMessage(jid, { text: message });
    console.log(`💬 WhatsApp sent to ${to}`);
    return { success: true };
  } catch (err) {
    console.error(`💬 WhatsApp failed to ${to}:`, err.message);
    return { success: false, error: err.message };
  }
}

// ── Pre-formatted Messages ──

function formatNewTour(tour) {
  const lines = [
    `🆕 *Nueva Reserva*`,
    ``,
    `🏄 *${tour.actividad_nombre || tour.actividad || 'Tour'}*`,
    `👤 Cliente: ${tour.cliente || '—'}`,
    `📅 Fecha: ${tour.fecha || '—'}`,
    `⏰ Hora: ${tour.hora || '—'}`,
    `👥 Personas: ${tour.pax || tour.personas || 1}`,
    `💰 Ingreso: $${tour.precio_ingreso || 0}`,
  ];
  if (tour.vendedor) lines.push(`🏢 Vendedor: ${tour.vendedor}`);
  if (tour.responsable) lines.push(`👨‍🏫 Responsable: ${tour.responsable}`);
  return lines.join('\n');
}

function formatApprovedTour(tour) {
  return [
    `✅ *Tour Aprobado*`,
    ``,
    `🏄 ${tour.actividad_nombre || tour.actividad || 'Tour'}`,
    `👤 ${tour.cliente || '—'}`,
    `📅 ${tour.fecha || '—'} ⏰ ${tour.hora || '—'}`,
    `💰 $${tour.precio_ingreso || 0}`,
  ].join('\n');
}

function formatReminder(tour) {
  return [
    `📋 *Recordatorio para mañana*`,
    ``,
    `🏄 ${tour.actividad_nombre || tour.actividad || 'Tour'}`,
    `⏰ ${tour.hora || '—'}`,
    `👤 ${tour.cliente || '—'}`,
    `📍 ${tour.punto_encuentro || 'Punto de encuentro por confirmar'}`,
    ``,
    `¡Nos vemos! 🌊`,
  ].join('\n');
}

function formatDailySummary(data) {
  const lines = [
    `📊 *Resumen del Día — ${data.fecha}*`,
    ``,
    `📋 Tours: *${data.totalTours}*`,
    `💰 Ingresos: *$${data.totalIngresos}*`,
    ``,
  ];

  if (data.tours && data.tours.length > 0) {
    data.tours.forEach(t => {
      lines.push(`• ${t.hora || '—'} — ${t.actividad_nombre || t.actividad || ''} — ${t.cliente || ''} ($${t.precio_ingreso || 0})`);
    });
  } else {
    lines.push('_No hay tours programados para hoy_');
  }

  return lines.join('\n');
}

// ── Estadía Messages ──

function formatNewEstadia(estadia) {
  return [
    `🏨 *Nueva Estadía*`,
    ``,
    `🏠 *${estadia.propiedad || 'Propiedad'}*`,
    `👤 Cliente: ${estadia.cliente || '—'}`,
    `📅 Check-in: ${estadia.check_in || '—'}`,
    `📅 Check-out: ${estadia.check_out || '—'}`,
    `👥 Huéspedes: ${estadia.huespedes || '—'}`,
    estadia.precio_final ? `💰 Precio: $${estadia.precio_final}` : '',
    estadia.estado ? `📊 Estado: ${estadia.estado}` : '',
  ].filter(Boolean).join('\n');
}

function formatEstadiaStatus(estadia, oldStatus, newStatus) {
  const emoji = { 'Cotizada': '💬', 'Confirmada': '✅', 'Pagada': '💰', 'Perdida': '❌' };
  return [
    `${emoji[newStatus] || '🔄'} *Estadía ${newStatus}*`,
    ``,
    `🏠 ${estadia.propiedad || '—'}`,
    `👤 ${estadia.cliente || '—'}`,
    `📅 ${estadia.check_in || '—'} → ${estadia.check_out || '—'}`,
  ].join('\n');
}

function getStatus() {
  return {
    enabled: WHATSAPP_ENABLED,
    connected: isConnected,
    notifyNumber: WHATSAPP_NOTIFY_NUMBER,
    qrAvailable: !!currentQR,
  };
}

function getCurrentQR() {
  return currentQR;
}

module.exports = {
  connectWhatsApp,
  sendWhatsApp,
  formatNumber,
  formatGroup,
  formatNewTour,
  formatApprovedTour,
  formatReminder,
  formatDailySummary,
  formatNewEstadia,
  formatEstadiaStatus,
  getStatus,
  getCurrentQR,
  clearSession,
  WHATSAPP_NOTIFY_NUMBER,
};
