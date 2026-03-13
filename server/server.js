const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3100;

// CORS Configuration - Only allow specific origins
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:3100'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());

// Simple rate limiting (in-memory for now)
const requestCounts = {};
const RATE_LIMIT = 100; // requests per minute
const RATE_WINDOW = 60 * 1000; // 1 minute

app.use('/api/', (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  if (!requestCounts[ip]) {
    requestCounts[ip] = { count: 1, startTime: now };
  } else {
    if (now - requestCounts[ip].startTime > RATE_WINDOW) {
      requestCounts[ip] = { count: 1, startTime: now };
    } else {
      requestCounts[ip].count++;
      if (requestCounts[ip].count > RATE_LIMIT) {
        return res.status(429).json({ error: 'Too many requests, please try again later' });
      }
    }
  }
  next();
});

// Data paths
const DATA_DIR = path.join(__dirname, '../data');

// Helper to read JSON
const readJSON = (file) => {
  try {
    const data = fs.readFileSync(path.join(DATA_DIR, file), 'utf8');
    return JSON.parse(data);
  } catch (e) {
    console.error(`Error reading ${file}:`, e.message);
    return [];
  }
};

// Helper to write JSON
const writeJSON = (file, data) => {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
};

// Routes
app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', message: 'Mahana Portal API v1.0 (Local)', timestamp: new Date().toISOString() });
});

app.get('/api/tours', (req, res) => {
  const tours = readJSON('tours.json');
  res.json({ total: tours.length, data: tours });
});

app.get('/api/ventas-caracol', (req, res) => {
  const data = readJSON('ventas-caracol.json');
  res.json({ total: data.length, data: data });
});

app.get('/api/crm', (req, res) => {
  const data = readJSON('crm.json');
  res.json({ total: data.length, data: data });
});

// Allowed fields for CRM submission (whitelist)
const CRM_ALLOWED_FIELDS = [
  'Cliente', 'WhatsApp', 'Email', 'Propiedad', 'Tipo',
  'Check-in', 'Check-out', 'Huéspedes', 'Habitaciones',
  'Precio Cotizado', 'Responsable', 'Notas'
];

// Sanitize string input
const sanitizeString = (str) => {
  if (typeof str !== 'string') return '';
  return str.slice(0, 1000).replace(/<[^>]*>/g, ''); // Remove HTML tags, limit length
};

app.post('/api/crm', (req, res) => {
  const crm = readJSON('crm.json');
  const newId = 'R' + String(crm.length + 1).padStart(3, '0');
  
  // Build sanitized object from allowed fields only
  const newItem = {
    ID: newId,
    'Fecha Solicitud': new Date().toISOString().split('T')[0],
    Estado: '📥 Solicitada'
  };
  
  // Only copy allowed fields, sanitized
  CRM_ALLOWED_FIELDS.forEach(field => {
    if (req.body[field] !== undefined && req.body[field] !== null) {
      newItem[field] = sanitizeString(String(req.body[field]));
    }
  });
  
  // Validate required fields
  if (!newItem.Cliente && !newItem['Cliente']) {
    return res.status(400).json({ error: 'Cliente es requerido' });
  }
  
  crm.push(newItem);
  writeJSON('crm.json', crm);
  res.json({ success: true, id: newId, data: newItem });
});

app.get('/api/actividades', (req, res) => {
  const data = readJSON('actividades.json');
  res.json({ total: data.length, data: data });
});

app.get('/api/usuarios', (req, res) => {
  const data = readJSON('usuarios.json');
  res.json({ total: data.length, data: data });
});

app.get('/api/dashboard', (req, res) => {
  const tours = readJSON('tours.json');
  const ventas = readJSON('ventas-caracol.json');
  const crm = readJSON('crm.json');

  const calcSum = (arr, field) => arr.reduce((sum, r) => sum + (parseFloat(r[field]) || 0), 0);

  res.json({
    toursMahana: {
      total: tours.length,
      ingresos: calcSum(tours, 'Precio (Ingreso)'),
      ganancia: calcSum(tours, 'Ganancia Mahana')
    },
    ventasCaracol: {
      total: ventas.length,
      ingresos: calcSum(ventas, 'Precio (Ingreso)'),
      comision: calcSum(ventas, 'Monto Comisión')
    },
    crm: {
      total: crm.length,
      pendientes: crm.filter(r => r.Estado && r.Estado.includes('Solicitada')).length,
      confirmadas: crm.filter(r => r.Estado && r.Estado.includes('Confirmada')).length
    }
  });
});

app.get('/api/all', (req, res) => {
  res.json({
    tours: readJSON('tours.json'),
    ventasCaracol: readJSON('ventas-caracol.json'),
    crm: readJSON('crm.json'),
    actividades: readJSON('actividades.json'),
    usuarios: readJSON('usuarios.json'),
    dashboard: {
      toursMahana: {
        total: readJSON('tours.json').length,
        ingresos: readJSON('tours.json').reduce((s, r) => s + (parseFloat(r['Precio (Ingreso)']) || 0), 0),
        ganancia: readJSON('tours.json').reduce((s, r) => s + (parseFloat(r['Ganancia Mahana']) || 0), 0)
      },
      ventasCaracol: {
        total: readJSON('ventas-caracol.json').length
      },
      crm: { total: readJSON('crm.json').length }
    }
  });
});

// Serve frontend (production or if dist exists)
const distPath = path.join(__dirname, '../dist');
const distExists = fs.existsSync(distPath);

if (process.env.NODE_ENV === 'production' || distExists) {
  console.log(`📁 Serving frontend from: ${distPath}`);
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).json({ error: 'Frontend not found. Make sure to run npm run build first.' });
    }
  });
}

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Something went wrong' 
      : err.message
  });
});

// Handle 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Mahana Portal running on port ${PORT}`);
  console.log(`📊 API Endpoints:`);
  console.log(`   GET  /api/status`);
  console.log(`   GET  /api/tours`);
  console.log(`   GET  /api/ventas-caracol`);
  console.log(`   GET  /api/crm`);
  console.log(`   POST /api/crm`);
  console.log(`   GET  /api/actividades`);
  console.log(`   GET  /api/usuarios`);
  console.log(`   GET  /api/dashboard`);
  console.log(`   GET  /api/all`);
});