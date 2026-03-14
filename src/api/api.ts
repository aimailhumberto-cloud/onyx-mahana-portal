import axios from 'axios'

// Use relative URL — frontend and API are served from the same origin
const api = axios.create({
  baseURL: '/api/v1',
  timeout: 10000,
})

// ── Types ──

export interface Tour {
  id: number
  fecha: string
  hora: string
  cliente: string
  whatsapp?: string
  estatus: string
  vendedor: string
  actividad: string
  responsable: string
  precio_ingreso: number
  costo_pago: number
  comision_pct: number | null
  monto_comision: number | null
  ganancia_mahana: number
  notas: string
  gestionado_por: string
  fuente: string
  created_at: string
  updated_at: string
}

export interface Estadia {
  id: number
  fecha_solicitud: string
  cliente: string
  whatsapp?: string
  email?: string
  propiedad: string
  tipo: string
  check_in: string
  check_out: string
  huespedes: string
  habitaciones: string
  precio_cotizado: string
  precio_final: number | null
  comision_pct: number
  monto_comision: number | null
  estado: string
  responsable: string
  notas: string
  fuente: string
  created_at: string
  updated_at: string
}

export interface Actividad {
  id: number
  nombre: string
  tipo: string
  precio_base: number | null
  costo_base: number | null
  activa: number
}

export interface Staff {
  id: number
  nombre: string
  rol: string
  activo: number
}

export interface Meta {
  total: number
  page: number
  limit: number
  pages: number
}

export interface ApiResponse<T> {
  success: boolean
  data: T
  meta?: Meta
  error?: { code: string; message: string; fields?: string[] }
}

export interface DashboardData {
  resumen: {
    tours_total: number
    tours_hoy: number
    ingresos_total: number
    ganancia_total: number
    estadias_total: number
    estadias_pendientes: number
    estadias_confirmadas: number
  }
  tours_mahana: { total: number; ingresos: number; ganancia: number }
  ventas_partners: { total: number; ingresos: number; comisiones: number }
  estadias: { total: number; pendientes: number; confirmadas: number; comisiones: number }
  tours_por_estatus: { pagados: number; reservados: number; consultas: number }
  recientes: Array<{
    tipo: string
    id: number
    cliente: string
    descripcion: string
    fecha: string
    estado: string
    monto: number | null
    fuente: string
    created_at: string
  }>
  mesActual?: string
  mesSeleccionado?: string
  mesesDisponibles?: string[]
}

// ── Tours ──

export async function getTours(params: Record<string, string | number> = {}): Promise<ApiResponse<Tour[]>> {
  try {
    const response = await api.get('/tours', { params })
    return response.data
  } catch (err) {
    console.error('Error fetching tours:', err)
    return { success: false, data: [], meta: { total: 0, page: 1, limit: 50, pages: 0 }, error: { code: 'NETWORK', message: 'Error de conexión' } }
  }
}

export async function getTourById(id: number): Promise<ApiResponse<Tour>> {
  const response = await api.get(`/tours/${id}`)
  return response.data
}

export async function createTour(data: Partial<Tour>): Promise<ApiResponse<Tour>> {
  const response = await api.post('/tours', data, { headers: { 'X-API-Key': import.meta.env.VITE_API_KEY || 'mahana-dev-key-2026' } })
  return response.data
}

export async function updateTour(id: number, data: Partial<Tour>): Promise<ApiResponse<Tour>> {
  const response = await api.put(`/tours/${id}`, data, { headers: { 'X-API-Key': import.meta.env.VITE_API_KEY || 'mahana-dev-key-2026' } })
  return response.data
}

export async function updateTourStatus(id: number, estatus: string): Promise<ApiResponse<Tour>> {
  const response = await api.patch(`/tours/${id}/status`, { estatus }, { headers: { 'X-API-Key': import.meta.env.VITE_API_KEY || 'mahana-dev-key-2026' } })
  return response.data
}

// ── Estadías ──

export async function getEstadias(params: Record<string, string | number> = {}): Promise<ApiResponse<Estadia[]>> {
  try {
    const response = await api.get('/estadias', { params })
    return response.data
  } catch (err) {
    console.error('Error fetching estadias:', err)
    return { success: false, data: [], meta: { total: 0, page: 1, limit: 50, pages: 0 }, error: { code: 'NETWORK', message: 'Error de conexión' } }
  }
}

export async function getEstadiaById(id: number): Promise<ApiResponse<Estadia>> {
  const response = await api.get(`/estadias/${id}`)
  return response.data
}

export async function createEstadia(data: Partial<Estadia>): Promise<ApiResponse<Estadia>> {
  const response = await api.post('/estadias', data, { headers: { 'X-API-Key': import.meta.env.VITE_API_KEY || 'mahana-dev-key-2026' } })
  return response.data
}

export async function updateEstadia(id: number, data: Partial<Estadia>): Promise<ApiResponse<Estadia>> {
  const response = await api.put(`/estadias/${id}`, data, { headers: { 'X-API-Key': import.meta.env.VITE_API_KEY || 'mahana-dev-key-2026' } })
  return response.data
}

export async function updateEstadiaStatus(id: number, estado: string): Promise<ApiResponse<Estadia>> {
  const response = await api.patch(`/estadias/${id}/status`, { estado }, { headers: { 'X-API-Key': import.meta.env.VITE_API_KEY || 'mahana-dev-key-2026' } })
  return response.data
}

// ── Dashboard ──

export async function getDashboard(): Promise<ApiResponse<DashboardData>> {
  try {
    const response = await api.get('/dashboard')
    return response.data
  } catch (err) {
    console.error('Error fetching dashboard:', err)
    return { success: false, data: {} as DashboardData, error: { code: 'NETWORK', message: 'Error de conexión' } }
  }
}

// ── Catalogs ──

export async function getActividades(): Promise<ApiResponse<Actividad[]>> {
  try {
    const response = await api.get('/actividades')
    return response.data
  } catch (err) {
    return { success: false, data: [], error: { code: 'NETWORK', message: 'Error de conexión' } }
  }
}

export async function getStaff(): Promise<ApiResponse<Staff[]>> {
  try {
    const response = await api.get('/staff')
    return response.data
  } catch (err) {
    return { success: false, data: [], error: { code: 'NETWORK', message: 'Error de conexión' } }
  }
}

export async function getApiStatus() {
  try {
    const response = await api.get('/api-status')
    return response.data
  } catch (err) {
    return { success: false, error: { code: 'OFFLINE', message: 'API no disponible' } }
  }
}
