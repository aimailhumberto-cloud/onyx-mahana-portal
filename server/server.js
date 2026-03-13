const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3100;

// Middleware
app.use(cors());
app.use(express.json());

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

app.post('/api/crm', (req, res) => {
  const crm = readJSON('crm.json');
  const newId = 'R' + String(crm.length + 1).padStart(3, '0');
  const newItem = {
    ID: newId,
    'Fecha Solicitud': new Date().toISOString().split('T')[0],
    ...req.body,
    Estado: '📥 Solicitada'
  };
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

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

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