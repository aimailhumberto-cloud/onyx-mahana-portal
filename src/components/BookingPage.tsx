import { useState, useEffect, useCallback } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
  Calendar, Clock, User, CreditCard, CheckCircle, ChevronLeft, ChevronRight,
  Loader2, MapPin, Users, AlertCircle, MessageCircle, ArrowLeft
} from 'lucide-react'

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']

interface ProductInfo {
  id: number; nombre: string; slug: string; precio_base: number; descripcion: string
  duracion: string; punto_encuentro: string; que_incluye: string; que_llevar: string
  requisitos: string; capacidad_max: number; imagen_url: string; modo_booking: string
  sitios: string
  pago: { paypal_enabled: boolean; paypal_client_id: string | null; paypal_mode: string }
}

interface DayInfo { estado: string; disponibles: number; total_slots: number }
interface SlotInfo { id: number; hora: string; disponibles: number; capacidad: number }

const API_BASE = '/api/v1/public'

async function fetchPublic(path: string) {
  const res = await fetch(`${API_BASE}${path}`)
  return res.json()
}

async function postPublic(path: string, body: any) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return res.json()
}

export default function BookingPage() {
  const { slug } = useParams<{ slug: string }>()
  const [searchParams] = useSearchParams()
  const hideHeader = searchParams.get('hideHeader') === '1'

  // State
  const [producto, setProducto] = useState<ProductInfo | null>(null)
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Step 1: Calendar
  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1)
  const [dias, setDias] = useState<Record<string, DayInfo>>({})
  const [selectedDate, setSelectedDate] = useState('')

  // Step 2: Time slots
  const [slots, setSlots] = useState<SlotInfo[]>([])
  const [selectedSlot, setSelectedSlot] = useState<SlotInfo | null>(null)
  const [loadingSlots, setLoadingSlots] = useState(false)

  // Step 3: Client form
  const [form, setForm] = useState({ nombre: '', email: '', whatsapp: '', personas: 1, notas: '' })

  // Step 4-5: Booking result
  const [booking, setBooking] = useState<any>(null)
  const [submitting, setSubmitting] = useState(false)

  const monthStr = `${viewYear}-${String(viewMonth).padStart(2, '0')}`
  const isAgentMode = producto?.modo_booking === 'agente'

  // Load product
  useEffect(() => {
    if (!slug) return
    setLoading(true)
    fetchPublic(`/productos/${slug}`).then(res => {
      if (res.success) setProducto(res.data)
      else setError('Producto no encontrado')
      setLoading(false)
    }).catch(() => { setError('Error de conexión'); setLoading(false) })
  }, [slug])

  // Load month availability
  useEffect(() => {
    if (!slug || isAgentMode) return
    fetchPublic(`/disponibilidad/${slug}?mes=${monthStr}`).then(res => {
      if (res.success) setDias(res.data.dias)
    })
  }, [slug, monthStr, isAgentMode])

  // Load day slots
  const loadSlots = useCallback(async (fecha: string) => {
    if (!slug) return
    setLoadingSlots(true)
    const res = await fetchPublic(`/slots/${slug}?fecha=${fecha}`)
    if (res.success) {
      setSlots(res.data.slots.filter((s: SlotInfo) => s.disponibles > 0))
    }
    setLoadingSlots(false)
  }, [slug])

  // Calendar navigation
  const navigateMonth = (dir: number) => {
    let m = viewMonth + dir, y = viewYear
    if (m > 12) { m = 1; y++ }
    if (m < 1) { m = 12; y-- }
    setViewMonth(m); setViewYear(y)
  }

  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate()
  const firstDay = new Date(viewYear, viewMonth - 1, 1).getDay()

  // Select date → load slots → go to step 2
  const handleSelectDate = (dateStr: string) => {
    const info = dias[dateStr]
    if (!info || info.estado !== 'disponible') return
    setSelectedDate(dateStr)
    loadSlots(dateStr)
    setStep(2)
  }

  // Select slot → go to step 3
  const handleSelectSlot = (slot: SlotInfo) => {
    setSelectedSlot(slot)
    setStep(3)
  }

  // Submit booking
  const handleSubmit = async () => {
    if (!producto || !slug) return
    if (!form.nombre.trim() || !form.email.trim() || form.personas < 1) {
      setError('Por favor completa todos los campos requeridos')
      return
    }
    setSubmitting(true)
    setError('')

    const body: any = {
      slug,
      nombre: form.nombre.trim(),
      email: form.email.trim(),
      whatsapp: form.whatsapp.trim(),
      personas: form.personas,
      notas: form.notas.trim(),
    }

    if (isAgentMode) {
      body.modo = 'agente'
      body.fecha = selectedDate || undefined
    } else {
      body.modo = 'directo'
      body.slot_id = selectedSlot?.id
      body.fecha = selectedDate
      body.hora = selectedSlot?.hora
    }

    const res = await postPublic('/reservar', body)
    if (res.success) {
      setBooking(res.data)
      setStep(isAgentMode ? 5 : 4)
    } else {
      setError(res.error?.message || 'Error al crear reserva')
    }
    setSubmitting(false)
  }

  // Confirm payment (simulate for now — will be PayPal in production)
  const handleConfirmPayment = async () => {
    if (!booking) return
    setSubmitting(true)
    const res = await postPublic('/pago/confirmar', {
      codigo: booking.codigo,
      paypal_order_id: `SIMULATED-${Date.now()}`,
    })
    if (res.success) {
      setBooking({ ...booking, estado: 'pagado' })
      setStep(5)
    } else {
      setError(res.error?.message || 'Error al confirmar pago')
    }
    setSubmitting(false)
  }

  // ── Render ──

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Loader2 className="w-10 h-10 animate-spin text-teal-600" />
      </div>
    )
  }

  if (!producto) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center p-8">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-gray-800">Producto no encontrado</h2>
          <p className="text-sm text-gray-500 mt-1">{error}</p>
        </div>
      </div>
    )
  }

  // Determine site theme based on sitios
  const getSiteTheme = () => {
    if (!producto) return { bg: 'from-teal-600 to-emerald-700', accent: 'teal' }
    try {
      const sitios = JSON.parse(producto.sitios || '[]')
      if (sitios.includes('ans-surf')) return { bg: 'from-sky-600 to-blue-800', accent: 'sky' }
      if (sitios.includes('circuitochame')) return { bg: 'from-amber-600 to-orange-700', accent: 'amber' }
    } catch {}
    return { bg: 'from-teal-600 to-emerald-700', accent: 'teal' }
  }
  const theme = getSiteTheme()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-teal-50/30">
      {/* Hero Header */}
      {!hideHeader && (
        <div className="relative overflow-hidden">
          {producto.imagen_url ? (
            <>
              <div className="absolute inset-0">
                <img src={producto.imagen_url} alt={producto.nombre} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/70" />
              </div>
              <div className="relative max-w-2xl mx-auto px-4 py-8 sm:py-10">
                <h1 className="text-2xl sm:text-3xl font-bold text-white drop-shadow-lg">{producto.nombre}</h1>
                {producto.descripcion && (
                  <p className="text-sm text-white/80 mt-1.5 max-w-lg line-clamp-2">{producto.descripcion}</p>
                )}
                <div className="flex flex-wrap items-center gap-3 mt-3">
                  <span className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm text-white text-xs font-medium px-2.5 py-1 rounded-full">
                    <CreditCard className="w-3.5 h-3.5" />{producto.precio_base ? `$${producto.precio_base} USD / persona` : 'Precio: Consultar'}
                  </span>
                  {producto.duracion && (
                    <span className="flex items-center gap-1 bg-white/20 backdrop-blur-sm text-white text-xs px-2.5 py-1 rounded-full">
                      <Clock className="w-3.5 h-3.5" />{producto.duracion}
                    </span>
                  )}
                  {producto.punto_encuentro && (
                    <span className="flex items-center gap-1 bg-white/20 backdrop-blur-sm text-white text-xs px-2.5 py-1 rounded-full">
                      <MapPin className="w-3.5 h-3.5" />{producto.punto_encuentro}
                    </span>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className={`bg-gradient-to-r ${theme.bg}`}>
              <div className="max-w-2xl mx-auto px-4 py-8">
                <h1 className="text-2xl font-bold text-white">{producto.nombre}</h1>
                {producto.descripcion && (
                  <p className="text-sm text-white/80 mt-1.5 max-w-lg line-clamp-2">{producto.descripcion}</p>
                )}
                <div className="flex flex-wrap items-center gap-3 mt-3">
                  <span className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm text-white text-xs font-medium px-2.5 py-1 rounded-full">
                    <CreditCard className="w-3.5 h-3.5" />{producto.precio_base ? `$${producto.precio_base} USD / persona` : 'Precio: Consultar'}
                  </span>
                  {producto.duracion && (
                    <span className="flex items-center gap-1 bg-white/20 backdrop-blur-sm text-white text-xs px-2.5 py-1 rounded-full">
                      <Clock className="w-3.5 h-3.5" />{producto.duracion}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Progress bar */}
      <div className="max-w-2xl mx-auto px-4 pt-4">
        <div className="flex items-center gap-1 mb-6">
          {(isAgentMode ? [
            { n: 1, label: 'Información', icon: User },
            { n: 5, label: 'Confirmación', icon: CheckCircle },
          ] : [
            { n: 1, label: 'Fecha', icon: Calendar },
            { n: 2, label: 'Horario', icon: Clock },
            { n: 3, label: 'Datos', icon: User },
            { n: 4, label: 'Pago', icon: CreditCard },
            { n: 5, label: 'Listo', icon: CheckCircle },
          ]).map((s, i, arr) => (
            <div key={s.n} className="flex-1 flex items-center">
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-all ${
                step >= s.n ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-400'
              }`}>
                <s.icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < arr.length - 1 && <div className={`flex-1 h-0.5 mx-1 ${step > s.n ? 'bg-teal-400' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="max-w-2xl mx-auto px-4 mb-4">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-xl text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
            <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">✕</button>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 pb-8">

        {/* ═══ AGENT MODE: Simple form ═══ */}
        {isAgentMode && step < 5 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-teal-50 to-emerald-50">
              <div className="flex items-center gap-2 text-teal-700">
                <MessageCircle className="w-5 h-5" />
                <h2 className="font-bold">Consultar con un Agente</h2>
              </div>
              <p className="text-xs text-gray-500 mt-1">Un agente se pondrá en contacto contigo para organizar tu reserva</p>
            </div>
            <div className="  p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo *</label>
                <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none" placeholder="Tu nombre" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none" placeholder="tu@email.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp</label>
                  <input type="tel" value={form.whatsapp} onChange={e => setForm({ ...form, whatsapp: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none" placeholder="+507 6XXX-XXXX" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Personas *</label>
                  <input type="number" min={1} value={form.personas} onChange={e => setForm({ ...form, personas: parseInt(e.target.value) || 1 })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha deseada</label>
                  <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas / Preguntas</label>
                <textarea value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} rows={3}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none resize-none" placeholder="¿Alguna pregunta o solicitud especial?" />
              </div>
              <button onClick={handleSubmit} disabled={submitting || !form.nombre || !form.email}
                className="w-full py-3 bg-teal-600 text-white rounded-xl font-semibold text-sm hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                Enviar Consulta
              </button>
            </div>
          </div>
        )}

        {/* ═══ STEP 1: Calendar ═══ */}
        {!isAgentMode && step === 1 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-teal-50 to-emerald-50">
              <button onClick={() => navigateMonth(-1)} className="p-2 rounded-lg hover:bg-white/60"><ChevronLeft className="w-5 h-5 text-gray-600" /></button>
              <div className="text-center">
                <p className="font-bold text-gray-900">{MONTHS[viewMonth - 1]} {viewYear}</p>
                <p className="text-[10px] text-teal-600 font-medium">Selecciona una fecha</p>
              </div>
              <button onClick={() => navigateMonth(1)} className="p-2 rounded-lg hover:bg-white/60"><ChevronRight className="w-5 h-5 text-gray-600" /></button>
            </div>

            <div className="grid grid-cols-7 border-b border-gray-100">
              {DAYS.map(d => <div key={d} className="text-center py-2 text-xs font-semibold text-gray-400">{d}</div>)}
            </div>

            <div className="grid grid-cols-7 p-1 gap-1">
              {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1
                const dateStr = `${monthStr}-${String(day).padStart(2, '0')}`
                const info = dias[dateStr] || { estado: 'sin_slots', disponibles: 0 }
                const available = info.estado === 'disponible'
                const isToday = dateStr === new Date().toISOString().split('T')[0]

                return (
                  <button key={day} onClick={() => available && handleSelectDate(dateStr)} disabled={!available}
                    className={`aspect-square rounded-xl flex flex-col items-center justify-center transition-all text-sm ${
                      available
                        ? 'bg-teal-50 hover:bg-teal-100 text-teal-800 font-medium cursor-pointer hover:shadow-sm border border-teal-200'
                        : info.estado === 'lleno'
                          ? 'bg-orange-50 text-orange-300 cursor-not-allowed'
                          : 'text-gray-300 cursor-not-allowed'
                    } ${isToday ? 'ring-2 ring-teal-400 ring-offset-1' : ''}`}>
                    <span>{day}</span>
                    {available && <span className="text-[8px] text-teal-500 -mt-0.5">{info.disponibles}</span>}
                  </button>
                )
              })}
            </div>

            {/* Product info card */}
            <div className="p-4 border-t border-gray-100 bg-gray-50/50">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  {producto.descripcion && <p className="text-xs text-gray-600 line-clamp-2">{producto.descripcion}</p>}
                  <div className="flex flex-wrap gap-3 mt-2 text-[10px] text-gray-500">
                    {producto.duracion && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{producto.duracion}</span>}
                    {producto.punto_encuentro && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{producto.punto_encuentro}</span>}
                    {producto.capacidad_max && <span className="flex items-center gap-1"><Users className="w-3 h-3" />Max {producto.capacidad_max}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold text-teal-700">{producto.precio_base ? `$${producto.precio_base}` : 'Consultar'}</p>
                  <p className="text-[10px] text-gray-400">USD / persona</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ STEP 2: Time Slots ═══ */}
        {!isAgentMode && step === 2 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-teal-50 to-emerald-50 flex items-center justify-between">
              <button onClick={() => { setStep(1); setSelectedSlot(null) }} className="p-1 text-gray-500 hover:text-gray-700">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="text-center">
                <p className="font-bold text-gray-900">Horarios Disponibles</p>
                <p className="text-[10px] text-teal-600">{selectedDate}</p>
              </div>
              <div className="w-7" />
            </div>

            {loadingSlots ? (
              <div className="p-12 text-center"><Loader2 className="w-8 h-8 animate-spin text-teal-600 mx-auto" /></div>
            ) : slots.length === 0 ? (
              <div className="p-12 text-center text-gray-400">
                <Clock className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="font-medium">Sin horarios disponibles</p>
                <p className="text-xs mt-1">Intenta otra fecha</p>
              </div>
            ) : (
              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {slots.map(slot => (
                  <button key={slot.id} onClick={() => handleSelectSlot(slot)}
                    className="p-3 rounded-xl border border-gray-200 hover:border-teal-400 hover:bg-teal-50 transition-all text-left group">
                    <p className="text-lg font-bold text-gray-900 group-hover:text-teal-700">{slot.hora}</p>
                    <p className="text-[10px] text-gray-400">{slot.disponibles} cupo{slot.disponibles !== 1 ? 's' : ''}</p>
                    <div className="w-full h-1 bg-gray-100 rounded-full mt-1.5">
                      <div className="h-1 bg-teal-400 rounded-full" style={{ width: `${Math.max(10, (1 - slot.disponibles / slot.capacidad) * 100)}%` }} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ STEP 3: Client Form ═══ */}
        {!isAgentMode && step === 3 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-teal-50 to-emerald-50 flex items-center justify-between">
              <button onClick={() => setStep(2)} className="p-1 text-gray-500 hover:text-gray-700">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="text-center">
                <p className="font-bold text-gray-900">Tus Datos</p>
                <p className="text-[10px] text-teal-600">{selectedDate} · {selectedSlot?.hora}</p>
              </div>
              <div className="w-7" />
            </div>

            <div className="p-5 space-y-4">
              {/* Summary card */}
              <div className="bg-teal-50 rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-teal-800 text-sm">{producto.nombre}</p>
                  <p className="text-xs text-teal-600">{selectedDate} a las {selectedSlot?.hora}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-teal-800">{producto.precio_base ? `$${producto.precio_base}` : 'Consultar'}</p>
                  <p className="text-[9px] text-teal-500">/ persona</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo *</label>
                <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none" placeholder="Tu nombre completo" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none" placeholder="tu@email.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp</label>
                  <input type="tel" value={form.whatsapp} onChange={e => setForm({ ...form, whatsapp: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none" placeholder="+507 6XXX-XXXX" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Personas *</label>
                  <input type="number" min={1} max={selectedSlot?.disponibles || 10} value={form.personas}
                    onChange={e => setForm({ ...form, personas: parseInt(e.target.value) || 1 })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none" />
                  <p className="text-[10px] text-gray-400 mt-0.5">Máx: {selectedSlot?.disponibles}</p>
                </div>
                <div className="flex items-end pb-5">
                  <div className="bg-gray-50 rounded-xl px-4 py-2.5 w-full text-center">
                    <p className="text-xs text-gray-500">Total</p>
                    <p className="text-xl font-bold text-teal-700">${((producto.precio_base || 0) * form.personas).toFixed(2)}</p>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                <textarea value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} rows={2}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none resize-none" placeholder="Edades, restricciones, preguntas..." />
              </div>
              <button onClick={handleSubmit} disabled={submitting || !form.nombre || !form.email || form.personas < 1}
                className="w-full py-3 bg-teal-600 text-white rounded-xl font-semibold text-sm hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-teal-600/20">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                Continuar al Pago — ${((producto.precio_base || 0) * form.personas).toFixed(2)}
              </button>
            </div>
          </div>
        )}

        {/* ═══ STEP 4: Payment ═══ */}
        {!isAgentMode && step === 4 && booking && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-teal-50 to-emerald-50 text-center">
              <p className="font-bold text-gray-900">Confirmar Pago</p>
              <p className="text-[10px] text-teal-600">Código: {booking.codigo}</p>
            </div>

            <div className="p-5 space-y-4">
              {/* Order summary */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm"><span className="text-gray-500">Producto</span><span className="font-medium">{booking.producto}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">Fecha</span><span className="font-medium">{booking.fecha}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">Hora</span><span className="font-medium">{booking.hora}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">Personas</span><span className="font-medium">{booking.personas}</span></div>
                <div className="border-t border-gray-200 pt-2 flex justify-between">
                  <span className="font-semibold text-gray-700">Total</span>
                  <span className="font-bold text-xl text-teal-700">${booking.precio_total} {booking.moneda}</span>
                </div>
              </div>

              {/* PayPal button placeholder */}
              {producto.pago.paypal_enabled && producto.pago.paypal_client_id ? (
                <div className="border-2 border-dashed border-yellow-300 rounded-xl p-6 text-center bg-yellow-50/50">
                  <p className="text-sm font-medium text-yellow-700">PayPal Smart Buttons</p>
                  <p className="text-xs text-yellow-600 mt-1">Se cargarán aquí cuando se configure PayPal Client ID</p>
                  <button onClick={handleConfirmPayment} disabled={submitting}
                    className="mt-3 px-6 py-2.5 bg-yellow-500 text-white rounded-xl font-medium text-sm hover:bg-yellow-600 disabled:opacity-50">
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Simular Pago PayPal'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600 text-center">Pago no configurado. Confirma tu reserva y un agente procesará el pago.</p>
                  <button onClick={handleConfirmPayment} disabled={submitting}
                    className="w-full py-3 bg-teal-600 text-white rounded-xl font-semibold text-sm hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-2">
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    Confirmar Reserva
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ STEP 5: Confirmation ═══ */}
        {step === 5 && booking && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 text-center bg-gradient-to-br from-teal-50 to-emerald-50">
              <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="w-8 h-8 text-teal-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">
                {isAgentMode ? '¡Consulta Enviada!' : '¡Reserva Confirmada!'}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {isAgentMode
                  ? 'Un agente se pondrá en contacto contigo pronto.'
                  : 'Recibirás un email de confirmación.'}
              </p>
            </div>

            <div className="p-5 space-y-3">
              <div className="bg-teal-50 rounded-xl p-4 text-center">
                <p className="text-[10px] text-teal-600 uppercase tracking-wider font-semibold">Código de Reserva</p>
                <p className="text-2xl font-mono font-bold text-teal-800 mt-1">{booking.codigo}</p>
              </div>

              {booking.producto && (
                <div className="bg-gray-50 rounded-xl p-4 space-y-1.5 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Producto</span><span className="font-medium">{booking.producto}</span></div>
                  {booking.fecha && booking.fecha !== 'por_definir' && (
                    <div className="flex justify-between"><span className="text-gray-500">Fecha</span><span className="font-medium">{booking.fecha}</span></div>
                  )}
                  {booking.hora && booking.hora !== 'por_definir' && (
                    <div className="flex justify-between"><span className="text-gray-500">Hora</span><span className="font-medium">{booking.hora}</span></div>
                  )}
                  {booking.personas && (
                    <div className="flex justify-between"><span className="text-gray-500">Personas</span><span className="font-medium">{booking.personas}</span></div>
                  )}
                  {booking.precio_total > 0 && (
                    <div className="flex justify-between border-t border-gray-200 pt-1.5 mt-1.5">
                      <span className="font-semibold">Total</span>
                      <span className="font-bold text-teal-700">${booking.precio_total} USD</span>
                    </div>
                  )}
                </div>
              )}

              <p className="text-xs text-center text-gray-400 mt-4">
                Guarda tu código de reserva. Puedes consultarlo cuando quieras.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
