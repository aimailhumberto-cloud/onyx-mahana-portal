/**
 * Notification Orchestrator — Mahana Tours
 * Centralizes all 3 notification channels: Email, WhatsApp, Telegram
 * Each channel has its own try/catch — if one fails, others still send.
 */
const email = require('./email');
const whatsapp = require('./whatsapp');
const telegram = require('./telegram');

// ── Initialize channels ──

async function initialize() {
  // Connect WhatsApp (shows QR code if needed)
  await whatsapp.connectWhatsApp();
}

// ── Tour Events ──

async function onTourCreated(tour) {
  const results = {};
  
  // Email confirmation to client
  try {
    results.email = await email.sendConfirmacion(tour);
  } catch (err) {
    console.error('🔔 Notification error (email/create):', err.message);
    results.email = { success: false, error: err.message };
  }

  // WhatsApp to team/owner
  try {
    if (whatsapp.WHATSAPP_NOTIFY_NUMBER) {
      results.whatsapp = await whatsapp.sendWhatsApp(whatsapp.WHATSAPP_NOTIFY_NUMBER, whatsapp.formatNewTour(tour));
    }
  } catch (err) {
    console.error('🔔 Notification error (whatsapp/create):', err.message);
    results.whatsapp = { success: false, error: err.message };
  }

  // Telegram to group/agent
  try {
    results.telegram = await telegram.sendTelegram(null, telegram.formatNewTour(tour));
  } catch (err) {
    console.error('🔔 Notification error (telegram/create):', err.message);
    results.telegram = { success: false, error: err.message };
  }

  console.log(`🔔 Notifications for tour #${tour.id}:`, JSON.stringify(results));
  return results;
}

async function onTourApproved(tour) {
  const results = {};
  
  // Email confirmation to client
  try {
    results.email = await email.sendConfirmacion(tour);
  } catch (err) {
    console.error('🔔 Notification error (email/approve):', err.message);
    results.email = { success: false, error: err.message };
  }

  // WhatsApp to team/owner
  try {
    if (whatsapp.WHATSAPP_NOTIFY_NUMBER) {
      results.whatsapp = await whatsapp.sendWhatsApp(whatsapp.WHATSAPP_NOTIFY_NUMBER, whatsapp.formatApprovedTour(tour));
    }
  } catch (err) {
    console.error('🔔 Notification error (whatsapp/approve):', err.message);
    results.whatsapp = { success: false, error: err.message };
  }

  // Telegram to group/agent
  try {
    results.telegram = await telegram.sendTelegram(null, telegram.formatApprovedTour(tour));
  } catch (err) {
    console.error('🔔 Notification error (telegram/approve):', err.message);
    results.telegram = { success: false, error: err.message };
  }

  console.log(`🔔 Notifications for approved tour #${tour.id}:`, JSON.stringify(results));
  return results;
}

async function onTourStatusChanged(tour, oldStatus, newStatus) {
  const results = {};
  
  // Email on Pagado
  if (newStatus === 'Pagado' && tour.email) {
    try {
      results.email = await email.sendEmail(
        tour.email,
        `💰 Pago Confirmado — ${tour.actividad_nombre || 'Tour'} | Mahana Tours`,
        email.confirmacionTemplate({ ...tour, _paymentConfirmed: true })
      );
    } catch (err) {
      results.email = { success: false, error: err.message };
    }
  }

  // WhatsApp status change to team
  try {
    if (whatsapp.WHATSAPP_NOTIFY_NUMBER) {
      const msg = `🔄 *Tour #${tour.id} — ${oldStatus} → ${newStatus}*\n${tour.actividad || ''} — ${tour.cliente || ''}`;
      results.whatsapp = await whatsapp.sendWhatsApp(whatsapp.WHATSAPP_NOTIFY_NUMBER, msg);
    }
  } catch (err) {
    results.whatsapp = { success: false, error: err.message };
  }

  // Telegram status change
  try {
    results.telegram = await telegram.sendTelegram(null, telegram.formatStatusChange(tour, oldStatus, newStatus));
  } catch (err) {
    results.telegram = { success: false, error: err.message };
  }

  return results;
}
// ── Estadía Events ──

async function onEstadiaCreated(estadia) {
  const results = {};

  // Email to client
  try {
    results.email = await email.sendEstadiaConfirmacion(estadia);
  } catch (err) {
    results.email = { success: false, error: err.message };
  }

  // WhatsApp to team
  try {
    if (whatsapp.WHATSAPP_NOTIFY_NUMBER) {
      results.whatsapp = await whatsapp.sendWhatsApp(whatsapp.WHATSAPP_NOTIFY_NUMBER, whatsapp.formatNewEstadia(estadia));
    }
  } catch (err) {
    results.whatsapp = { success: false, error: err.message };
  }

  // Telegram
  try {
    results.telegram = await telegram.sendTelegram(null, telegram.formatNewEstadia(estadia));
  } catch (err) {
    results.telegram = { success: false, error: err.message };
  }

  console.log(`🔔 Notifications for estadía #${estadia.id}:`, JSON.stringify(results));
  return results;
}

