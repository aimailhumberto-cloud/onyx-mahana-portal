/**
 * Notification Orchestrator — Mahana Tours
 * Centralizes all 3 notification channels: Email, WhatsApp, Telegram
 * Each channel has its own try/catch — if one fails, others still send.
 */
const email = require('./email');
const whatsapp = require('./whatsapp');
const telegram = require('./telegram');
const { getDb } = require('../db/database');

// Read config from DB with env var fallback
function getConfig(key, envFallback) {
  try {
    const db = getDb();
    const row = db.prepare('SELECT valor FROM configuracion_notificaciones WHERE clave = ?').get(key);
    if (row && row.valor) return row.valor;
  } catch {}
  return envFallback || '';
}

function isEnabled(channel) {
  const val = getConfig(`${channel}_enabled`, process.env[`${channel.toUpperCase()}_ENABLED`]);
  return val === 'true' || val === '1';
}

// ── Helper: find partner email from vendedor name ──
function getPartnerEmail(vendedor) {
  if (!vendedor) return null;
  try {
    const db = getDb();
    const partner = db.prepare('SELECT email FROM usuarios WHERE vendedor = ? AND rol = ? AND activo = 1').get(vendedor, 'partner');
    return partner?.email || null;
  } catch { return null; }
}

// ── Initialize channels ──

async function initialize() {
  // Connect WhatsApp (shows QR code if needed)
  await whatsapp.connectWhatsApp();
}

// ── Helper: Get admin notification email(s) ──
// Uses 'email_team' as the primary admin email list, falls back to 'email_cc_default' → env var
function getAdminEmails() {
  const team = getConfig('email_team', '');
  if (team) return team;
  return getConfig('email_cc_default', process.env.NOTIFY_EMAIL_CC || '');
}

// ── Tour Events ──

async function onTourCreated(tour) {
  const results = {};
  const adminEmails = getAdminEmails();
  const cc = getConfig('email_cc_default', process.env.NOTIFY_EMAIL_CC);
  const waNumber = getConfig('whatsapp_notify', process.env.WHATSAPP_NOTIFY_NUMBER);
  const tgChatId = getConfig('telegram_chat_id', process.env.TELEGRAM_CHAT_ID);
  const emailEnabled = isEnabled('email') || process.env.SMTP_PASS;
  const isPartnerTour = tour.estatus === 'Por Aprobar' || tour.fuente === 'partner-portal';
  
  if (emailEnabled) {
    if (isPartnerTour) {
      // ── Partner-submitted tour: do NOT email client (not confirmed yet) ──
      // Only notify partner (solicitud recibida) + admin team (tour por aprobar)
      
      // Partner: "Tu solicitud fue recibida"
      if (tour.vendedor) {
        try {
          const partnerEmail = getPartnerEmail(tour.vendedor);
          if (partnerEmail) {
            results.email_partner = await email.sendPartnerSolicitudRecibida(tour, partnerEmail);
          }
        } catch (err) {
          console.error('🔔 Notification error (email/partner-create):', err.message);
        }
      }

      // Admin team: "Nuevo tour por aprobar"
      if (adminEmails) {
        try {
          results.email_admin = await email.sendAdminNuevoTour(tour, adminEmails);
        } catch (err) {
          console.error('🔔 Notification error (email/admin-create):', err.message);
        }
      }
    } else {
      // ── Admin/vendedor-created tour: email client with confirmation ──
      try {
        results.email_client = await email.sendConfirmacion(tour, cc || undefined);
      } catch (err) {
        console.error('🔔 Notification error (email/create):', err.message);
        results.email_client = { success: false, error: err.message };
      }
    }
  }

  // WhatsApp to team/owner (always)
  if (waNumber) {
    try {
      results.whatsapp = await whatsapp.sendWhatsApp(waNumber, whatsapp.formatNewTour(tour));
    } catch (err) {
      console.error('🔔 Notification error (whatsapp/create):', err.message);
      results.whatsapp = { success: false, error: err.message };
    }
  }

  // Telegram to group/agent (always)
  if (tgChatId) {
    try {
      results.telegram = await telegram.sendTelegram(tgChatId, telegram.formatNewTour(tour));
    } catch (err) {
      console.error('🔔 Notification error (telegram/create):', err.message);
      results.telegram = { success: false, error: err.message };
    }
  }

  console.log(`🔔 Notifications for tour #${tour.id} (${tour.estatus}):`, JSON.stringify(results));
  return results;
}

