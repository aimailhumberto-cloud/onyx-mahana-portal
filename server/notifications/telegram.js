/**
 * Telegram Notification Module — Mahana Tours
 * Uses official Telegram Bot API (zero dependencies, just fetch)
 * Bot: @portalmahanabot
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

async function sendTelegram(chatId, message, parseMode = 'Markdown') {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn('🤖 Telegram not configured (missing TELEGRAM_BOT_TOKEN)');
    return { success: false, reason: 'not_configured' };
  }

  const targetChat = chatId || TELEGRAM_CHAT_ID;
  if (!targetChat) {
    console.warn('🤖 No Telegram chat ID configured');
    return { success: false, reason: 'no_chat_id' };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChat,
        text: message,
        parse_mode: parseMode,
      }),
    });

    const data = await response.json();
    if (data.ok) {
      console.log(`🤖 Telegram sent to ${targetChat}`);
      return { success: true, messageId: data.result.message_id };
    } else {
      console.error(`🤖 Telegram API error:`, data.description);
      return { success: false, error: data.description };
    }
  } catch (err) {
    console.error(`🤖 Telegram failed:`, err.message);
    return { success: false, error: err.message };
  }
}

// ── Pre-formatted Messages (Markdown) ──

function formatNewTour(tour) {
  return [
    `🆕 *Nueva Reserva*`,
    ``,
    `🏄 *${escape(tour.actividad_nombre || tour.actividad || 'Tour')}*`,
    `👤 Cliente: ${escape(tour.cliente || '—')}`,
    `📅 Fecha: ${escape(tour.fecha || '—')}`,
    `⏰ Hora: ${escape(tour.hora || '—')}`,
    `👥 Personas: ${tour.pax || tour.personas || 1}`,
    `💰 Ingreso: $${tour.precio_ingreso || 0}`,
    tour.vendedor ? `🏢 Vendedor: ${escape(tour.vendedor)}` : '',
    tour.responsable ? `👨‍🏫 Responsable: ${escape(tour.responsable)}` : '',
  ].filter(Boolean).join('\n');
}

function formatApprovedTour(tour) {
  return [
    `✅ *Tour Aprobado*`,
    ``,
    `🏄 ${escape(tour.actividad_nombre || tour.actividad || 'Tour')}`,
    `👤 ${escape(tour.cliente || '—')}`,
    `📅 ${escape(tour.fecha || '—')} ⏰ ${escape(tour.hora || '—')}`,
    `💰 $${tour.precio_ingreso || 0}`,
  ].join('\n');
}

function formatStatusChange(tour, oldStatus, newStatus) {
  return `🔄 *Tour #${tour.id}*: ${escape(oldStatus)} → ${escape(newStatus)}\n${escape(tour.actividad || '')} — ${escape(tour.cliente || '')}`;
}

function formatDailySummary(data) {
  const lines = [
    `📊 *Resumen del Día — ${escape(data.fecha)}*`,
    ``,
    `📋 Tours: *${data.totalTours}*`,
    `💰 Ingresos: *$${data.totalIngresos}*`,
    ``,
  ];

  if (data.tours && data.tours.length > 0) {
    data.tours.forEach(t => {
      lines.push(`• ${t.hora || '—'} — ${escape(t.actividad_nombre || t.actividad || '')} — ${escape(t.cliente || '')} ($${t.precio_ingreso || 0})`);
    });
  } else {
    lines.push('_No hay tours programados para hoy_');
  }

  return lines.join('\n');
}

// Escape special Markdown characters
function escape(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#\+\-=|{}.!]/g, '\\$&');
}

// ── Utility: Get chat ID (useful for setup) ──

async function getUpdates() {
  if (!TELEGRAM_BOT_TOKEN) return { success: false, reason: 'not_configured' };
  try {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`);
    const data = await response.json();
    return { success: true, updates: data.result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getStatus() {
  return {
    enabled: !!TELEGRAM_BOT_TOKEN,
    chatId: TELEGRAM_CHAT_ID || 'not set',
    bot: TELEGRAM_BOT_TOKEN ? 'configured' : 'not configured',
  };
}

module.exports = {
  sendTelegram,
  formatNewTour,
  formatApprovedTour,
  formatStatusChange,
  formatDailySummary,
  getUpdates,
  getStatus,
  TELEGRAM_CHAT_ID,
};
