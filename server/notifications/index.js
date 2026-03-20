/**
 * Notification Orchestrator — Mahana Tours
 * Centralizes all notification channels (Email, WhatsApp, Telegram)
 * Each channel has its own try/catch — if one fails, others still send.
 */
const email = require('./email');

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

  // TODO: WhatsApp to team
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

  // TODO: WhatsApp to team
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

  // TODO: WhatsApp status change to team
  // TODO: Telegram to agent

  return results;
}

// ── Scheduled Notifications ──

async function sendDailyReminders(db) {
  // Find tours for tomorrow with email
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
      AND rt.email IS NOT NULL AND rt.email != ''
    `).all(tomorrowStr);

    console.log(`🔔 Sending ${tours.length} reminders for ${tomorrowStr}`);
    
    let sent = 0;
    for (const tour of tours) {
      try {
        const result = await email.sendRecordatorio(tour);
        if (result.success) sent++;
      } catch (err) {
        console.error(`🔔 Reminder failed for tour #${tour.id}:`, err.message);
      }
    }
    
    console.log(`🔔 Reminders complete: ${sent}/${tours.length} sent`);
    return { total: tours.length, sent };
  } catch (err) {
    console.error('🔔 Error sending reminders:', err.message);
    return { total: 0, sent: 0, error: err.message };
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

    const result = await email.sendResumenDiario(toEmail, {
      fecha: today,
      tours,
      totalTours: tours.length,
      totalIngresos,
    });

    console.log(`🔔 Daily summary sent to ${toEmail}: ${tours.length} tours, $${totalIngresos}`);
    return result;
  } catch (err) {
    console.error('🔔 Error sending daily summary:', err.message);
    return { success: false, error: err.message };
  }
}

// ── Verify all channels ──

async function verifyAll() {
  const results = {};
  results.email = await email.verifyConnection();
  // TODO: results.whatsapp = await whatsapp.verifyConnection();
  // TODO: results.telegram = await telegram.verifyConnection();
  return results;
}

module.exports = {
  onTourCreated,
  onTourApproved,
  onTourStatusChanged,
  sendDailyReminders,
  sendDailySummary,
  verifyAll,
};