async function onTourApproved(tour) {
  const results = {};
  const cc = getConfig('email_cc_default', process.env.NOTIFY_EMAIL_CC);
  const adminEmails = getAdminEmails();
  const waNumber = getConfig('whatsapp_notify', process.env.WHATSAPP_NOTIFY_NUMBER);
  const tgChatId = getConfig('telegram_chat_id', process.env.TELEGRAM_CHAT_ID);
  const emailEnabled = isEnabled('email') || process.env.SMTP_PASS;
  
  if (emailEnabled) {
    // Client: "Reserva Confirmada" — first time they hear about it
    try {
      results.email_client = await email.sendConfirmacion(tour, cc || undefined);
    } catch (err) {
      console.error('🔔 Notification error (email/approve-client):', err.message);
      results.email_client = { success: false, error: err.message };
    }

    // Partner: "Tour aprobado"
    if (tour.vendedor) {
      try {
        const partnerEmail = getPartnerEmail(tour.vendedor);
        if (partnerEmail) {
          results.email_partner = await email.sendPartnerAprobado(tour, partnerEmail);
        }
      } catch (err) {
        console.error('🔔 Notification error (email/partner-approve):', err.message);
      }
    }
  }

  // WhatsApp to team/owner
  if (waNumber) {
    try {
      results.whatsapp = await whatsapp.sendWhatsApp(waNumber, whatsapp.formatApprovedTour(tour));
    } catch (err) {
      console.error('🔔 Notification error (whatsapp/approve):', err.message);
      results.whatsapp = { success: false, error: err.message };
    }
  }

  // Telegram to group/agent
  if (tgChatId) {
    try {
      results.telegram = await telegram.sendTelegram(tgChatId, telegram.formatApprovedTour(tour));
    } catch (err) {
      console.error('🔔 Notification error (telegram/approve):', err.message);
      results.telegram = { success: false, error: err.message };
    }
  }

  console.log(`🔔 Notifications for approved tour #${tour.id}:`, JSON.stringify(results));
  return results;
}

async function onTourRejected(tour, motivo) {
  const results = {};
  const tgChatId = getConfig('telegram_chat_id', process.env.TELEGRAM_CHAT_ID);
  const emailEnabled = isEnabled('email') || process.env.SMTP_PASS;

  // Partner only — client was never notified, so no need to email them
  if (emailEnabled && tour.vendedor) {
    try {
      const partnerEmail = getPartnerEmail(tour.vendedor);
      if (partnerEmail) {
        results.email_partner = await email.sendPartnerRechazado(tour, partnerEmail, motivo);
      }
    } catch (err) {
      console.error('🔔 Notification error (email/partner-reject):', err.message);
    }
  }

  // Telegram
  if (tgChatId) {
    try {
      const msg = `🚫 *Tour Rechazado*\n🏄 ${tour.actividad || ''}\n👤 ${tour.cliente || ''}\n🏢 ${tour.vendedor || ''}${motivo ? `\n📝 Motivo: ${motivo}` : ''}`;
      results.telegram = await telegram.sendTelegram(tgChatId, msg);
    } catch (err) {
      results.telegram = { success: false, error: err.message };
    }
  }

  console.log(`🔔 Notifications for rejected tour #${tour.id}:`, JSON.stringify(results));
  return results;
}

