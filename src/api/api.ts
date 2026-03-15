import axios from 'axios'

// Use relative URL — frontend and API are served from the same origin
const api = axios.create({
  baseURL: '/api/v1',
  timeout: 10000,
})

const API_KEY = import.meta.env.VITE_API_KEY || 'mahana-dev-key-2026'
const authHeaders = { 'X-API-Key': API_KEY }

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
  base_caracol: number | null
  impuesto: number | null
  cleaning_fee: number | null
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
  // Product catalog fields
  categoria: string | null
  descripcion: string | null
  unidad: string | null
  duracion: string | null
  horario: string | null
  punto_encuentro: string | null
  que_incluye: string | null
  que_llevar: string | null
  requisitos: string | null
  disponibilidad: string | null
  costo_instructor: number | null
  comision_caracol_pct: number | null
  capacidad_max: number | null
  transporte: number | null
}

export interface Propiedad {
  id: number
  nombre: string
  descripcion: string | null
  tipo: string | null
  habitaciones: number | null
  capacidad: number | null
  precio_noche: number | null
  impuesto_pct: number
  cleaning_fee: number
  amenidades: string | null
  activa: number
  created_at: string
  updated_at: string
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
  const response = await api.post('/tours', data, { headers: authHeaders })
  return response.data
}

export async function updateTour(id: number, data: Partial<Tour>): Promise<ApiResponse<Tour>> {
  const response = await api.put(`/tours/${id}`, data, { headers: authHeaders })
  return response.data
}

export async function updateTourStatus(id: number, estatus: string): Promise<ApiResponse<Tour>> {
  const response = await api.patch(`/tours/${id}/status`, { estatus }, { headers: authHeaders })
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
  const response = await api.post('/estadias', data, { headers: authHeaders })
  return response.data
}

export async function updateEstadia(id: number, data: Partial<Estadia>): Promise<ApiResponse<Estadia>> {
  const response = await api.put(`/estadias/${id}`, data, { headers: authHeaders })
  return response.data
}

export async function updateEstadiaStatus(id: number, estado: string): Promise<ApiResponse<Estadia>> {
  const response = await api.patch(`/estadias/${id}/status`, { estado }, { headers: authHeaders })
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

// ── Catalogs: Actividades ──

export async function getActividades(): Promise<ApiResponse<Actividad[]>> {
  try {
    const response = await api.get('/actividades')
    return response.data
  } catch (err) {
    return { success: false, data: [], error: { code: 'NETWORK', message: 'Error de conexión' } }
  }
}

export async function getActividadById(id: number): Promise<ApiResponse<Actividad>> {
  const response = await api.get(`/actividades/${id}`)
  return response.data
}

export async function createActividad(data: Partial<Actividad>): Promise<ApiResponse<Actividad>> {
  const response = await api.post('/actividades', data, { headers: authHeaders })
  return response.data
}

export async function updateActividad(id: number, data: Partial<Actividad>): Promise<ApiResponse<Actividad>> {
  const response = await api.put(`/actividades/${id}`, data, { headers: authHeaders })
  return response.data
}

export async function deleteActividad(id: number): Promise<ApiResponse<{ deleted: boolean; id: number }>> {
  const response = await api.delete(`/actividades/${id}`, { headers: authHeaders })
  return response.data
}

// ── Catalogs: Propiedades ──

export async function getPropiedades(): Promise<ApiResponse<Propiedad[]>> {
  try {
    const response = await api.get('/propiedades')
    return response.data
  } catch (err) {
    return { success: false, data: [], error: { code: 'NETWORK', message: 'Error de conexión' } }
  }
}

export async function getPropiedadById(id: number): Promise<ApiResponse<Propiedad>> {
  const response = await api.get(`/propiedades/${id}`)
  return response.data
}

export async function createPropiedad(data: Partial<Propiedad>): Promise<ApiResponse<Propiedad>> {
  const response = await api.post('/propiedades', data, { headers: authHeaders })
  return response.data
}

export async function updatePropiedad(id: number, data: Partial<Propiedad>): Promise<ApiResponse<Propiedad>> {
  const response = await api.put(`/propiedades/${id}`, data, { headers: authHeaders })
  return response.data
}

export async function deletePropiedad(id: number): Promise<ApiResponse<{ deleted: boolean; id: number }>> {
  const response = await api.delete(`/propiedades/${id}`, { headers: authHeaders })
  return response.data
}

// ── Staff ──

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

// ── Charts & Calendar ──

export async function getCharts(params: Record<string, string> = {}): Promise<ApiResponse<any>> {
  try {
    const response = await api.get('/charts', { params })
    return response.data
  } catch (err) {
    return { success: false, data: null, error: { code: 'NETWORK', message: 'Error de conexión' } }
  }
}

export async function getCalendarData(mes?: string): Promise<ApiResponse<any>> {
  try {
    const response = await api.get('/calendar', { params: mes ? { mes } : {} })
    return response.data
  } catch (err) {
    return { success: false, data: null, error: { code: 'NETWORK', message: 'Error de conexión' } }
  }
}
