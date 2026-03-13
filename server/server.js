const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3100;

// CORS Configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['*'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all origins for now
    }
  },
  credentials: true
}));

app.use(express.json());

// Rate limiting
const requestCounts = {};
const RATE_LIMIT = 100;
const RATE_WINDOW = 60 * 1000;

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
        return res.status(429).json({ error: 'Too many requests' });
      }
    }
  }
  next();
});

// Data paths
const DATA_DIR = path.join(__dirname, '../data');

const readJSON = (file) => {
  try {
    const data = fs.readFileSync(path.join(DATA_DIR, file), 'utf8');
    return JSON.parse(data);
  } catch (e) {
    console.error(`Error reading ${file}:`, e.message);
    return [];
  }
};

const writeJSON = (file, data) => {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
};

// API Routes - MUST come before static files
app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', message: 'Mahana Portal API v1.0', timestamp: new Date().toISOString() });
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

const CRM_ALLOWED_FIELDS = [
  'Cliente', 'WhatsApp', 'Email', 'Propiedad', 'Tipo',
  'Check-in', 'Check-out', 'Huéspedes', 'Habitaciones',
  'Precio Cotizado', 'Responsable', 'Notas'
];

const sanitizeString = (str) => {
  if (typeof str !== 'string') return '';
  return str.slice(0, 1000).replace(/<[^>]*>/g, '');
};

app.post('/api/crm', (req, res) => {
  const crm = readJSON('crm.json');
  const newId = 'R' + String(crm.length + 1).padStart(3, '0');
  
  const newItem = {
    ID: newId,
    'Fecha Solicitud': new Date().toISOString().split('T')[0],
    Estado: '📥 Solicitada'
  };
  
  CRM_ALLOWED_FIELDS.forEach(field => {
    if (req.body[field] !== undefined && req.body[field] !== null) {
      newItem[field] = sanitizeString(String(req.body[field]));
    }
  });
  
  crm.push(newItem);
  writeJSON('crm.json', crm);
  res.json({ success: true, id: newId, data: newItem });
});

app.get('/api/actividades', (req, res) => {
  res.json({ total: 0, data: [] });
});

app.get('/api/usuarios', (req, res) => {
  res.json({ total: 0, data: [] });
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
    crm: readJSON('crm.json')
  });
});

// Find dist directory
const distPath = path.join(__dirname, '../dist');
console.log('📁 Looking for dist at:', distPath);
console.log('📁 Dist exists:', fs.existsSync(distPath));
console.log('📁 Dist contents:', fs.existsSync(distPath) ? fs.readdirSync(distPath) : 'N/A');

if (fs.existsSync(distPath) && fs.existsSync(path.join(distPath, 'index.html'))) {
  console.log('✅ Frontend found at:', distPath);
  
  // Serve static files FIRST - this is critical
  app.use(express.static(distPath));
  
  // SPA fallback for ALL other routes (except /api/*)
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  console.log('⚠️ Frontend not found. API-only mode.');
  app.get('*', (req, res) => {
    res.status(404).json({ error: 'Frontend not found' });
  });
}

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Start
app.listen(PORT, () => {
  console.log(`🚀 Mahana Portal running on port ${PORT}`);
});