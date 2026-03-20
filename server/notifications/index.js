/**
 * Notification Orchestrator — Mahana Tours
 * Centralizes all notification channels (Email, WhatsApp, Telegram)
 * Each channel has its own try/catch — if one fails, others still send.
 */
const email = require('./email');
const whatsapp = require('./whatsapp');

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
      const msg = whatsapp.formatNewTour(tour);
      results.whatsapp = await whatsapp.sendWhatsApp(whatsapp.WHATSAPP_NOTIFY_NUMBER, msg);
    }
  } catch (err) {
    console.error('🔔 Notification error (whatsapp/create):', err.message);
    results.whatsapp = { success: false, error: err.message };
  }

  // TODO: Telegram to agent

  console.log(`🔔 Notifications sent for tour #${tour.id}:`, JSON.stringify(results));
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
      const msg = whatsapp.formatApprovedTour(tour);
      results.whatsapp = await whatsapp.sendWhatsApp(whatsapp.WHATSAPP_NOTIFY_NUMBER, msg);
    }
  } catch (err) {
    console.error('🔔 Notification error (whatsapp/approve):', err.message);
    results.whatsapp = { success: false, error: err.message };
  }

  // TODO: Telegram to agent

  console.log(`🔔 Notifications sent for approved tour #${tour.id}:`, JSON.stringify(results));
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

  return results;
}

// ── Scheduled Notifications ──

async function sendDailyReminders(db) {
  // Find tours for tomorrow with email or whatsapp
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
          const msg = whatsapp.formatReminder(tour);
          const result = await whatsapp.sendWhatsApp(tour.whatsapp, msg);
          if (result.success) waSent++;
        } catch (err) {
          console.error(`🔔 WA reminder failed for tour #${tour.id}:`, err.message);
        }
      }
    }
    
    console.log(`🔔 Reminders complete: ${emailSent} emails, ${waSent} WhatsApp out of ${tours.length} tours`);
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
        const msg = whatsapp.formatDailySummary(summaryData);
        results.whatsapp = await whatsapp.sendWhatsApp(whatsapp.WHATSAPP_NOTIFY_NUMBER, msg);
      } catch (err) {
        results.whatsapp = { success: false, error: err.message };
      }
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
  // TODO: results.telegram
  return results;
}

module.exports = {
  initialize,
  onTourCreated,
  onTourApproved,
  onTourStatusChanged,
  sendDailyReminders,
  sendDailySummary,
  verifyAll,
};
