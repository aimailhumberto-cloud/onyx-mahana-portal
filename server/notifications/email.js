/**
 * Email Notification Module — Mahana Tours
 * Uses Nodemailer with SMTP (ventas@toursmahana.com)
 */
const nodemailer = require('nodemailer');

// SMTP config from env vars
const SMTP_HOST = process.env.SMTP_HOST || 'mail.toursmahana.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465');
const SMTP_USER = process.env.SMTP_USER || 'ventas@toursmahana.com';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || '"Mahana Tours" <ventas@toursmahana.com>';

let transporter = null;

function getTransporter() {
  if (!transporter && SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465, // true for 465, false for 587
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
      tls: {
        rejectUnauthorized: false, // Accept self-signed certs (common in cPanel)
      },
    });
    console.log(`📧 Email configured: ${SMTP_USER} via ${SMTP_HOST}:${SMTP_PORT}`);
  }
  return transporter;
}

// ── HTML Templates ──

function baseTemplate(content, title = 'Mahana Tours') {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f0f4f8; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #0a2e3c 0%, #0d4a5a 100%); padding: 24px 32px; text-align: center; }
    .header h1 { color: #4ecca3; margin: 0; font-size: 24px; }
    .header p { color: rgba(255,255,255,0.7); margin: 4px 0 0; font-size: 13px; }
    .body { padding: 32px; }
    .detail-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f0f4f8; }
    .detail-label { color: #6b7280; font-size: 13px; }
    .detail-value { color: #1a2a3a; font-weight: 600; font-size: 14px; }
    .highlight-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 16px 0; text-align: center; }
    .highlight-box .amount { font-size: 28px; font-weight: 700; color: #16a34a; }
    .highlight-box .label { font-size: 12px; color: #6b7280; margin-top: 4px; }
    .cta-button { display: inline-block; background: #4ecca3; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; margin: 16px 0; }
    .footer { background: #f8fafc; padding: 20px 32px; text-align: center; border-top: 1px solid #e5e7eb; }
    .footer p { color: #9ca3af; font-size: 11px; margin: 4px 0; }
    .emoji { font-size: 18px; }
  </style>
</head>
<body>
  <div style="padding: 20px;">
    <div class="container">
      ${content}
    </div>
  </div>
</body>
</html>`;
}

function confirmacionTemplate(tour) {
  const fecha = tour.fecha || 'Por confirmar';
  const hora = tour.hora || '';
  const actividad = tour.actividad_nombre || tour.actividad || 'Tour';
  const cliente = tour.cliente || '';
  const personas = tour.personas || tour.pax || 1;
  const precio = tour.precio_ingreso || 0;
  const punto = tour.punto_encuentro || 'Se confirmará';

  return baseTemplate(`
    <div class="header">
      <h1>🌊 Mahana Tours</h1>
      <p>Panamá — Aventura & Naturaleza</p>
    </div>
    <div class="body">
      <h2 style="color: #0a2e3c; margin-top: 0;">¡Reserva Confirmada! ✅</h2>
      <p style="color: #6b7280;">Hola <strong>${cliente}</strong>, tu reserva ha sido confirmada. Aquí tienes los detalles:</p>
      
      <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <div class="detail-row">
          <span class="detail-label">🏄 Actividad</span>
          <span class="detail-value">${actividad}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">📅 Fecha</span>
          <span class="detail-value">${fecha}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">⏰ Hora</span>
          <span class="detail-value">${hora}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">👥 Personas</span>
          <span class="detail-value">${personas}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">📍 Punto de encuentro</span>
          <span class="detail-value">${punto}</span>
        </div>
      </div>

      <div class="highlight-box">
        <div class="amount">$${precio}</div>
        <div class="label">Total a pagar</div>
      </div>

      <p style="color: #6b7280; font-size: 13px;">
        Si tienes alguna pregunta, no dudes en contactarnos por WhatsApp al <strong>+507 6290-6800</strong>.
      </p>
    </div>
    <div class="footer">
      <p>Mahana Tours — Panamá 🇵🇦</p>
      <p>Este es un correo automático, por favor no responder directamente.</p>
    </div>
  `, 'Reserva Confirmada — Mahana Tours');
}

function recordatorioTemplate(tour) {
  const hora = tour.hora || '';
  const actividad = tour.actividad_nombre || tour.actividad || 'Tour';
  const cliente = tour.cliente || '';
  const punto = tour.punto_encuentro || 'Se confirmará';

  return baseTemplate(`
    <div class="header">
      <h1>🌊 Mahana Tours</h1>
      <p>Panamá — Aventura & Naturaleza</p>
    </div>
    <div class="body">
      <h2 style="color: #0a2e3c; margin-top: 0;">¡Mañana es tu aventura! 🎉</h2>
      <p style="color: #6b7280;">Hola <strong>${cliente}</strong>, te recordamos que mañana tienes una actividad con nosotros:</p>
      
      <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
        <div style="font-size: 20px; font-weight: 700; color: #1e40af;">${actividad}</div>
        <div style="font-size: 16px; color: #3b82f6; margin-top: 8px;">⏰ ${hora}</div>
        <div style="font-size: 13px; color: #6b7280; margin-top: 8px;">📍 ${punto}</div>
      </div>

      <h3 style="color: #0a2e3c; font-size: 14px;">📋 Recomendaciones:</h3>
      <ul style="color: #6b7280; font-size: 13px; line-height: 1.8;">
        <li>Llega 15 minutos antes de la hora indicada</li>
        <li>Usa ropa y calzado cómodo</li>
        <li>Lleva protector solar y agua</li>
        <li>No olvides tu cámara 📸</li>
      </ul>

      <p style="color: #6b7280; font-size: 13px;">
        📱 WhatsApp: <strong>+507 6290-6800</strong>
      </p>
    </div>
    <div class="footer">
      <p>Mahana Tours — Panamá 🇵🇦</p>
      <p>Este es un correo automático, por favor no responder directamente.</p>
    </div>
  `, 'Recordatorio — Mahana Tours');
}

function resumenDiarioTemplate(data) {
  const { fecha, tours, totalIngresos, totalTours } = data;
  
  const tourRows = tours.map(t => `
    <tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #f0f4f8; font-size: 13px;">${t.hora || '—'}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #f0f4f8; font-size: 13px; font-weight: 600;">${t.actividad_nombre || t.actividad || ''}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #f0f4f8; font-size: 13px;">${t.cliente || ''}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #f0f4f8; font-size: 13px;">${t.responsable || '—'}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #f0f4f8; font-size: 13px; text-align: right; font-weight: 600;">$${t.precio_ingreso || 0}</td>
    </tr>
  `).join('');

  return baseTemplate(`
    <div class="header">
      <h1>🌊 Mahana Tours</h1>
      <p>Resumen del Día — ${fecha}</p>
    </div>
    <div class="body">
      <h2 style="color: #0a2e3c; margin-top: 0;">📊 Tours de Hoy</h2>
      
      <div style="display: flex; gap: 12px; margin: 16px 0;">
        <div style="flex: 1; background: #f0fdf4; border-radius: 8px; padding: 16px; text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: #16a34a;">${totalTours}</div>
          <div style="font-size: 11px; color: #6b7280;">Tours</div>
        </div>
        <div style="flex: 1; background: #eff6ff; border-radius: 8px; padding: 16px; text-align: center;">
          <div style="font-size: 24px; font-weight: 700; color: #2563eb;">$${totalIngresos}</div>
          <div style="font-size: 11px; color: #6b7280;">Ingresos</div>
        </div>
      </div>

      ${tours.length > 0 ? `
        <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
          <thead>
            <tr style="background: #f8fafc;">
              <th style="padding: 8px 12px; text-align: left; font-size: 11px; color: #6b7280; font-weight: 600;">Hora</th>
              <th style="padding: 8px 12px; text-align: left; font-size: 11px; color: #6b7280; font-weight: 600;">Actividad</th>
              <th style="padding: 8px 12px; text-align: left; font-size: 11px; color: #6b7280; font-weight: 600;">Cliente</th>
              <th style="padding: 8px 12px; text-align: left; font-size: 11px; color: #6b7280; font-weight: 600;">Responsable</th>
              <th style="padding: 8px 12px; text-align: right; font-size: 11px; color: #6b7280; font-weight: 600;">Ingreso</th>
            </tr>
          </thead>
          <tbody>${tourRows}</tbody>
        </table>
      ` : '<p style="color: #9ca3af; text-align: center; padding: 20px;">No hay tours programados para hoy</p>'}
    </div>
    <div class="footer">
      <p>Mahana Tours — Resumen Automático</p>
    </div>
  `, 'Resumen Diario — Mahana Tours');
}

// ── Send Functions ──

async function sendEmail(to, subject, html, cc = null) {
  const t = getTransporter();
  if (!t) {
    console.warn('📧 Email not configured (missing SMTP_PASS). Skipping email to', to);
    return { success: false, reason: 'not_configured' };
  }

  try {
    const mailOptions = {
      from: SMTP_FROM,
      to,
      subject,
      html,
    };
    if (cc) mailOptions.cc = cc;

    const info = await t.sendMail(mailOptions);
    console.log(`📧 Email sent to ${to}${cc ? ` (CC: ${cc})` : ''}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`📧 Email failed to ${to}:`, err.message);
    return { success: false, error: err.message };
  }
}

async function sendConfirmacion(tour, cc = null) {
  const clientEmail = tour.email || tour.email_cliente;
  if (!clientEmail && !cc) {
    console.warn('📧 No email for tour', tour.id, '- skipping confirmation');
    return { success: false, reason: 'no_email' };
  }
  const to = clientEmail || cc; // If no client email, send to CC directly
  const subject = `✅ Reserva Confirmada — ${tour.actividad_nombre || tour.actividad || 'Tour'} | Mahana Tours`;
  return sendEmail(to, subject, confirmacionTemplate(tour), clientEmail ? cc : null);
}

async function sendRecordatorio(tour) {
  const email = tour.email;
  if (!email) return { success: false, reason: 'no_email' };
  const subject = `🔔 Recordatorio: ${tour.actividad_nombre || tour.actividad || 'Tour'} mañana | Mahana Tours`;
  return sendEmail(email, subject, recordatorioTemplate(tour));
}

async function sendResumenDiario(toEmail, data) {
  const subject = `📊 Resumen del Día — ${data.fecha} | Mahana Tours`;
  return sendEmail(toEmail, subject, resumenDiarioTemplate(data));
}

// ── Estadía Templates ──

function estadiaConfirmacionTemplate(estadia) {
  const cliente = estadia.cliente || '';
  const propiedad = estadia.propiedad || 'Propiedad';
  const checkIn = estadia.check_in || 'Por confirmar';
  const checkOut = estadia.check_out || '';
  const huespedes = estadia.huespedes || '—';
  const precio = estadia.precio_final || 0;

  return baseTemplate(`
    <div class="header" style="background: linear-gradient(135deg, #4a1d8e 0%, #7c3aed 100%);">
      <h1>🏨 Mahana Stays</h1>
      <p>Hospedaje en Panamá</p>
    </div>
    <div class="body">
      <h2 style="color: #4a1d8e; margin-top: 0;">¡Estadía Confirmada! ✅</h2>
      <p style="color: #6b7280;">Hola <strong>${cliente}</strong>, tu estadía ha sido confirmada:</p>
      
      <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <div class="detail-row">
          <span class="detail-label">🏠 Propiedad</span>
          <span class="detail-value">${propiedad}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">📅 Check-in</span>
          <span class="detail-value">${checkIn}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">📅 Check-out</span>
          <span class="detail-value">${checkOut}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">👥 Huéspedes</span>
          <span class="detail-value">${huespedes}</span>
        </div>
      </div>

      ${precio > 0 ? `<div class="highlight-box">
        <div class="amount">$${precio}</div>
        <div class="label">Total</div>
      </div>` : ''}

      <p style="color: #6b7280; font-size: 13px;">
        ¿Preguntas? WhatsApp: <strong>+507 6290-6800</strong>
      </p>
    </div>
    <div class="footer">
      <p>Mahana Tours & Stays — Panamá 🇵🇦</p>
    </div>
  `, 'Estadía Confirmada — Mahana');
}

async function sendEstadiaConfirmacion(estadia, cc = null) {
  const clientEmail = estadia.email;
  if (!clientEmail && !cc) return { success: false, reason: 'no_email' };
  const to = clientEmail || cc;
  const subject = `✅ Estadía Confirmada — ${estadia.propiedad || 'Hospedaje'} | Mahana`;
  return sendEmail(to, subject, estadiaConfirmacionTemplate(estadia), clientEmail ? cc : null);
}

async function sendEstadiaStatusChange(estadia, newStatus) {
  const email = estadia.email;
  if (!email) return { success: false, reason: 'no_email' };
  const statusEmoji = { 'Cotizada': '💬', 'Confirmada': '✅', 'Pagada': '💰', 'Perdida': '❌' };
  const emoji = statusEmoji[newStatus] || '🔄';
  const subject = `${emoji} ${newStatus} — ${estadia.propiedad || 'Estadía'} | Mahana`;
  return sendEmail(email, subject, estadiaConfirmacionTemplate({ ...estadia, estado: newStatus }));
}

// ── Verify SMTP connection ──

async function verifyConnection() {
  const t = getTransporter();
  if (!t) return { success: false, reason: 'not_configured' };
  try {
    await t.verify();
    console.log('📧 SMTP connection verified ✅');
    return { success: true };
  } catch (err) {
    console.error('📧 SMTP verification failed:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  sendEmail,
  sendConfirmacion,
  sendRecordatorio,
  sendResumenDiario,
  sendEstadiaConfirmacion,
  sendEstadiaStatusChange,
  verifyConnection,
  confirmacionTemplate,
  recordatorioTemplate,
  resumenDiarioTemplate,
  estadiaConfirmacionTemplate,
};
