import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getActividades, createTour, uploadFile, getPartnerPayPalConfig, partnerPayPalCreateOrder, partnerPayPalCaptureOrder } from '../../api/api'
import type { Actividad } from '../../api/api'
import { Loader2, ArrowLeft, CheckCircle, AlertCircle, Users, Clock, MapPin, Upload, X, Image, UserCircle, Search, ImageIcon, Calendar, ChevronLeft, ChevronRight, CreditCard } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DAYS_HEADER = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
const API_BASE = (import.meta.env.VITE_API_URL || '/api/v1') + '/public'

async function fetchPublic(path: string) {
  const res = await fetch(`${API_BASE}${path}`)
  return res.json()
}

interface DayAvail { estado: string; disponibles: number; total_slots: number }
interface SlotAvail { id: number; hora: string; disponibles: number; capacidad: number }

// ── PayPal Smart Buttons for Partner ──
function PayPalPartnerButtons({ clientId, mode, tourData, onSuccess, onError }: {
  clientId: string; mode: string; tourData: Record<string, any>;
  onSuccess: (tourId: number) => void; onError: (msg: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [sdkReady, setSdkReady] = useState(false)
  const tourIdRef = useRef<number>(0)

  useEffect(() => {
    if (document.getElementById('paypal-sdk')) {
      setSdkReady(true)
      setLoading(false)
      return
    }
    const script = document.createElement('script')
    script.id = 'paypal-sdk'
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD&intent=capture&enable-funding=card`
    script.async = true
    script.onload = () => { setSdkReady(true); setLoading(false) }
    script.onerror = () => { onError('Error cargando PayPal SDK'); setLoading(false) }
    document.body.appendChild(script)
  }, [clientId])

  useEffect(() => {
    if (!sdkReady || !containerRef.current || !(window as any).paypal) return
    containerRef.current.innerHTML = ''
    ;(window as any).paypal.Buttons({
      style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal', height: 45 },
      createOrder: async () => {
        try {
          const res = await partnerPayPalCreateOrder(tourData)
          if (res.success && res.data?.orderID) {
            tourIdRef.current = res.data.tourId
            return res.data.orderID
          }
          throw new Error(res.error?.message || 'Error creando orden PayPal')
        } catch (err: any) {
          onError(err.message || 'Error al crear orden de pago')
          throw err
        }
      },
      onApprove: async (data: any) => {
        try {
          const res = await partnerPayPalCaptureOrder(data.orderID, tourIdRef.current)
          if (res.success) {
            onSuccess(tourIdRef.current)
          } else {
            onError(res.error?.message || 'Error al capturar pago')
          }
        } catch (err: any) {
          onError(err.message || 'Error procesando pago')
        }
      },
      onError: (err: any) => {
        console.error('PayPal error:', err)
        onError('Error en el pago con PayPal')
      },
      onCancel: () => {},
    }).render(containerRef.current)
  }, [sdkReady, JSON.stringify(tourData)])

  return (
    <div className="space-y-3">
      {loading && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          <span className="ml-2 text-sm text-gray-500">Cargando métodos de pago...</span>
        </div>
      )}
      <div ref={containerRef} className={loading ? 'hidden' : ''} />
      <p className="text-[10px] text-center text-gray-400">
        Pago seguro procesado por PayPal. Puedes pagar con tarjeta de crédito, débito o tu cuenta PayPal.
      </p>
    </div>
  )
}

export default function PartnerTourRequest() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [step, setStep] = useState(1) // 1=activity, 2=calendar, 3=slots, 4=details, 5=confirm
  const [actividades, setActividades] = useState<Actividad[]>([])
  const [loadingActs, setLoadingActs] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const [selectedAct, setSelectedAct] = useState<Actividad | null>(null)

  // Calendar state
  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1)
  const [dias, setDias] = useState<Record<string, DayAvail>>({})
  const [selectedDate, setSelectedDate] = useState('')

  // Slot state
  const [slots, setSlots] = useState<SlotAvail[]>([])
  const [selectedSlot, setSelectedSlot] = useState<SlotAvail | null>(null)
  const [loadingSlots, setLoadingSlots] = useState(false)

  const [form, setForm] = useState({
    cliente: '',
    whatsapp: '',
    email: '',
    hotel: '',
    nacionalidad: '',
    idioma: '',
    edades: '',
    pax: '1',
    notas: '',
    vendedor_nombre: user?.nombre || '',
    habitacion: '',
  })

  const [searchQuery, setSearchQuery] = useState('')

  // Payment method state
  const [paymentMethod, setPaymentMethod] = useState<'comprobante' | 'paypal'>('comprobante')
  const [paypalConfig, setPaypalConfig] = useState<{ paypal_enabled: boolean; paypal_client_id: string | null; paypal_mode: string }>({ paypal_enabled: false, paypal_client_id: null, paypal_mode: 'sandbox' })

  // Comprobante upload
  const [comprobanteFile, setComprobanteFile] = useState<File | null>(null)
  const [comprobantePreview, setComprobantePreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getActividades().then(res => {
      if (res.success) {
        setActividades(res.data.filter(a => a.activa))
      }
      setLoadingActs(false)
    })
    // Load PayPal config
    getPartnerPayPalConfig().then(res => {
      if (res.success) setPaypalConfig(res.data)
    })
  }, [])

  // Load month availability when product selected
  const monthStr = `${viewYear}-${String(viewMonth).padStart(2, '0')}`
  useEffect(() => {
    if (!selectedAct?.slug) return
    fetchPublic(`/disponibilidad/${selectedAct.slug}?mes=${monthStr}`).then(res => {
      if (res.success) setDias(res.data.dias || {})
    }).catch(() => {})
  }, [selectedAct, monthStr])

  // Calendar helpers
  const navigateMonth = (dir: number) => {
    let m = viewMonth + dir, y = viewYear
    if (m > 12) { m = 1; y++ }
    if (m < 1) { m = 12; y-- }
    setViewMonth(m); setViewYear(y)
  }
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate()
  const firstDay = new Date(viewYear, viewMonth - 1, 1).getDay()

  // Load day slots
  const loadSlots = useCallback(async (fecha: string) => {
    if (!selectedAct?.slug) return
    setLoadingSlots(true)
    const res = await fetchPublic(`/slots/${selectedAct.slug}?fecha=${fecha}`)
    if (res.success) {
      setSlots(res.data.slots.filter((s: SlotAvail) => s.disponibles > 0))
    }
    setLoadingSlots(false)
  }, [selectedAct])

  const handleSelectDate = (dateStr: string) => {
    const info = dias[dateStr]
    if (!info || info.estado !== 'disponible') return
    setSelectedDate(dateStr)
    loadSlots(dateStr)
    setStep(3) // go to slots
  }

  const handleSelectSlot = (slot: SlotAvail) => {
    setSelectedSlot(slot)
    setStep(4) // go to details form
  }

  const handleSelectActivity = (act: Actividad) => {
    setSelectedAct(act)
    setStep(2)
  }



  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setComprobanteFile(file)
      const reader = new FileReader()
      reader.onload = (ev) => {
        setComprobantePreview(ev.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const removeComprobante = () => {
    setComprobanteFile(null)
    setComprobantePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Build tour data object (shared between comprobante and PayPal flows)
  const buildTourData = (comprobanteUrl?: string) => {
    const data: any = {
      cliente: form.cliente,
      whatsapp: form.whatsapp,
      actividad: selectedAct!.nombre,
      fecha: selectedDate,
      hora: selectedSlot?.hora || '',
      notas: form.notas,
      pax: parseInt(form.pax) || 1,
      email_cliente: form.email,
      hotel: `${form.hotel} - Hab/Apto: ${form.habitacion}`,
      nacionalidad: form.nacionalidad,
      idioma: form.idioma,
      edades: form.edades,
      solicitado_por: form.vendedor_nombre,
      gestionado_por: user?.nombre || 'Partner',
    }
    if (comprobanteUrl) data.comprobante_url = comprobanteUrl
    if (selectedSlot) data.slot_id = selectedSlot.id
    return data
  }

  // Validate form fields (shared)
  const validateForm = (): boolean => {
    const requiredFields = ['cliente', 'whatsapp', 'email', 'hotel', 'habitacion', 'nacionalidad', 'idioma', 'edades', 'notas', 'vendedor_nombre']
    const missingFields = requiredFields.filter(f => !form[f as keyof typeof form]?.trim())
    if (missingFields.length > 0 || !selectedAct) {
      setResult({ type: 'error', message: 'Todos los campos son obligatorios' })
      return false
    }
    if (!selectedDate) {
      setResult({ type: 'error', message: 'Debes seleccionar una fecha' })
      return false
    }
    return true
  }

  // Comprobante submit flow (original)
  const handleSubmitComprobante = async () => {
    if (!validateForm() || !comprobanteFile) {
      setResult({ type: 'error', message: 'Todos los campos y el comprobante de pago son obligatorios' })
      return
    }
    setSaving(true)
    setResult(null)

    try {
      setUploading(true)
      const uploadRes = await uploadFile(comprobanteFile)
      setUploading(false)

      if (!uploadRes.success) {
        setResult({ type: 'error', message: uploadRes.error?.message || 'Error al subir comprobante' })
        setSaving(false)
        return
      }

      const data = buildTourData(uploadRes.data.url)
      const res = await createTour(data)
      if (res.success) {
        setResult({ type: 'success', message: `¡Tour solicitado! ID: ${res.data?.id}. Mahana lo confirmará pronto.` })
        setStep(5)
      } else {
        setResult({ type: 'error', message: res.error?.message || 'Error al solicitar tour' })
      }
    } catch {
      setResult({ type: 'error', message: 'Error de conexión' })
    }
    setSaving(false)
  }

  // PayPal success handler
  const handlePayPalSuccess = (tourId: number) => {
    setResult({ type: 'success', message: `¡Tour #${tourId} pagado exitosamente con PayPal! Mahana gestionará tu comisión.` })
    setStep(5)
  }

  const handlePayPalError = (msg: string) => {
    setResult({ type: 'error', message: msg })
  }

  // Check if form is valid for PayPal (no comprobante needed)
  const isFormValidForPayPal = () => {
    const requiredFields = ['cliente', 'whatsapp', 'email', 'hotel', 'habitacion', 'nacionalidad', 'idioma', 'edades', 'notas', 'vendedor_nombre']
    return requiredFields.every(f => form[f as keyof typeof form]?.trim()) && selectedAct && selectedDate
  }

  const onChange = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }))

  const today = new Date().toISOString().split('T')[0]

  // Group activities by category
  const groupedActivities = actividades.reduce((acc, act) => {
    const cat = act.categoria || 'Otros'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(act)
    return acc
  }, {} as Record<string, Actividad[]>)

  // Filter by search query
  const filteredGroups = searchQuery.trim()
    ? Object.entries(groupedActivities).reduce((acc, [cat, acts]) => {
        const filtered = acts.filter(a => a.nombre.toLowerCase().includes(searchQuery.toLowerCase()))
        if (filtered.length > 0) acc[cat] = filtered
        return acc
      }, {} as Record<string, Actividad[]>)
    : groupedActivities

  if (loadingActs) {
    return <div className="flex items-center justify-center h-60"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => step > 1 && !result ? setStep(step - 1) : navigate('/')} className="p-2 rounded-lg hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-blue-900">Solicitar Tour</h1>
          <p className="text-sm text-gray-500">
            {step === 1 && 'Paso 1: Elige una actividad'}
            {step === 2 && 'Paso 2: Selecciona fecha'}
            {step === 3 && 'Paso 3: Elige horario'}
            {step === 4 && 'Paso 4: Datos del cliente y pago'}
            {step === 5 && '¡Solicitud enviada!'}
          </p>
        </div>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4].map(s => (
          <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${s <= step ? 'bg-blue-600' : 'bg-gray-200'}`} />
        ))}
      </div>

      {/* Result */}
      {result && (
        <div className={`flex items-center gap-3 px-4 py-4 rounded-xl ${result.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {result.type === 'success' ? <CheckCircle className="w-6 h-6 flex-shrink-0" /> : <AlertCircle className="w-6 h-6 flex-shrink-0" />}
          <div>
            <p className="font-medium">{result.message}</p>
            {result.type === 'success' && (
              <button onClick={() => navigate('/reservas')} className="text-sm underline mt-1 hover:opacity-80">Ver mis reservas →</button>
            )}
          </div>
        </div>
      )}

      {/* Step 1: Select Activity — Grouped by Category */}
      {step === 1 && (
        <div className="space-y-4">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar por nombre de actividad..."
              className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm"
            />
          </div>

          {Object.entries(filteredGroups).map(([category, acts]) => (
            <div key={category}>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                {category}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {acts.map(act => (
                  <button
                    key={act.id}
                    onClick={() => handleSelectActivity(act)}
                    className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:border-blue-300 hover:shadow-md transition-all text-left group"
                  >
                    <div className="flex items-start gap-3">
                      {act.imagen_url ? (
                        <img src={act.imagen_url} alt={act.nombre} className="w-14 h-14 rounded-lg object-cover shadow-sm ring-1 ring-gray-200 flex-shrink-0" />
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-gray-100 to-gray-50 flex items-center justify-center flex-shrink-0 ring-1 ring-gray-200">
                          <ImageIcon className="w-6 h-6 text-gray-300" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">{act.nombre}</h3>
                        {act.precio_base != null && act.precio_base > 0 && (
                          <span className="text-sm text-emerald-600 font-medium">${act.precio_base}</span>
                        )}
                        <div className="mt-1.5 space-y-0.5 text-sm text-gray-500">
                          {act.duracion && <p className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {act.duracion}</p>}
                          {act.punto_encuentro && <p className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {act.punto_encuentro}</p>}
                          {act.capacidad_max && <p className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Max {act.capacidad_max} personas</p>}
                        </div>
                      </div>
                    </div>
                    {act.descripcion && <p className="text-xs text-gray-400 mt-2 line-clamp-2">{act.descripcion}</p>}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {Object.keys(filteredGroups).length === 0 && searchQuery && (
            <div className="text-center py-8 text-gray-400">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No se encontraron actividades para "{searchQuery}"</p>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Monthly Calendar */}
      {step === 2 && selectedAct && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {/* Product header */}
          <div className="flex items-center gap-3 p-4 border-b border-gray-100">
            {selectedAct.imagen_url ? (
              <img src={selectedAct.imagen_url} alt="" className="w-12 h-12 rounded-lg object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-lg">
                {selectedAct.nombre.charAt(0)}
              </div>
            )}
            <div>
              <h3 className="font-semibold text-gray-900">{selectedAct.nombre}</h3>
              <p className="text-sm text-gray-500">{selectedAct.duracion} {selectedAct.precio_base ? `· $${selectedAct.precio_base}` : ''}</p>
            </div>
          </div>

          <div className="p-4">
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => navigateMonth(-1)} className="p-2 rounded-lg hover:bg-gray-100">
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
              <h3 className="text-lg font-semibold text-gray-900">{MONTHS[viewMonth - 1]} {viewYear}</h3>
              <button onClick={() => navigateMonth(1)} className="p-2 rounded-lg hover:bg-gray-100">
                <ChevronRight className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 mb-2">
              {DAYS_HEADER.map(d => (
                <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`e-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1
                const dateStr = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                const info = dias[dateStr]
                const available = info?.estado === 'disponible'
                const past = new Date(dateStr) < new Date(new Date().toDateString())
                return (
                  <button key={day} disabled={!available || past}
                    onClick={() => handleSelectDate(dateStr)}
                    className={`aspect-square rounded-lg flex flex-col items-center justify-center text-sm font-medium transition-all
                      ${available && !past ? 'hover:bg-blue-50 hover:border-blue-300 border border-gray-200 cursor-pointer text-gray-900' : ''}
                      ${past || !info ? 'text-gray-300 cursor-default' : ''}
                      ${info && !available && !past ? 'text-gray-400 cursor-default' : ''}
                      ${selectedDate === dateStr ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700' : ''}`}
                  >
                    <span>{day}</span>
                    {available && !past && <span className="text-[8px] text-blue-500 -mt-0.5">{info.disponibles}</span>}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="px-4 pb-3 flex items-center gap-4 text-[10px] text-gray-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Disponible</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300" /> Sin cupos</span>
          </div>
        </div>
      )}

      {/* Step 3: Select Slot */}
      {step === 3 && selectedAct && (
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
            <Calendar className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="font-semibold text-gray-900">{selectedAct.nombre}</h3>
              <p className="text-sm text-blue-600">{selectedDate}</p>
            </div>
          </div>

          <p className="text-sm font-medium text-gray-700">Horarios disponibles</p>
          {loadingSlots ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
          ) : slots.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {slots.map(slot => (
                <button key={slot.id} onClick={() => handleSelectSlot(slot)}
                  className="p-3 border border-gray-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all text-center group">
                  <p className="font-semibold text-gray-900 group-hover:text-blue-700">{slot.hora}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{slot.disponibles} de {slot.capacidad} cupos</p>
                  <div className="w-full bg-gray-200 rounded-full h-1 mt-1.5">
                    <div className="bg-blue-500 rounded-full h-1 transition-all"
                      style={{ width: `${((slot.capacidad - slot.disponibles) / slot.capacidad) * 100}%` }} />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-gray-400">
              <p>No hay horarios disponibles para esta fecha</p>
              <button onClick={() => { setStep(2); setSelectedDate('') }}
                className="mt-3 text-blue-600 font-medium text-sm hover:underline">← Elegir otra fecha</button>
            </div>
          )}
        </div>
      )}

      {/* Step 4: Client Details + Comprobante */}
      {step === 4 && (
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-5">
          {/* Summary */}
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
            <p className="font-semibold text-blue-900">{selectedAct?.nombre}</p>
            <p className="text-sm text-blue-700">
              {selectedSlot ? `${selectedDate} a las ${selectedSlot.hora}` : selectedDate || 'Sin fecha definida'}
              {selectedSlot && ` · ${selectedSlot.disponibles} cupos disponibles`}
            </p>
          </div>

          {/* Solicitado por (Partner info - editable) */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-center gap-3 mb-3">
              <UserCircle className="w-8 h-8 text-blue-600 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">Información del solicitante</p>
                <p className="text-sm text-gray-500">{user?.email} · {user?.vendedor}</p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vendedor (persona que vendió el tour) *</label>
              <input
                required
                value={form.vendedor_nombre}
                onChange={e => onChange('vendedor_nombre', e.target.value)}
                className={`w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${!form.vendedor_nombre.trim() ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                placeholder="Nombre del vendedor"
              />
            </div>
          </div>

          {/* Basic info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del cliente *</label>
              <input
                required
                value={form.cliente}
                onChange={e => onChange('cliente', e.target.value)}
                className={`w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${!form.cliente.trim() ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                placeholder="Nombre completo"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp *</label>
              <input
                required
                value={form.whatsapp}
                onChange={e => onChange('whatsapp', e.target.value)}
                className={`w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${!form.whatsapp.trim() ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                placeholder="+507..."
              />
            </div>
          </div>

          {/* Extra client fields */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={e => onChange('email', e.target.value)}
                className={`w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${!form.email.trim() ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                placeholder="cliente@email.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hotel / Alojamiento *</label>
              <input
                required
                value={form.hotel}
                onChange={e => onChange('hotel', e.target.value)}
                className={`w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${!form.hotel.trim() ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                placeholder="Ej: PH Playa Caracol"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Habitación / Apto *</label>
              <input
                required
                value={form.habitacion}
                onChange={e => onChange('habitacion', e.target.value)}
                className={`w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${!form.habitacion.trim() ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                placeholder="Ej: Torre 2 Apto 3B"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nacionalidad *</label>
              <input
                required
                value={form.nacionalidad}
                onChange={e => onChange('nacionalidad', e.target.value)}
                className={`w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${!form.nacionalidad.trim() ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                placeholder="Ej: Panamá"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Idioma *</label>
              <select
                required
                value={form.idioma}
                onChange={e => onChange('idioma', e.target.value)}
                className={`w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${!form.idioma ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
              >
                <option value="">Seleccionar *</option>
                <option value="Español">Español</option>
                <option value="English">English</option>
                <option value="Français">Français</option>
                <option value="Otro">Otro</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1"># Personas *</label>
              <input
                type="number"
                required
                min="1"
                max={selectedSlot ? selectedSlot.disponibles : 20}
                value={form.pax}
                onChange={e => onChange('pax', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Edades de los participantes *</label>
            <input
              required
              value={form.edades}
              onChange={e => onChange('edades', e.target.value)}
              className={`w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${!form.edades.trim() ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
              placeholder="Ej: 25, 30, 8, 5"
            />
          </div>

          {!selectedDate && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha deseada</label>
              <input
                type="date"
                min={today}
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas *</label>
            <textarea
              rows={3}
              required
              value={form.notas}
              onChange={e => onChange('notas', e.target.value)}
              className={`w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none ${!form.notas.trim() ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
              placeholder="Lugar de salida, punto de recogida, detalles importantes, alergias, restricciones..."
            />
            <p className="text-xs text-gray-400 mt-1">⚠️ Incluir siempre: lugar de salida y detalles del tour</p>
          </div>
          {/* ── Financial Breakdown ── */}
          {selectedAct && (selectedAct.precio_base || 0) > 0 && (
            <div className="border-t border-gray-100 pt-5">
              <label className="block text-sm font-semibold text-gray-800 mb-3">💰 Resumen Financiero</label>
              {(() => {
                const precioBase = selectedAct.precio_base || 0
                const pax = parseInt(form.pax) || 1
                const comPct = selectedAct.comision_caracol_pct || 20
                const subtotal = precioBase * pax
                const itbmCliente = Math.round(subtotal * 0.07 * 100) / 100
                const totalCliente = Math.round((subtotal + itbmCliente) * 100) / 100
                const comisionPartner = Math.round(subtotal * comPct / 100 * 100) / 100
                const baseMahana = Math.round((subtotal - comisionPartner) * 100) / 100
                const itbmMahana = Math.round(baseMahana * 0.07 * 100) / 100
                const totalMahana = Math.round((baseMahana + itbmMahana) * 100) / 100
                return (
                  <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl border border-slate-200 overflow-hidden">
                    {/* Client pays */}
                    <div className="p-4 space-y-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">El cliente paga</p>
                      <div className="flex justify-between text-sm text-gray-600">
                        <span>{selectedAct.nombre} × {pax} pax</span>
                        <span>${subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-gray-600">
                        <span>ITBM (7%)</span>
                        <span>${itbmCliente.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-gray-900 text-base pt-1 border-t border-slate-200">
                        <span>Total cliente</span>
                        <span className="text-emerald-700">${totalCliente.toFixed(2)}</span>
                      </div>
                    </div>

                    {/* Partner commission */}
                    <div className="px-4 py-3 bg-emerald-50 border-y border-emerald-200 space-y-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-emerald-600 font-semibold">Tu comisión ({comPct}%)</p>
                      <div className="flex justify-between font-bold text-emerald-700 text-base">
                        <span>Retienes</span>
                        <span>${comisionPartner.toFixed(2)}</span>
                      </div>
                    </div>

                    {/* Mahana invoices */}
                    <div className="p-4 space-y-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-blue-500 font-semibold">Mahana te factura (CxC)</p>
                      <div className="flex justify-between text-sm text-gray-600">
                        <span>Base ({selectedAct.nombre} - comisión)</span>
                        <span>${baseMahana.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-gray-600">
                        <span>ITBM (7%)</span>
                        <span>${itbmMahana.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-blue-800 text-base pt-1 border-t border-slate-200">
                        <span>Total a facturar</span>
                        <span>${totalMahana.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {/* Payment Method Selector */}
          <div className="border-t border-gray-100 pt-5">
            <label className="block text-sm font-medium text-gray-700 mb-3">Método de pago</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPaymentMethod('comprobante')}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  paymentMethod === 'comprobante'
                    ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Upload className={`w-5 h-5 ${paymentMethod === 'comprobante' ? 'text-blue-600' : 'text-gray-400'}`} />
                  <span className={`text-sm font-semibold ${paymentMethod === 'comprobante' ? 'text-blue-700' : 'text-gray-700'}`}>Comprobante</span>
                </div>
                <p className="text-[11px] text-gray-500">Subir foto del comprobante. Mahana cobra después.</p>
              </button>

              {paypalConfig.paypal_enabled && paypalConfig.paypal_client_id && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod('paypal')}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    paymentMethod === 'paypal'
                      ? 'border-yellow-500 bg-yellow-50 ring-1 ring-yellow-200'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <CreditCard className={`w-5 h-5 ${paymentMethod === 'paypal' ? 'text-yellow-600' : 'text-gray-400'}`} />
                    <span className={`text-sm font-semibold ${paymentMethod === 'paypal' ? 'text-yellow-700' : 'text-gray-700'}`}>PayPal / Tarjeta</span>
                  </div>
                  <p className="text-[11px] text-gray-500">Pagar ahora. Sin cobro pendiente.</p>
                </button>
              )}
            </div>
          </div>

          {/* Comprobante Upload (when comprobante method selected) */}
          {paymentMethod === 'comprobante' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Comprobante de pago *
                <span className="text-gray-400 font-normal ml-1">(obligatorio)</span>
              </label>
              
              {!comprobantePreview ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all group"
                >
                  <Upload className="w-10 h-10 text-gray-300 mx-auto mb-3 group-hover:text-blue-400 transition-colors" />
                  <p className="text-sm font-medium text-gray-600 group-hover:text-blue-600">
                    Haz clic para subir foto del comprobante
                  </p>
                  <p className="text-xs text-gray-400 mt-1">JPG, PNG o PDF — Máx 10MB</p>
                </div>
              ) : (
                <div className="relative border border-gray-200 rounded-xl overflow-hidden">
                  <img src={comprobantePreview} alt="Comprobante" className="w-full max-h-64 object-contain bg-gray-50" />
                  <button
                    onClick={removeComprobante}
                    className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <div className="px-4 py-2 bg-green-50 border-t border-green-100 flex items-center gap-2">
                    <Image className="w-4 h-4 text-green-600" />
                    <span className="text-sm text-green-700 font-medium">{comprobanteFile?.name}</span>
                    <span className="text-xs text-green-500 ml-auto">{comprobanteFile ? `${(comprobanteFile.size / 1024).toFixed(0)} KB` : ''}</span>
                  </div>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                onChange={handleFileChange}
                className="hidden"
              />
              {!comprobanteFile && (
                <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Debes subir un comprobante de pago para continuar
                </p>
              )}
            </div>
          )}

          {/* PayPal Buttons (when PayPal method selected) */}
          {paymentMethod === 'paypal' && paypalConfig.paypal_enabled && paypalConfig.paypal_client_id && (
            <div className="space-y-4">
              {/* Price summary */}
              <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
                <p className="text-[11px] text-yellow-600 mb-2">
                  {selectedAct?.nombre} × {form.pax || 1} persona{(parseInt(form.pax) || 1) !== 1 ? 's' : ''}
                </p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-yellow-700">
                    <span>Subtotal:</span>
                    <span>${((selectedAct?.precio_base || 0) * (parseInt(form.pax) || 1)).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-yellow-700">
                    <span>ITBM (7%):</span>
                    <span>${(((selectedAct?.precio_base || 0) * (parseInt(form.pax) || 1)) * 0.07).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-yellow-900 text-lg pt-1 border-t border-yellow-200">
                    <span>Total:</span>
                    <span>${(((selectedAct?.precio_base || 0) * (parseInt(form.pax) || 1)) * 1.07).toFixed(2)} USD</span>
                  </div>
                </div>
              </div>

              {!isFormValidForPayPal() ? (
                <div className="bg-gray-50 rounded-xl p-4 text-center">
                  <AlertCircle className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Completa todos los campos obligatorios para habilitar el pago</p>
                </div>
              ) : (
                <PayPalPartnerButtons
                  clientId={paypalConfig.paypal_client_id!}
                  mode={paypalConfig.paypal_mode}
                  tourData={buildTourData()}
                  onSuccess={handlePayPalSuccess}
                  onError={handlePayPalError}
                />
              )}
            </div>
          )}

          {/* Action Buttons (only for comprobante method) */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="px-4 py-2.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
            >
              Atrás
            </button>
            {paymentMethod === 'comprobante' && (
              <button
                onClick={handleSubmitComprobante}
                disabled={saving || !form.cliente.trim() || !form.whatsapp.trim() || !form.email.trim() || !form.hotel.trim() || !form.habitacion.trim() || !form.nacionalidad.trim() || !form.idioma || !form.edades.trim() || !form.notas.trim() || !form.vendedor_nombre.trim() || !comprobanteFile}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 shadow-md shadow-blue-600/30"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {uploading ? 'Subiendo comprobante...' : 'Solicitar Tour'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Step 5: Success */}
      {step === 5 && result?.type === 'success' && (
        <div className="text-center py-8">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">¡Solicitud Enviada!</h2>
          <p className="text-gray-500 mb-6">Mahana Tours confirmará tu reserva pronto</p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => navigate('/reservas')}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 shadow-md"
            >
              Ver Mis Reservas
            </button>
            <button
              onClick={() => { setStep(1); setSelectedAct(null); setSelectedSlot(null); setSelectedDate(''); setResult(null); setComprobanteFile(null); setComprobantePreview(null); setForm({ cliente: '', whatsapp: '', email: '', hotel: '', habitacion: '', nacionalidad: '', idioma: '', edades: '', pax: '1', notas: '', vendedor_nombre: user?.nombre || '' }) }}
              className="px-5 py-2.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
            >
              Solicitar Otro
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