async function onTourStatusChanged(tour, oldStatus, newStatus) {
  const results = {};
  const waNumber = getConfig('whatsapp_notify', process.env.WHATSAPP_NOTIFY_NUMBER);
  const tgChatId = getConfig('telegram_chat_id', process.env.TELEGRAM_CHAT_ID);
  const emailEnabled = isEnabled('email') || process.env.SMTP_PASS;
  
  // ── Email to CLIENT only on meaningful status changes ──
  // Skip 'Aprobado' here — already handled by onTourApproved to avoid duplicates
  // 'Reservado' = booking confirmed, 'Pagado' = payment received, 'Cerrado' = tour completed
  if (emailEnabled && ['Pagado', 'Reservado', 'Cerrado'].includes(newStatus) && tour.email) {
    try {
      const statusEmoji = { 'Pagado': '💰', 'Reservado': '📋', 'Cerrado': '✅' };
      const statusMsg = { 'Pagado': 'Pago Recibido', 'Reservado': 'Reserva Confirmada', 'Cerrado': 'Tour Completado' };
      results.email_client = await email.sendEmail(
        tour.email,
        `${statusEmoji[newStatus] || '🔄'} ${statusMsg[newStatus] || newStatus} — ${tour.actividad_nombre || tour.actividad || 'Tour'} | Mahana Tours`,
        email.confirmacionTemplate(tour)
      );
    } catch (err) {
      results.email_client = { success: false, error: err.message };
    }
  }

  // ── Email to ADMIN TEAM on any status change (internal tracking) ──
  const adminEmails = getAdminEmails();
  if (adminEmails && emailEnabled) {
    try {
      const statusEmoji = { 'Pagado': '💰', 'Aprobado': '✅', 'Reservado': '📋', 'Cancelado': '❌', 'Rechazado': '🚫', 'Cerrado': '🏁' };
      await email.sendEmail(
        adminEmails,
        `${statusEmoji[newStatus] || '🔄'} Tour ${oldStatus} → ${newStatus}: ${tour.cliente || ''} — ${tour.actividad || ''}`,
        email.confirmacionTemplate(tour)
      );
    } catch (err) {
      console.error('🔔 Admin team email failed:', err.message);
    }
  }

  // WhatsApp status change to team
  if (waNumber) {
    try {
      const msg = `🔄 *Tour #${tour.id} — ${oldStatus} → ${newStatus}*\n${tour.actividad || ''} — ${tour.cliente || ''}`;
      results.whatsapp = await whatsapp.sendWhatsApp(waNumber, msg);
    } catch (err) {
      results.whatsapp = { success: false, error: err.message };
    }
  }

  // Telegram status change
  if (tgChatId) {
    try {
      results.telegram = await telegram.sendTelegram(tgChatId, telegram.formatStatusChange(tour, oldStatus, newStatus));
    } catch (err) {
      results.telegram = { success: false, error: err.message };
    }
  }

  return results;
}
// ── Estadía Events ──

async function onEstadiaCreated(estadia) {
  const results = {};
  const cc = getConfig('email_cc_default', process.env.NOTIFY_EMAIL_CC);
  const waNumber = getConfig('whatsapp_notify', process.env.WHATSAPP_NOTIFY_NUMBER);
  const tgChatId = getConfig('telegram_chat_id', process.env.TELEGRAM_CHAT_ID);

  // Email to client
  if (isEnabled('email') || process.env.SMTP_PASS) {
    try {
      results.email = await email.sendEstadiaConfirmacion(estadia, cc || undefined);
    } catch (err) {
      results.email = { success: false, error: err.message };
    }
  }

  // WhatsApp to team
  if (waNumber) {
    try {
      results.whatsapp = await whatsapp.sendWhatsApp(waNumber, whatsapp.formatNewEstadia(estadia));
    } catch (err) {
      results.whatsapp = { success: false, error: err.message };
    }
  }

  // Telegram
  if (tgChatId) {
    try {
      results.telegram = await telegram.sendTelegram(tgChatId, telegram.formatNewEstadia(estadia));
    } catch (err) {
      results.telegram = { success: false, error: err.message };
    }
  }

  console.log(`🔔 Notifications for estadía #${estadia.id}:`, JSON.stringify(results));
  return results;
}

