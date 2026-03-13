/**
 * Mahana Portal - API Backend
 * Google Apps Script para servir datos del Sheet
 */

const SPREADSHEET_ID = '16cR0K6bezJAZwBmU11JRuErL4EtulsyBxdLtAC9SANc';

// Manejar solicitudes GET
function doGet(e) {
  const action = e.parameter.action || 'status';
  
  try {
    let result;
    
    switch (action) {
      case 'status':
        result = { status: 'ok', message: 'Mahana Portal API v1.0' };
        break;
      case 'getTours':
        result = getSheetData('Tours_Mahana');
        break;
      case 'getVentasCaracol':
        result = getSheetData('Ventas_Caracol');
        break;
      case 'getCRM':
        result = getSheetData('CRM_Habitaciones');
        break;
      case 'getActividades':
        result = getSheetData('Actividades');
        break;
      case 'getUsuarios':
        result = getSheetData('Usuarios');
        break;
      case 'getDashboard':
        result = getDashboardData();
        break;
      case 'getAll':
        result = {
          tours: getSheetData('Tours_Mahana'),
          ventasCaracol: getSheetData('Ventas_Caracol'),
          crm: getSheetData('CRM_Habitaciones'),
          actividades: getSheetData('Actividades'),
          usuarios: getSheetData('Usuarios'),
          dashboard: getDashboardData()
        };
        break;
      default:
        result = { error: 'Acción no reconocida: ' + action };
    }
    
    return ContentService
      .createTextOutput(JSON.stringify(result, null, 2))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Obtener datos de una hoja
function getSheetData(sheetName) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    return { error: 'Hoja no encontrada: ' + sheetName };
  }
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);
  
  // Convertir a array de objetos
  const result = rows.map(row => {
    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = row[i];
    });
    return obj;
  }).filter(row => {
    // Filtrar filas vacías (que tengan al menos un campo con valor)
    return Object.values(row).some(v => v !== '' && v !== null && v !== undefined);
  });
  
  return {
    total: result.length,
    headers: headers,
    data: result
  };
}

// Obtener datos del Dashboard
function getDashboardData() {
  const tours = getSheetData('Tours_Mahana');
  const ventas = getSheetData('Ventas_Caracol');
  const crm = getSheetData('CRM_Habitaciones');
  
  return {
    toursMahana: {
      total: tours.total,
      ingresos: calculateSum(tours.data, 'Precio (Ingreso)'),
      ganancia: calculateSum(tours.data, 'Ganancia Mahana')
    },
    ventasCaracol: {
      total: ventas.total,
      ingresos: calculateSum(ventas.data, 'Precio (Ingreso)'),
      comision: calculateSum(ventas.data, 'Monto Comisión')
    },
    crm: {
      total: crm.total,
      pendientes: crm.data.filter(r => r.Estado && r.Estado.includes('Solicitada')).length,
      confirmadas: crm.data.filter(r => r.Estado && r.Estado.includes('Confirmada')).length
    }
  };
}

// Calcular suma de una columna
function calculateSum(data, columnName) {
  return data.reduce((sum, row) => {
    const value = parseFloat(row[columnName]) || 0;
    return sum + value;
  }, 0);
}

// POST: Agregar nueva solicitud CRM
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action || 'addCRM';
    
    if (action === 'addCRM') {
      return addCRMRequest(data);
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'Acción no reconocida' }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Agregar solicitud al CRM
function addCRMRequest(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('CRM_Habitaciones');
  
  // Generar ID
  const lastRow = sheet.getLastRow();
  const newId = 'R' + String(lastRow).padStart(3, '0');
  
  // Nueva fila
  const newRow = [
    newId,
    data.fechaSolicitud || new Date().toISOString().split('T')[0],
    data.cliente,
    data.whatsapp || '',
    data.email || '',
    data.propiedad,
    data.tipo,
    data.checkIn,
    data.checkOut,
    data.huespedes,
    data.habitaciones || '1',
    data.precio || 'Por cotizar',
    '📥 Solicitada',
    data.responsable || 'Daniel',
    data.notas || ''
  ];
  
  sheet.appendRow(newRow);
  
  return ContentService
    .createTextOutput(JSON.stringify({ 
      success: true, 
      id: newId,
      message: 'Solicitud agregada correctamente'
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Función de prueba
function test() {
  Logger.log('Tours Mahana:', getSheetData('Tours_Mahana').total);
  Logger.log('Ventas Caracol:', getSheetData('Ventas_Caracol').total);
  Logger.log('CRM:', getSheetData('CRM_Habitaciones').total);
  Logger.log('Dashboard:', getDashboardData());
}