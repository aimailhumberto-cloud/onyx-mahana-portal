import axios from 'axios'

// Use relative URL — frontend and API are served from the same origin
const api = axios.create({
  baseURL: '/api/v1',
  timeout: 10000,
})

// ── JWT Interceptor ──
// Automatically attach Bearer token from localStorage to all requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('mahana_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Auto-logout on 401 responses (token expired)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && error.response?.data?.error?.code === 'TOKEN_EXPIRED') {
      localStorage.removeItem('mahana_token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// ── Types ──

export interface Tour {
  id: number
  fecha: string
  hora: string
  cliente: string
  whatsapp?: string
  email_cliente?: string
  hotel?: string
  nacionalidad?: string
  idioma?: string
  pax?: number
  edades?: string
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
  imagen_url: string | null
  // Booking system fields
  slug: string | null
  sitios: string | null  // JSON array e.g. '["mahanatours","ans-surf"]'
  visible_web: number
  duracion_min: number | null
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

export interface Slot {
  id: number
  actividad_id: number
  fecha: string
  hora: string
  capacidad: number
  reservados: number
  bloqueado: number
  notas: string | null
  created_at: string
  actividad_nombre?: string
}

export interface Plantilla {
  id: number
  actividad_id: number
  dia_semana: number
  hora: string
  capacidad: number
  activa: number
  actividad_nombre?: string
  fecha_inicio?: string | null
  fecha_fin?: string | null
}

export interface Bloqueo {
  id: number
  actividad_id: number | null
  fecha: string
  motivo: string | null
  created_at: string
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
  tours_por_estatus: { pagados: number; reservados: number; consultas: number; por_aprobar: number }
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

// ── Auth ──

export async function login(email: string, password: string): Promise<ApiResponse<{ token: string; user: any }>> {
  try {
    const response = await api.post('/auth/login', { email, password })
    return response.data
  } catch (err: any) {
    if (err.response?.data) return err.response.data
    return { success: false, data: null as any, error: { code: 'NETWORK', message: 'Error de conexión' } }
  }
}

export async function getMe(token?: string): Promise<ApiResponse<any>> {
  try {
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`
    const response = await api.get('/auth/me', { headers })
    return response.data
  } catch (err: any) {
    if (err.response?.data) return err.response.data
    return { success: false, data: null, error: { code: 'NETWORK', message: 'Error de conexión' } }
  }
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

export async function createTour(data: Partial<Tour> & { slot_id?: number; pax?: number }): Promise<ApiResponse<Tour>> {
  const response = await api.post('/tours', data)
  return response.data
}

export async function updateTour(id: number, data: Partial<Tour>): Promise<ApiResponse<Tour>> {
  const response = await api.put(`/tours/${id}`, data)
  return response.data
}

export async function updateTourStatus(id: number, estatus: string): Promise<ApiResponse<Tour>> {
  const response = await api.patch(`/tours/${id}/status`, { estatus })
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
  const response = await api.post('/estadias', data)
  return response.data
}

export async function updateEstadia(id: number, data: Partial<Estadia>): Promise<ApiResponse<Estadia>> {
  const response = await api.put(`/estadias/${id}`, data)
  return response.data
}

export async function updateEstadiaStatus(id: number, estado: string): Promise<ApiResponse<Estadia>> {
  const response = await api.patch(`/estadias/${id}/status`, { estado })
  return response.data
}

// ── Dashboard ──

export async function getDashboard(params: Record<string, string> = {}): Promise<ApiResponse<DashboardData>> {
  try {
    const response = await api.get('/dashboard', { params })
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
  const response = await api.post('/actividades', data)
  return response.data
}

export async function updateActividad(id: number, data: Partial<Actividad>): Promise<ApiResponse<Actividad>> {
  try {
    const response = await api.put(`/actividades/${id}`, data)
    return response.data
  } catch (err: any) {
    return { success: false, data: {} as Actividad, error: { code: 'NETWORK', message: err.response?.data?.error?.message || 'Error al actualizar actividad' } }
  }
}

export async function deleteActividad(id: number): Promise<ApiResponse<{ deleted: boolean; id: number }>> {
  const response = await api.delete(`/actividades/${id}`)
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
  const response = await api.post('/propiedades', data)
  return response.data
}

export async function updatePropiedad(id: number, data: Partial<Propiedad>): Promise<ApiResponse<Propiedad>> {
  const response = await api.put(`/propiedades/${id}`, data)
  return response.data
}

export async function deletePropiedad(id: number): Promise<ApiResponse<{ deleted: boolean; id: number }>>{
  const response = await api.delete(`/propiedades/${id}`)
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

// ── Availability: Slots ──

export async function getDisponibilidad(params: Record<string, string> = {}): Promise<ApiResponse<Slot[]>> {
  try {
    const response = await api.get('/disponibilidad', { params })
    return response.data
  } catch (err) {
    return { success: false, data: [], error: { code: 'NETWORK', message: 'Error de conexión' } }
  }
}

export async function getDisponibilidadSemana(desde: string): Promise<ApiResponse<any>> {
  try {
    const response = await api.get('/disponibilidad/semana', { params: { desde } })
    return response.data
  } catch (err) {
    return { success: false, data: null, error: { code: 'NETWORK', message: 'Error de conexión' } }
  }
}

export async function createSlot(data: Partial<Slot>): Promise<ApiResponse<Slot>> {
  const response = await api.post('/slots', data)
  return response.data
}

export async function updateSlot(id: number, data: Partial<Slot>): Promise<ApiResponse<Slot>> {
  const response = await api.put(`/slots/${id}`, data)
  return response.data
}

export async function deleteSlot(id: number): Promise<ApiResponse<{ deleted: boolean }>> {
  const response = await api.delete(`/slots/${id}`)
  return response.data
}

// ── Availability: Plantillas ──

export async function getPlantillas(): Promise<ApiResponse<Plantilla[]>> {
  try {
    const response = await api.get('/plantillas')
    return response.data
  } catch (err) {
    return { success: false, data: [], error: { code: 'NETWORK', message: 'Error de conexión' } }
  }
}

export async function createPlantilla(data: Partial<Plantilla>): Promise<ApiResponse<Plantilla>> {
  const response = await api.post('/plantillas', data)
  return response.data
}

export async function updatePlantilla(id: number, data: Partial<Plantilla>): Promise<ApiResponse<Plantilla>> {
  const response = await api.put(`/plantillas/${id}`, data)
  return response.data
}

export async function deletePlantilla(id: number): Promise<ApiResponse<{ deleted: boolean }>> {
  const response = await api.delete(`/plantillas/${id}`)
  return response.data
}

export async function generarSlotsMes(data: { mes: string; actividad_id?: number }): Promise<ApiResponse<{ created: number }>> {
  const response = await api.post('/plantillas/generar', data)
  return response.data
}

// ── Availability: Bloqueos ──

export async function getBloqueos(params: Record<string, string> = {}): Promise<ApiResponse<Bloqueo[]>> {
  try {
    const response = await api.get('/bloqueos', { params })
    return response.data
  } catch (err) {
    return { success: false, data: [], error: { code: 'NETWORK', message: 'Error de conexión' } }
  }
}

export async function createBloqueo(data: Partial<Bloqueo>): Promise<ApiResponse<Bloqueo>> {
  const response = await api.post('/bloqueos', data)
  return response.data
}

export async function deleteBloqueo(id: number): Promise<ApiResponse<{ deleted: boolean }>> {
  const response = await api.delete(`/bloqueos/${id}`)
  return response.data
}

// ── File Upload ──

export async function uploadFile(file: File): Promise<ApiResponse<{ url: string; filename: string; size: number }>> {
  try {
    const formData = new FormData()
    formData.append('file', file)
    const response = await api.post('/uploads', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30000, // 30s for uploads
    })
    return response.data
  } catch (err: any) {
    if (err.response?.data) return err.response.data
    return { success: false, data: { url: '', filename: '', size: 0 }, error: { code: 'NETWORK', message: 'Error al subir archivo' } }
  }
}

// ── Partner Dashboard ──

export interface PartnerDashboardData {
  kpis: {
    total_tours: number
    total_pagado: number
    itbm: number
    total_comision: number
    por_aprobar: number
    aprobados: number
    reservados: number
    rechazados: number
  }
  topTours: Array<{ nombre: string; cantidad: number; monto: number }>
  ingresosPorMes: Array<{ mes: string; cantidad: number; ingresos: number; comision: number }>
  clientesRecientes: Array<{
    cliente: string
    actividad: string
    fecha: string
    estatus: string
    costo_pago: number | null
    whatsapp: string | null
  }>
  mesActual: string
  mesSeleccionado: string
  mesesDisponibles: string[]
}

export async function getPartnerDashboard(params: Record<string, string> = {}): Promise<ApiResponse<PartnerDashboardData>> {
  try {
    const response = await api.get('/partner/dashboard', { params })
    return response.data
  } catch (err: any) {
    if (err.response?.data) return err.response.data
    return { success: false, data: {} as PartnerDashboardData, error: { code: 'NETWORK', message: 'Error de conexión' } }
  }
}

export async function updatePartnerTour(id: number, data: Record<string, any>): Promise<ApiResponse<Tour>> {
  try {
    const response = await api.put(`/partner/tours/${id}`, data)
    return response.data
  } catch (err: any) {
    if (err.response?.data) return err.response.data
    return { success: false, data: {} as Tour, error: { code: 'NETWORK', message: 'Error de conexión' } }
  }
}

// ── Tour Approval ──

export async function aprobarTour(id: number): Promise<ApiResponse<Tour>> {
  const response = await api.post(`/tours/${id}/aprobar`)
  return response.data
}

export async function rechazarTour(id: number, motivo: string): Promise<ApiResponse<Tour>> {
  const response = await api.post(`/tours/${id}/rechazar`, { motivo })
  return response.data
}

export async function deleteTour(id: number): Promise<ApiResponse<{ id: number; eliminado: boolean }>> {
  const response = await api.delete(`/tours/${id}`)
  return response.data
}

export async function getDeletedTours(): Promise<ApiResponse<Tour[]>> {
  try {
    const response = await api.get('/tours/deleted')
    return response.data
  } catch (err: any) {
    if (err.response?.data) return err.response.data
    return { success: false, data: [], error: { code: 'NETWORK', message: 'Error de conexión' } }
  }
}

// ── Alertas ──

export interface Alerta {
  id: number
  tipo: string
  mensaje: string
  referencia_tipo: string | null
  referencia_id: number | null
  datos_extra: string | null
  leida: number
  created_at: string
}

export async function getAlertas(params: Record<string, string> = {}): Promise<ApiResponse<{ alertas: Alerta[]; sin_leer: number }>> {
  try {
    const response = await api.get('/alertas', { params })
    return response.data
  } catch (err: any) {
    if (err.response?.data) return err.response.data
    return { success: false, data: { alertas: [], sin_leer: 0 }, error: { code: 'NETWORK', message: 'Error' } }
  }
}

export async function marcarAlertaLeida(id: number): Promise<ApiResponse<Alerta>> {
  const response = await api.patch(`/alertas/${id}`)
  return response.data
}

// ── Notification Config ──

export async function getNotificationConfig(): Promise<ApiResponse<Record<string, { valor: string; descripcion: string }>>> {
  try {
    const response = await api.get('/config/notificaciones')
    return response.data
  } catch (err: any) {
    if (err.response?.data) return err.response.data
    return { success: false, data: {}, error: { code: 'NETWORK', message: 'Error' } }
  }
}

export async function updateNotificationConfig(config: Record<string, string>): Promise<ApiResponse<Record<string, { valor: string; descripcion: string }>>> {
  const response = await api.put('/config/notificaciones', config)
  return response.data
}

// ── User Management ──

export interface Usuario {
  id: number
  email: string
  nombre: string
  rol: 'admin' | 'partner' | 'vendedor'
  vendedor: string | null
  activo: number
  created_at: string
}

export async function getUsuarios(): Promise<ApiResponse<Usuario[]>> {
  try {
    const response = await api.get('/usuarios')
    return response.data
  } catch (err: any) {
    if (err.response?.data) return err.response.data
    return { success: false, data: [], error: { code: 'NETWORK', message: 'Error' } }
  }
}

export async function createUsuario(data: { email: string; password: string; nombre: string; rol: string; vendedor?: string }): Promise<ApiResponse<Usuario>> {
  try {
    const response = await api.post('/usuarios', data)
    return response.data
  } catch (err: any) {
    if (err.response?.data) return err.response.data
    return { success: false, data: null as any, error: { code: 'NETWORK', message: 'Error de conexión' } }
  }
}

export async function updateUsuario(id: number, data: { email?: string; password?: string; nombre?: string; rol?: string; vendedor?: string }): Promise<ApiResponse<Usuario>> {
  const response = await api.put(`/usuarios/${id}`, data)
  return response.data
}

export async function toggleUsuario(id: number): Promise<ApiResponse<Usuario>> {
  const response = await api.patch(`/usuarios/${id}/toggle`)
  return response.data
}

export async function deleteUsuario(id: number): Promise<ApiResponse<{ deleted: boolean }>> {
  const response = await api.delete(`/usuarios/${id}`)
  return response.data
}

// ── CxC (Cuentas por Cobrar) ──

export interface CxCTour {
  id: number
  fecha: string
  hora: string
  cliente: string
  actividad: string
  vendedor: string
  estatus: string
  precio_ingreso: number
  comision_pct: number
  monto_comision: number
  ganancia_mahana: number
  cxc_subtotal: number
  cxc_itbm: number
  cxc_total: number
  cxc_estatus: string
  cxc_factura_url: string | null
  cxc_fecha_emision: string | null
  cxc_fecha_vencimiento: string | null
  cxc_fecha_pago: string | null
}

export interface CxCSummary {
  total_tours: number
  total_cxc: number
  sin_factura: number
  pendiente: number
  enviada: number
  pagado: number
  count_sin_factura: number
  count_pendiente: number
  count_enviada: number
  count_pagado: number
}

export interface CxCAging {
  corriente: number
  dias_15_30: number
  dias_30_60: number
  dias_60_plus: number
}

export interface CxCData {
  tours: CxCTour[]
  summary: CxCSummary
  aging: CxCAging
  porVendedor: { vendedor: string; total: number; pendiente: number; pagado: number }[]
}

export async function getCxC(params: Record<string, string> = {}): Promise<ApiResponse<CxCData>> {
  try {
    const response = await api.get('/cxc', { params })
    return response.data
  } catch (err) {
    return { success: false, data: {} as CxCData, error: { code: 'NETWORK', message: 'Error de conexión' } }
  }
}

export async function updateCxC(tourId: number, data: Record<string, any>): Promise<ApiResponse<any>> {
  const response = await api.patch(`/tours/${tourId}/cxc`, data)
  return response.data
}

export async function getPartnerCxC(): Promise<ApiResponse<{ tours: CxCTour[]; summary: { por_pagar: number; pagado: number; count_pendiente: number; count_pagado: number } }>> {
  try {
    const response = await api.get('/partner/cxc')
    return response.data
  } catch (err) {
    return { success: false, data: { tours: [], summary: { por_pagar: 0, pagado: 0, count_pendiente: 0, count_pagado: 0 } }, error: { code: 'NETWORK', message: 'Error de conexión' } }
  }
}

// ── Partner PayPal ──

export async function getPartnerPayPalConfig(): Promise<ApiResponse<{ paypal_enabled: boolean; paypal_client_id: string | null; paypal_mode: string }>> {
  try {
    const response = await api.get('/partner/paypal-config')
    return response.data
  } catch (err: any) {
    if (err.response?.data) return err.response.data
    return { success: false, data: { paypal_enabled: false, paypal_client_id: null, paypal_mode: 'sandbox' }, error: { code: 'NETWORK', message: 'Error de conexión' } }
  }
}

export async function partnerPayPalCreateOrder(tourData: Record<string, any>): Promise<ApiResponse<{ orderID: string; tourId: number; precioTotal: number }>> {
  try {
    const response = await api.post('/partner/paypal/create-order', { tourData })
    return response.data
  } catch (err: any) {
    if (err.response?.data) return err.response.data
    return { success: false, data: { orderID: '', tourId: 0, precioTotal: 0 }, error: { code: 'NETWORK', message: 'Error de conexión' } }
  }
}

export async function partnerPayPalCaptureOrder(orderID: string, tourId: number): Promise<ApiResponse<{ tourId: number; estado: string; paypal_status: string; mensaje: string }>> {
  try {
    const response = await api.post('/partner/paypal/capture-order', { orderID, tourId })
    return response.data
  } catch (err: any) {
    if (err.response?.data) return err.response.data
    return { success: false, data: { tourId: 0, estado: '', paypal_status: '', mensaje: '' }, error: { code: 'NETWORK', message: 'Error de conexión' } }
  }
}