async function onEstadiaStatusChanged(estadia, oldStatus, newStatus) {
  const results = {};
  const waNumber = getConfig('whatsapp_notify', process.env.WHATSAPP_NOTIFY_NUMBER);
  const tgChatId = getConfig('telegram_chat_id', process.env.TELEGRAM_CHAT_ID);

  // Email on Confirmada or Pagada
  if (['Confirmada', 'Pagada'].includes(newStatus) && estadia.email) {
    try {
      results.email = await email.sendEstadiaStatusChange(estadia, newStatus);
    } catch (err) {
      results.email = { success: false, error: err.message };
    }
  }

  // WhatsApp to team
  if (waNumber) {
    try {
      results.whatsapp = await whatsapp.sendWhatsApp(waNumber, whatsapp.formatEstadiaStatus(estadia, oldStatus, newStatus));
    } catch (err) {
      results.whatsapp = { success: false, error: err.message };
    }
  }

  // Telegram
  if (tgChatId) {
    try {
      results.telegram = await telegram.sendTelegram(tgChatId, telegram.formatEstadiaStatus(estadia, oldStatus, newStatus));
    } catch (err) {
      results.telegram = { success: false, error: err.message };
    }
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

// ── Booking Events (Public) ──

async function onBookingCreated(booking) {
  const results = {};
  const tgChatId = getConfig('telegram_chat_id', process.env.TELEGRAM_CHAT_ID);
  
  // Email confirmation to client
  if (booking.email && (isEnabled('email') || process.env.SMTP_PASS)) {
    try {
      const cc = getConfig('email_cc_default', process.env.NOTIFY_EMAIL_CC);
      results.email = await email.sendConfirmacion({
        cliente: booking.nombre,
        actividad: booking.producto,
        fecha: booking.fecha,
        hora: booking.hora,
        pax: booking.personas,
        precio_ingreso: booking.precio_total,
        email: booking.email,
        punto_encuentro: 'Se confirmará',
      }, cc || undefined);
    } catch (err) {
      console.error('🔔 Notification error (email/booking):', err.message);
      results.email = { success: false, error: err.message };
    }
  }

  if (tgChatId) {
    try {
      results.telegram = await telegram.sendTelegram(tgChatId, telegram.formatNewBooking(booking));
    } catch (err) {
      console.error('🔔 Notification error (telegram/booking):', err.message);
      results.telegram = { success: false, error: err.message };
    }
  }
  
  console.log(`🔔 Booking notification #${booking.codigo}:`, JSON.stringify(results));
  return results;
}

async function onBookingPaid(booking) {
  const results = {};
  const tgChatId = getConfig('telegram_chat_id', process.env.TELEGRAM_CHAT_ID);
  
  if (tgChatId) {
    try {
      results.telegram = await telegram.sendTelegram(tgChatId, telegram.formatBookingPaid(booking));
    } catch (err) {
      console.error('🔔 Notification error (telegram/booking-paid):', err.message);
      results.telegram = { success: false, error: err.message };
    }
  }
  
  console.log(`🔔 Booking paid #${booking.codigo}:`, JSON.stringify(results));
  return results;
}

// ── Ticket Events (Quality System) ──

async function onTicketCreated(ticket) {
  const results = {};
  const tgChatId = getConfig('telegram_chat_id', process.env.TELEGRAM_CHAT_ID);

  if (tgChatId) {
    try {
      const prioEmoji = { critica: '🔴', alta: '🟠', media: '🟡', baja: '⚪' };
      const emoji = prioEmoji[ticket.prioridad] || '🟡';
      let msg = `🎫 *Nuevo Ticket ${ticket.codigo}*\n`;
      msg += `${emoji} Prioridad: ${ticket.prioridad}\n`;
      msg += `📋 ${ticket.tipo}: ${ticket.categoria || 'Sin categoría'}\n`;
      msg += `👤 Cliente: ${ticket.cliente}\n`;
      if (ticket.actividad) msg += `🏄 Tour: ${ticket.actividad}\n`;
      if (ticket.vendedor) msg += `🏢 Vendedor: ${ticket.vendedor}\n`;
      msg += `📝 ${ticket.descripcion?.substring(0, 200)}`;
      if (ticket.recurrence?.isRecurrent) {
        msg += `\n\n⚠️ *RECURRENCIA DETECTADA*: ${ticket.recurrence.count + 1} tickets de "${ticket.categoria}" para "${ticket.actividad}"`;
      }
      results.telegram = await telegram.sendTelegram(tgChatId, msg);
    } catch (err) {
      console.error('🔔 Notification error (telegram/ticket):', err.message);
      results.telegram = { success: false, error: err.message };
    }
  }

  console.log(`🔔 Ticket ${ticket.codigo} notification:`, JSON.stringify(results));
  return results;
}

async function onTicketResolved(ticket) {
  const results = {};
  const tgChatId = getConfig('telegram_chat_id', process.env.TELEGRAM_CHAT_ID);

  if (tgChatId) {
    try {
      let msg = `✅ *Ticket ${ticket.codigo} Resuelto*\n`;
      msg += `👤 ${ticket.cliente}\n`;
      if (ticket.actividad) msg += `🏄 ${ticket.actividad}\n`;
      if (ticket.respuesta) msg += `💬 ${ticket.respuesta.substring(0, 200)}\n`;
      if (ticket.accion_correctiva) msg += `🔧 Acción: ${ticket.accion_correctiva.substring(0, 200)}`;
      results.telegram = await telegram.sendTelegram(tgChatId, msg);
    } catch (err) {
      results.telegram = { success: false, error: err.message };
    }
  }

  return results;
}

async function onReviewSubmitted(review) {
  const results = {};
  const tgChatId = getConfig('telegram_chat_id', process.env.TELEGRAM_CHAT_ID);

  if (tgChatId) {
    try {
      const stars = '⭐'.repeat(review.score_general) + '☆'.repeat(5 - review.score_general);
      let msg = `📝 *Nueva Reseña*\n`;
      msg += `${stars} (${review.score_general}/5)\n`;
      if (review.tour_actividad) msg += `🏄 ${review.tour_actividad}\n`;
      if (review.tour_cliente) msg += `👤 ${review.tour_cliente}\n`;
      if (review.comentario) msg += `💬 "${review.comentario.substring(0, 200)}"`;
      if (review.score_general <= 3) {
        msg += `\n\n🔴 Score bajo — ticket auto-creado`;
      } else if (review.redirigido_google) {
        msg += `\n\n🟢 Se invitó a dejar reseña en Google`;
      }
      results.telegram = await telegram.sendTelegram(tgChatId, msg);
    } catch (err) {
      results.telegram = { success: false, error: err.message };
    }
  }

  return results;
}

// ── CxC / Facturación Events ──

async function onCxCStatusChanged(tour, oldStatus, newStatus) {
  const results = {};
  const emailEnabled = isEnabled('email') || process.env.SMTP_PASS;
  const contabilidadEmail = process.env.NOTIFY_EMAIL_CONTABILIDAD || getConfig('email_cc_default', process.env.NOTIFY_EMAIL_CC);
  const tgChatId = getConfig('telegram_chat_id', process.env.TELEGRAM_CHAT_ID);

  // Find partner email
  const partnerEmail = getPartnerEmail(tour.vendedor);

  if (emailEnabled) {
    // Send to partner
    if (partnerEmail) {
      try {
        if (newStatus === 'Pendiente') {
          results.email_partner = await email.sendFacturaNotification(tour, partnerEmail, 'emitida');
        } else if (newStatus === 'Enviada') {
          // If factura PDF exists, send with attachment
          if (tour.cxc_factura_url) {
            results.email_partner = await email.sendFacturaConAdjunto(tour, partnerEmail);
          } else {
            results.email_partner = await email.sendFacturaNotification(tour, partnerEmail, 'enviada');
          }
        } else if (newStatus === 'Pagada') {
          results.email_partner = await email.sendFacturaNotification(tour, partnerEmail, 'pagada');
        }
      } catch (err) {
        console.error('🔔 CxC email to partner failed:', err.message);
      }
    }

    // Send to contabilidad on payment
    if (contabilidadEmail && newStatus === 'Pagada') {
      try {
        results.email_contabilidad = await email.sendFacturaNotification(tour, contabilidadEmail, 'pagada');
      } catch (err) {
        console.error('🔔 CxC email to contabilidad failed:', err.message);
      }
    }
  }

  // Telegram on relevant changes
  if (tgChatId && ['Enviada', 'Pagada'].includes(newStatus)) {
    try {
      const emoji = { 'Enviada': '📄', 'Pagada': '💰' };
      const msg = `${emoji[newStatus] || '🔄'} *CxC ${oldStatus} → ${newStatus}*\n🏢 ${tour.vendedor || ''}\n🏄 ${tour.actividad || ''}\n👤 ${tour.cliente || ''}\n💵 $${tour.cxc_total || 0}`;
      results.telegram = await telegram.sendTelegram(tgChatId, msg);
    } catch (err) {
      results.telegram = { success: false, error: err.message };
    }
  }

  console.log(`🔔 CxC ${tour.id} ${oldStatus} → ${newStatus}:`, JSON.stringify(results));
  return results;
}

module.exports = {
  initialize,
  onTourCreated,
  onTourApproved,
  onTourRejected,
  onTourStatusChanged,
  onEstadiaCreated,
  onEstadiaStatusChanged,
  onBookingCreated,
  onBookingPaid,
  onTicketCreated,
  onTicketResolved,
  onReviewSubmitted,
  onCxCStatusChanged,
  sendDailyReminders,
  sendDailySummary,
  verifyAll,
};

