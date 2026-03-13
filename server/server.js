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

// Serve frontend - check multiple possible locations
const possibleDistPaths = [
  path.join(__dirname, '../dist'),
  path.join(__dirname, '../../dist'),
  path.join(process.cwd(), 'dist'),
  '/app/dist'
];

let distPath = null;
let distFound = false;

for (const tryPath of possibleDistPaths) {
  if (fs.existsSync(tryPath) && fs.existsSync(path.join(tryPath, 'index.html'))) {
    distPath = tryPath;
    distFound = true;
    console.log(`📁 Frontend found at: ${distPath}`);
    break;
  }
}

// Log all possible paths for debugging
console.log('🔍 Checking frontend paths:');
possibleDistPaths.forEach(p => {
  const exists = fs.existsSync(p);
  const hasIndex = exists && fs.existsSync(path.join(p, 'index.html'));
  console.log(`   ${p} - exists: ${exists}, has index.html: ${hasIndex}`);
});

if (distFound) {
  const assetsPath = path.join(distPath, 'assets');
  console.log(`📁 Serving frontend from: ${distPath}`);
  console.log(`📁 Assets path: ${assetsPath}`);
  console.log(`📁 Assets exist: ${fs.existsSync(assetsPath)}`);
  
  // Serve static files from dist/assets
  app.use('/assets', express.static(assetsPath));
  
  // Serve other static files from dist
  app.use(express.static(distPath));
  
  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (req, res) => {
    // Skip API routes
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    
    const indexPath = path.join(distPath, 'index.html');
    
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send(`
        <html>
          <body>
            <h1>Frontend not found</h1>
            <p>Dist path checked: ${distPath}</p>
            <p>Make sure to run: <code>npm run build</code></p>
          </body>
        </html>
      `);
    }
  });
} else {
  console.log('⚠️ Frontend dist not found in any location. API-only mode.');
  console.log('💡 To serve frontend, ensure dist folder exists.');
  
  // API-only mode - return 404 for non-API routes
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.status(404).json({ error: 'Frontend not available. API-only mode.' });
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