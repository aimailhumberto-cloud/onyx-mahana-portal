/**
 * WhatsApp Notification Module — Mahana Tours
 * Uses Baileys (unofficial WhatsApp Web API)
 * 
 * First run: Shows QR code in terminal — scan with your phone.
 * After linking: Session persists in data/whatsapp-session/
 */
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const path = require('path');
const fs = require('fs');

const WHATSAPP_ENABLED = process.env.WHATSAPP_ENABLED === 'true';
const SESSION_DIR = path.join(__dirname, '../../data/whatsapp-session');
const WHATSAPP_NOTIFY_NUMBER = process.env.WHATSAPP_NOTIFY_NUMBER || ''; // e.g. 50762906800

let sock = null;
let isConnected = false;
let connectionRetries = 0;
const MAX_RETRIES = 3;

// Ensure session directory exists
if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
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
      printQRInTerminal: true, // Shows QR in server logs
      browser: ['Mahana Portal', 'Server', '1.0.0'],
      // Reduce logging noise
      logger: {
        level: 'silent',
        trace: () => {},
        debug: () => {},
        info: () => {},
        warn: console.warn,
        error: console.error,
        fatal: console.error,
        child: () => ({
          trace: () => {},
          debug: () => {},
          info: () => {},
          warn: console.warn,
          error: console.error,
          fatal: console.error,
          child: () => this,
        }),
      },
    });

    // Save credentials on update
    sock.ev.on('creds.update', saveCreds);

    // Connection status
    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('💬 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('💬 SCAN THIS QR CODE WITH YOUR WHATSAPP');
        console.log('💬 Phone → Settings → Linked Devices → Link a Device');
        console.log('💬 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      }

      if (connection === 'close') {
        isConnected = false;
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        
        if (shouldReconnect && connectionRetries < MAX_RETRIES) {
          connectionRetries++;
          console.log(`💬 WhatsApp disconnected. Reconnecting (${connectionRetries}/${MAX_RETRIES})...`);
          setTimeout(connectWhatsApp, 5000);
        } else if (!shouldReconnect) {
          console.log('💬 WhatsApp logged out. Delete data/whatsapp-session and restart to re-link.');
        } else {
          console.error('💬 WhatsApp max retries reached. Restart server to try again.');
        }
      }

      if (connection === 'open') {
        isConnected = true;
        connectionRetries = 0;
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
  // Remove +, spaces, dashes
  let clean = number.replace(/[\s\-\+\(\)]/g, '');
  // Add @s.whatsapp.net
  return `${clean}@s.whatsapp.net`;
}

// Format group ID (must end with @g.us)
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

function getStatus() {
  return {
    enabled: WHATSAPP_ENABLED,
    connected: isConnected,
    notifyNumber: WHATSAPP_NOTIFY_NUMBER,
  };
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
  getStatus,
  WHATSAPP_NOTIFY_NUMBER,
};