async function onEstadiaStatusChanged(estadia, oldStatus, newStatus) {
  const results = {};

  // Email on Confirmada or Pagada
  if (['Confirmada', 'Pagada'].includes(newStatus) && estadia.email) {
    try {
      results.email = await email.sendEstadiaStatusChange(estadia, newStatus);
    } catch (err) {
      results.email = { success: false, error: err.message };
    }
  }

  // WhatsApp to team
  try {
    if (whatsapp.WHATSAPP_NOTIFY_NUMBER) {
      results.whatsapp = await whatsapp.sendWhatsApp(whatsapp.WHATSAPP_NOTIFY_NUMBER, whatsapp.formatEstadiaStatus(estadia, oldStatus, newStatus));
    }
  } catch (err) {
    results.whatsapp = { success: false, error: err.message };
  }

  // Telegram
  try {
    results.telegram = await telegram.sendTelegram(null, telegram.formatEstadiaStatus(estadia, oldStatus, newStatus));
  } catch (err) {
    results.telegram = { success: false, error: err.message };
  }

  console.log(`🔔 Estadía #${estadia.id} ${oldStatus} → ${newStatus}:`, JSON.stringify(results));
  return results;
}

// ── Scheduled Notifications ──

async function sendDailyReminders(db) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  
  try {
    const tours = db.prepare(`
      SELECT rt.*, a.nombre as actividad_nombre, a.punto_encuentro
      FROM reservas_tours rt
      LEFT JOIN actividades a ON a.nombre = rt.actividad
      WHERE rt.fecha = ? AND rt.estatus IN ('Reservado', 'Pagado', 'Aprobado')
      AND (rt.eliminado IS NULL OR rt.eliminado = 0)
    `).all(tomorrowStr);

    console.log(`🔔 Sending ${tours.length} reminders for ${tomorrowStr}`);
    
    let emailSent = 0, waSent = 0;
    for (const tour of tours) {
      // Email reminder
      if (tour.email_cliente || tour.email) {
        try {
          const result = await email.sendRecordatorio({ ...tour, email: tour.email_cliente || tour.email });
          if (result.success) emailSent++;
        } catch (err) {
          console.error(`🔔 Email reminder failed for tour #${tour.id}:`, err.message);
        }
      }
      // WhatsApp reminder to client
      if (tour.whatsapp) {
        try {
          const result = await whatsapp.sendWhatsApp(tour.whatsapp, whatsapp.formatReminder(tour));
          if (result.success) waSent++;
        } catch (err) {
          console.error(`🔔 WA reminder failed for tour #${tour.id}:`, err.message);
        }
      }
    }
    
    console.log(`🔔 Reminders: ${emailSent} emails, ${waSent} WhatsApp / ${tours.length} tours`);
    return { total: tours.length, emailSent, waSent };
  } catch (err) {
    console.error('🔔 Error sending reminders:', err.message);
    return { total: 0, emailSent: 0, waSent: 0, error: err.message };
  }
}

async function sendDailySummary(db, toEmail) {
  const today = new Date().toISOString().split('T')[0];
  
  try {
    const tours = db.prepare(`
      SELECT rt.*, a.nombre as actividad_nombre
      FROM reservas_tours rt
      LEFT JOIN actividades a ON a.nombre = rt.actividad
      WHERE rt.fecha = ? AND rt.estatus IN ('Reservado', 'Pagado', 'Aprobado')
      AND (rt.eliminado IS NULL OR rt.eliminado = 0)
      ORDER BY rt.hora ASC
    `).all(today);

    const totalIngresos = tours.reduce((sum, t) => sum + (t.precio_ingreso || 0), 0);
    const summaryData = { fecha: today, tours, totalTours: tours.length, totalIngresos };

    const results = {};

    // Email summary
    if (toEmail) {
      results.email = await email.sendResumenDiario(toEmail, summaryData);
    }

    // WhatsApp summary
    if (whatsapp.WHATSAPP_NOTIFY_NUMBER) {
      try {
        results.whatsapp = await whatsapp.sendWhatsApp(whatsapp.WHATSAPP_NOTIFY_NUMBER, whatsapp.formatDailySummary(summaryData));
      } catch (err) {
        results.whatsapp = { success: false, error: err.message };
      }
    }

    // Telegram summary
    try {
      results.telegram = await telegram.sendTelegram(null, telegram.formatDailySummary(summaryData));
    } catch (err) {
      results.telegram = { success: false, error: err.message };
    }

    console.log(`🔔 Daily summary: ${tours.length} tours, $${totalIngresos}`);
    return results;
  } catch (err) {
    console.error('🔔 Error sending daily summary:', err.message);
    return { success: false, error: err.message };
  }
}

// ── Verify all channels ──

async function verifyAll() {
  const results = {};
  results.email = await email.verifyConnection();
  results.whatsapp = whatsapp.getStatus();
  results.telegram = telegram.getStatus();
  return results;
}

module.exports = {
  initialize,
  onTourCreated,
  onTourApproved,
  onTourStatusChanged,
  onEstadiaCreated,
  onEstadiaStatusChanged,
  sendDailyReminders,
  sendDailySummary,
  verifyAll,
};
