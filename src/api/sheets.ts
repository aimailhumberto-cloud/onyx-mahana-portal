import axios from 'axios'

// API URL - Local server (change to production URL when deployed)
const API_URL = 'http://localhost:3100'

// Tipos
export interface Tour {
  ID?: string
  Fecha?: string
  Hora?: string
  Cliente?: string
  Estatus?: string
  Vendedor?: string
  Actividad?: string
  Responsable?: string
  'Precio (Ingreso)'?: number
  'Costo (Pago)'?: number
  'Comisión (%)'?: number
  'Monto Comisión'?: number
  'Ganancia Mahana'?: number
  Notas?: string
  'Gestionado por'?: string
}

export interface CRMRequest {
  ID?: string
  'Fecha Solicitud'?: string
  Cliente?: string
  WhatsApp?: string
  Email?: string
  Propiedad?: string
  Tipo?: string
  'Check-in'?: string
  'Check-out'?: string
  Huéspedes?: string
  Habitaciones?: string
  'Precio Cotizado'?: string
  Estado?: string
  Responsable?: string
  Notas?: string
}

export interface Dashboard {
  toursMahana: { total: number; ingresos: number; ganancia: number }
  ventasCaracol: { total: number; ingresos: number; comision: number }
  crm: { total: number; pendientes: number; confirmadas: number }
}

// Obtener todos los datos
export async function getAllData() {
  try {
    const response = await axios.get(API_URL, { params: { action: 'getAll' } })
    return response.data
  } catch (error) {
    console.error('Error fetching all data:', error)
    return null
  }
}

// Obtener tours Mahana
export async function getTours(): Promise<{ total: number; data: Tour[] }> {
  try {
    const response = await axios.get(API_URL, { params: { action: 'getTours' } })
    return response.data
  } catch (error) {
    console.error('Error fetching tours:', error)
    return { total: 0, data: [] }
  }
}

// Obtener ventas Caracol
export async function getVentasCaracol(): Promise<{ total: number; data: Tour[] }> {
  try {
    const response = await axios.get(API_URL, { params: { action: 'getVentasCaracol' } })
    return response.data
  } catch (error) {
    console.error('Error fetching ventas caracol:', error)
    return { total: 0, data: [] }
  }
}

// Obtener CRM
export async function getCRM(): Promise<{ total: number; data: CRMRequest[] }> {
  try {
    const response = await axios.get(API_URL, { params: { action: 'getCRM' } })
    return response.data
  } catch (error) {
    console.error('Error fetching CRM:', error)
    return { total: 0, data: [] }
  }
}

// Obtener dashboard
export async function getDashboard(): Promise<Dashboard> {
  try {
    const response = await axios.get(API_URL, { params: { action: 'getDashboard' } })
    return response.data
  } catch (error) {
    console.error('Error fetching dashboard:', error)
    return {
      toursMahana: { total: 0, ingresos: 0, ganancia: 0 },
      ventasCaracol: { total: 0, ingresos: 0, comision: 0 },
      crm: { total: 0, pendientes: 0, confirmadas: 0 }
    }
  }
}

// Agregar solicitud CRM
export async function addCRMRequest(request: Partial<CRMRequest>): Promise<{ success: boolean; id?: string; message?: string }> {
  try {
    const response = await axios.post(API_URL, { action: 'addCRM', ...request })
    return response.data
  } catch (error) {
    console.error('Error adding CRM request:', error)
    return { success: false }
  }
}

// Verificar estado de la API
export async function checkAPIStatus(): Promise<{ status: string; message: string }> {
  try {
    const response = await axios.get(API_URL, { params: { action: 'status' } })
    return response.data
  } catch (error) {
    console.error('Error checking API status:', error)
    return { status: 'error', message: 'API no disponible' }
  }
}