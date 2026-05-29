require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

const { getDb } = require('./db/database');
const { rateLimiter } = require('./middleware/rateLimit');
const { uploadsDir } = require('./middleware/upload');
const notifications = require('./notifications');

const app = express();
const PORT = process.env.PORT || 3101;

// Trust proxy for secure cookies/headers behind Nginx/Render
app.enable('trust proxy');

// Middlewares
app.use(helmet({
  contentSecurityPolicy: false, // allow external resources if needed by frontend
  crossOriginEmbedderPolicy: false,
}));
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
app.use(cors({
  origin: ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : false,
  credentials: ALLOWED_ORIGINS.length > 0
}));
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Global Rate Limiter
app.use(rateLimiter);

// Static assets
app.use('/uploads', express.static(uploadsDir));

// Route modules
const publicRouter = require('./routes/public');
const toursRouter = require('./routes/tours');
const estadiasRouter = require('./routes/estadias');
const cxcRouter = require('./routes/cxc');
const whatsappRouter = require('./routes/whatsapp');
const feedbackRouter = require('./routes/feedback');

// Mount routes
app.use(publicRouter);
app.use(toursRouter);
app.use(estadiasRouter);
app.use(cxcRouter);
app.use(whatsappRouter);
app.use(feedbackRouter);

// Frontend assets & SPA fallback
const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath) && fs.existsSync(path.join(distPath, 'index.html'))) {
  console.log('✅ Frontend found at:', distPath);
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    // Don't catch API routes or uploaded files
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Endpoint not found' } });
    }
    if (req.path.startsWith('/uploads/')) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'File not found' } });
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  console.log('⚠️ Frontend not found. API-only mode.');
  app.get('*', (req, res) => {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Endpoint not found' } });
  });
}

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Internal server error' } });
});

// Start
app.listen(PORT, async () => {
  console.log(`🚀 Mahana Portal v2 running on port ${PORT}`);
  console.log(`📡 API: http://localhost:${PORT}/api/v1/api-status`);

  // Seed users only if table is empty — passwords read from env vars
  try {
    const db = getDb();
    const count = db.prepare('SELECT COUNT(*) as c FROM usuarios').get();
    if (count.c === 0) {
      const bcrypt = require('bcryptjs');
      const adminPass = process.env.SEED_ADMIN_PASSWORD || 'change-me-immediately';
      const partnerPass = process.env.SEED_PARTNER_PASSWORD || 'change-me-immediately';
      if (process.env.NODE_ENV === 'production' && (!process.env.SEED_ADMIN_PASSWORD || !process.env.SEED_PARTNER_PASSWORD)) {
        console.warn('⚠️  WARNING: Using default seed passwords. Set SEED_ADMIN_PASSWORD and SEED_PARTNER_PASSWORD env vars.');
      }
      const h1 = bcrypt.hashSync(adminPass, 10);
      const h2 = bcrypt.hashSync(partnerPass, 10);
      db.prepare('INSERT INTO usuarios (email, password_hash, nombre, rol, vendedor) VALUES (?, ?, ?, ?, ?)').run('admin@mahana.com', h1, 'Mahana Admin', 'admin', null);
      db.prepare('INSERT INTO usuarios (email, password_hash, nombre, rol, vendedor) VALUES (?, ?, ?, ?, ?)').run('caracol@playacaracol.com', h2, 'Playa Caracol', 'partner', 'Playa Caracol');
      console.log('✅ Users seeded at startup: 2 users');
    } else {
      console.log(`✅ Users table already has ${count.c} users, skipping seed`);
    }
  } catch (err) {
    console.error('❌ FATAL: Failed to seed users:', err);
  }

  // Verify email notification channel
  try {
    const status = await notifications.verifyAll();
    console.log('🔔 Notification channels:', JSON.stringify(status));
  } catch (err) {
    console.error('🔔 Error verifying notifications:', err.message);
  }

  // Initialize WhatsApp (will show QR code if needed)
  try {
    await notifications.initialize();
  } catch (err) {
    console.error('🔔 WhatsApp init error:', err.message);
  }

  // ── Daily Scheduler ──
  // Runs reminders at 6pm and summary at 7am (Panama time UTC-5)
  const NOTIFY_EMAIL_TEAM = process.env.NOTIFY_EMAIL_TEAM || '';
  
  function scheduleDailyJobs() {
    const now = new Date();
    // Panama is UTC-5
    const panamaHour = (now.getUTCHours() - 5 + 24) % 24;
    const panamaMinute = now.getUTCMinutes();
    
    // Check at 7:00am Panama = reminder for tomorrow tours sent at 6pm, summary at 7am
    if (panamaHour === 7 && panamaMinute < 5) {
      console.log('🔔 Running daily summary...');
      if (NOTIFY_EMAIL_TEAM) {
        const db = getDb();
        notifications.sendDailySummary(db, NOTIFY_EMAIL_TEAM).catch(err => {
          console.error('🔔 Daily summary error:', err.message);
        });
      }
    }
    
    if (panamaHour === 18 && panamaMinute < 5) {
      console.log('🔔 Running daily reminders...');
      const db = getDb();
      notifications.sendDailyReminders(db).catch(err => {
        console.error('🔔 Reminders error:', err.message);
      });
    }
  }
  
  // Check every 5 minutes
  setInterval(scheduleDailyJobs, 5 * 60 * 1000);
  console.log('⏰ Daily scheduler active (reminders @ 6pm, summary @ 7am Panama)');
});