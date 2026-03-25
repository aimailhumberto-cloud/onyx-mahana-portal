import { useState, useEffect, useCallback } from 'react'
import {
  getActividades, getDisponibilidad,
  createSlot, updateSlot, deleteSlot,
  getPlantillas, createPlantilla, deletePlantilla,
  generarSlotsMes, getBloqueos, createBloqueo, deleteBloqueo
} from '../api/api'
import type { Actividad, Slot, Plantilla, Bloqueo } from '../api/api'
import {
  Loader2, Plus, Trash2, Lock, Unlock, Calendar, Clock, ChevronLeft, ChevronRight,
  AlertCircle, CheckCircle, Edit3, X, Save, Zap, Ban, Settings
} from 'lucide-react'

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const DAYS_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function generateTimeSlots(from: string, to: string, intervalMin: number): string[] {
  const times: string[] = []
  const [fh, fm] = from.split(':').map(Number)
  const [th, tm] = to.split(':').map(Number)
  let current = fh * 60 + fm
  const end = th * 60 + tm
  while (current <= end) {
    const h = String(Math.floor(current / 60)).padStart(2, '0')
    const m = String(current % 60).padStart(2, '0')
    times.push(`${h}:${m}`)
    current += intervalMin
  }
  return times
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay()
}

export default function DisponibilidadAdmin() {
  const [actividades, setActividades] = useState<Actividad[]>([])
  const [selectedActId, setSelectedActId] = useState<number | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [plantillas, setPlantillas] = useState<Plantilla[]>([])
  const [bloqueos, setBloqueos] = useState<Bloqueo[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'calendario' | 'plantillas' | 'config'>('calendario')
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Calendar state
  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // Sidebar panel for day detail
  const [daySlots, setDaySlots] = useState<Slot[]>([])

  // Quick-add slot
  const [quickHora, setQuickHora] = useState('08:00')
  const [quickCapacidad, setQuickCapacidad] = useState('6')
  const [creating, setCreating] = useState(false)

  // Edit slot
  const [editingSlotId, setEditingSlotId] = useState<number | null>(null)
  const [editSlotData, setEditSlotData] = useState({ hora: '', capacidad: '' })

  // Plantilla form
  const [showNewPlantilla, setShowNewPlantilla] = useState(false)
  const [newPlantilla, setNewPlantilla] = useState({
    actividad_id: '', dias_semana: [] as number[],
    hora_desde: '08:00', hora_hasta: '16:00', intervalo: '60', capacidad: '6'
  })

  // Bloqueo form
  const [showBloqueoForm, setShowBloqueoForm] = useState(false)
  const [bloqueoMotivo, setBloqueoMotivo] = useState('')

  // Generate month
  const [generating, setGenerating] = useState(false)

  const selectedAct = actividades.find(a => a.id === selectedActId) || null
  const todayStr = new Date().toISOString().split('T')[0]

  // Computed: month string
  const monthStr = `${viewYear}-${String(viewMonth).padStart(2, '0')}`
  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth)

  // ── Load data ──
  useEffect(() => {
    loadActividades()
  }, [])

  useEffect(() => {
    if (selectedActId) loadMonthData()
  }, [selectedActId, viewYear, viewMonth])

  useEffect(() => {
    if (selectedDate && selectedActId) {
      const ds = slots.filter(s => s.fecha === selectedDate && s.actividad_id === selectedActId)
      setDaySlots(ds.sort((a, b) => a.hora.localeCompare(b.hora)))
    } else {
      setDaySlots([])
    }
  }, [selectedDate, slots, selectedActId])

  const loadActividades = async () => {
    const res = await getActividades()
    if (res.success) {
      const active = res.data.filter(a => a.activa)
      setActividades(active)
      if (active.length > 0 && !selectedActId) {
        setSelectedActId(active[0].id)
      }
    }
    setLoading(false)
  }

  const loadMonthData = useCallback(async () => {
    if (!selectedActId) return
    const desde = `${monthStr}-01`
    const hasta = `${monthStr}-${String(daysInMonth).padStart(2, '0')}`

    // Auto-generate slots from plantillas
    try {
      await fetch('/api/v1/slots/auto-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('mahana_token')}`
        },
        body: JSON.stringify({ desde, hasta, actividad_id: selectedActId })
      })
    } catch {}

    // Load slots for the month (fetch each day)
    const promises: Promise<any>[] = []
    for (let d = 1; d <= daysInMonth; d++) {
      const fecha = `${monthStr}-${String(d).padStart(2, '0')}`
      promises.push(getDisponibilidad({ fecha }))
    }
    const results = await Promise.all(promises)
    const allSlots: Slot[] = []
    results.forEach(r => { if (r.success) allSlots.push(...r.data) })
    setSlots(allSlots)

    // Load bloqueos
    const blRes = await getBloqueos({ desde, hasta })
    if (blRes.success) setBloqueos(blRes.data)

    // Load plantillas
    const plRes = await getPlantillas()
    if (plRes.success) setPlantillas(plRes.data)
  }, [selectedActId, monthStr, daysInMonth])

  // Calendar navigation
  const navigateMonth = (dir: number) => {
    let m = viewMonth + dir
    let y = viewYear
    if (m > 12) { m = 1; y++ }
    if (m < 1) { m = 12; y-- }
    setViewMonth(m)
    setViewYear(y)
    setSelectedDate(null)
  }

  const goToday = () => {
    const now = new Date()
    setViewYear(now.getFullYear())
    setViewMonth(now.getMonth() + 1)
    setSelectedDate(todayStr)
  }

  // ── Slot CRUD ──
  const handleCreateSlot = async () => {
    if (!selectedActId || !selectedDate) return
    setCreating(true)
    try {
      const res = await createSlot({
        actividad_id: selectedActId,
        fecha: selectedDate,
        hora: quickHora,
        capacidad: parseInt(quickCapacidad) || 6,
      })
      if (res.success) {
        setResult({ type: 'success', message: '✅ Horario creado' })
        loadMonthData()
      } else {
        setResult({ type: 'error', message: res.error?.message || 'Error' })
      }
    } catch { setResult({ type: 'error', message: 'Error de conexión' }) }
    setCreating(false)
  }

  const handleSaveSlot = async (slotId: number) => {
    try {
      const res = await updateSlot(slotId, {
        hora: editSlotData.hora,
        capacidad: parseInt(editSlotData.capacidad) || 6,
      } as any)
      if (res.success) {
        setEditingSlotId(null)
        setResult({ type: 'success', message: '✅ Actualizado' })
        loadMonthData()
      }
    } catch { setResult({ type: 'error', message: 'Error' }) }
  }

  const handleToggleBlock = async (slot: Slot) => {
    const res = await updateSlot(slot.id, { bloqueado: slot.bloqueado ? 0 : 1 } as any)
    if (res.success) loadMonthData()
  }

  const handleDeleteSlot = async (id: number) => {
    if (!confirm('¿Eliminar este horario?')) return
    const res = await deleteSlot(id)
    if (res.success) loadMonthData()
  }

  // ── Bloqueos ──
  const handleCreateBloqueo = async () => {
    if (!selectedDate) return
    try {
      const res = await createBloqueo({
        actividad_id: selectedActId || undefined,
        fecha: selectedDate,
        motivo: bloqueoMotivo || undefined,
      })
      if (res.success) {
        setResult({ type: 'success', message: '✅ Día bloqueado' })
        setShowBloqueoForm(false)
        setBloqueoMotivo('')
        loadMonthData()
      }
    } catch { setResult({ type: 'error', message: 'Error' }) }
  }

  const handleDeleteBloqueo = async (id: number) => {
    const res = await deleteBloqueo(id)
    if (res.success) {
      setResult({ type: 'success', message: '✅ Bloqueo eliminado' })
      loadMonthData()
    }
  }

  // ── Plantillas ──
  const handleCreatePlantilla = async () => {
    if (!newPlantilla.actividad_id || newPlantilla.dias_semana.length === 0) return
    const times = generateTimeSlots(newPlantilla.hora_desde, newPlantilla.hora_hasta, parseInt(newPlantilla.intervalo) || 60)
    let created = 0, errors = 0
    for (const dia of newPlantilla.dias_semana) {
      for (const hora of times) {
        try {
          const res = await createPlantilla({
            actividad_id: parseInt(newPlantilla.actividad_id),
            dia_semana: dia, hora,
            capacidad: parseInt(newPlantilla.capacidad) || 6,
          })
          if (res.success) created++
          else errors++
        } catch { errors++ }
      }
    }
    if (created > 0) {
      setResult({ type: 'success', message: `✅ ${created} plantilla${created > 1 ? 's' : ''} creada${created > 1 ? 's' : ''}` })
      setShowNewPlantilla(false)
      setNewPlantilla({ actividad_id: '', dias_semana: [], hora_desde: '08:00', hora_hasta: '16:00', intervalo: '60', capacidad: '6' })
      loadMonthData()
    } else {
      setResult({ type: 'error', message: 'Error al crear plantillas' })
    }
  }

  const handleDeletePlantilla = async (id: number) => {
    if (!confirm('¿Eliminar esta plantilla?')) return
    const res = await deletePlantilla(id)
    if (res.success) { setResult({ type: 'success', message: '✅ Eliminada' }); loadMonthData() }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await generarSlotsMes({ mes: monthStr, actividad_id: selectedActId || undefined })
      if (res.success) {
        setResult({ type: 'success', message: `✅ ${res.data.created} horarios generados` })
        loadMonthData()
      } else {
        setResult({ type: 'error', message: res.error?.message || 'Error' })
      }
    } catch { setResult({ type: 'error', message: 'Error' }) }
    setGenerating(false)
  }

  // ── Calendar helpers ──
  const getDayInfo = (day: number) => {
    const dateStr = `${monthStr}-${String(day).padStart(2, '0')}`
    const daySlots = slots.filter(s => s.actividad_id === selectedActId && s.fecha === dateStr)
    const isBlocked = bloqueos.some(b => b.fecha === dateStr && (b.actividad_id === selectedActId || b.actividad_id === null))
    const totalCap = daySlots.reduce((s, sl) => s + sl.capacidad, 0)
    const totalRes = daySlots.reduce((s, sl) => s + sl.reservados, 0)
    const isPast = dateStr < todayStr
    return { dateStr, slots: daySlots, isBlocked, totalCap, totalRes, isPast, hasSlots: daySlots.length > 0 }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-60"><Loader2 className="w-8 h-8 animate-spin text-turquoise-600" /></div>
  }


  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-azul-900">Disponibilidad</h1>
          <p className="text-sm text-gray-500">Gestiona horarios y cupos por producto</p>
        </div>
        <div className="flex items-center gap-2">
          {[
            { key: 'calendario' as const, icon: Calendar, label: 'Calendario' },
            { key: 'plantillas' as const, icon: Clock, label: 'Plantillas' },
            { key: 'config' as const, icon: Settings, label: 'Config' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${tab === t.key ? 'bg-turquoise-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              <t.icon className="w-4 h-4" />{t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Producto selector */}
      <div className="bg-white rounded-xl shadow-sm p-3 border border-gray-100 space-y-2">
        <div className="flex items-center gap-3 overflow-x-auto pb-1">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider shrink-0">Producto:</span>
          {actividades.map(a => (
            <button key={a.id} onClick={() => { setSelectedActId(a.id); setSelectedDate(null) }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${selectedActId === a.id
                ? 'bg-turquoise-600 text-white shadow-sm'
                : 'bg-gray-50 text-gray-600 hover:bg-turquoise-50 hover:text-turquoise-700 border border-gray-200'}`}>
              {a.nombre}
            </button>
          ))}
        </div>
        {selectedAct?.slug && (
          <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
            <span className="text-xs text-gray-400">Página pública:</span>
            <a href={`/booking/${selectedAct.slug}`} target="_blank" rel="noopener noreferrer"
              className="px-3 py-1 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-all flex items-center gap-1.5"
              title={`Abrir /booking/${selectedAct.slug}`}>
              🌐 Ver Booking Page ↗
            </a>
            <code className="text-[10px] text-gray-400 ml-1">/booking/{selectedAct.slug}</code>
          </div>
        )}
      </div>

      {/* Result toast */}
      {result && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl ${result.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {result.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <span className="text-sm font-medium">{result.message}</span>
          <button onClick={() => setResult(null)} className="ml-auto text-sm opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* ════════════ TAB: CALENDARIO ════════════ */}
      {tab === 'calendario' && selectedAct && (
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Calendar grid */}
          <div className="flex-1">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Month navigation */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-turquoise-50 to-blue-50">
                <button onClick={() => navigateMonth(-1)} className="p-2 rounded-lg hover:bg-white/60 transition-colors"><ChevronLeft className="w-5 h-5 text-gray-600" /></button>
                <div className="text-center">
                  <p className="font-bold text-azul-900">{MONTHS[viewMonth - 1]} {viewYear}</p>
                  <p className="text-[10px] text-turquoise-600 font-medium">{selectedAct.nombre}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={goToday} className="text-xs text-turquoise-600 font-medium px-2 py-1 rounded bg-white/60 hover:bg-white transition-colors">Hoy</button>
                  <button onClick={() => navigateMonth(1)} className="p-2 rounded-lg hover:bg-white/60 transition-colors"><ChevronRight className="w-5 h-5 text-gray-600" /></button>
                </div>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 border-b border-gray-100">
                {DAYS.map(d => (
                  <div key={d} className="px-1 py-2 text-center text-xs font-semibold text-gray-400">{d}</div>
                ))}
              </div>

              {/* Calendar days */}
              <div className="grid grid-cols-7">
                {/* Empty cells for first day offset */}
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`empty-${i}`} className="aspect-square border-b border-r border-gray-50" />
                ))}
                {/* Actual days */}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1
                  const info = getDayInfo(day)
                  const isSelected = selectedDate === info.dateStr
                  const isToday = info.dateStr === todayStr

                  // Color coding
                  let bgClass = 'bg-white hover:bg-gray-50'
                  let dotColor = ''
                  if (info.isBlocked) {
                    bgClass = 'bg-red-50 hover:bg-red-100'
                    dotColor = 'bg-red-400'
                  } else if (info.isPast) {
                    bgClass = 'bg-gray-50/50'
                  } else if (info.hasSlots) {
                    const ratio = info.totalCap > 0 ? info.totalRes / info.totalCap : 0
                    if (ratio >= 1) { bgClass = 'bg-orange-50 hover:bg-orange-100'; dotColor = 'bg-orange-400' }
                    else if (ratio >= 0.7) { bgClass = 'bg-yellow-50 hover:bg-yellow-100'; dotColor = 'bg-yellow-400' }
                    else { bgClass = 'bg-green-50 hover:bg-green-100'; dotColor = 'bg-green-400' }
                  }

                  if (isSelected) bgClass = 'bg-turquoise-100 ring-2 ring-turquoise-500 ring-inset'

                  return (
                    <button key={day} onClick={() => setSelectedDate(info.dateStr)}
                      className={`aspect-square border-b border-r border-gray-50 p-1 text-left transition-all relative ${bgClass} ${info.isPast ? 'opacity-60' : 'cursor-pointer'}`}>
                      <span className={`text-xs font-medium ${isToday ? 'text-turquoise-600' : isSelected ? 'text-turquoise-800' : 'text-gray-700'}`}>
                        {day}
                      </span>
                      {isToday && <span className="absolute top-0.5 right-1 w-1.5 h-1.5 rounded-full bg-turquoise-500" />}
                      {dotColor && (
                        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-0.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                          {info.hasSlots && <span className="text-[8px] text-gray-400">{info.slots.length}</span>}
                        </div>
                      )}
                      {info.isBlocked && <Ban className="w-3 h-3 text-red-400 absolute bottom-1 right-1" />}
                    </button>
                  )
                })}
              </div>

              {/* Legend */}
              <div className="px-4 py-2 border-t border-gray-100 flex flex-wrap gap-3 text-[10px] text-gray-500">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400" /> Disponible</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400" /> +70%</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400" /> Lleno</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" /> Bloqueado</span>
              </div>
            </div>

            {/* Generate button */}
            <div className="mt-3 flex items-center gap-2">
              <button onClick={handleGenerate} disabled={generating}
                className="px-4 py-2 bg-turquoise-600 text-white rounded-lg text-sm font-medium hover:bg-turquoise-700 disabled:opacity-50 flex items-center gap-2 shadow-sm">
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Generar horarios del mes
              </button>
              <span className="text-xs text-gray-400">desde plantillas activas</span>
            </div>
          </div>

          {/* Day detail sidebar */}
          <div className="lg:w-80 shrink-0">
            {selectedDate ? (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden sticky top-4">
                <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-turquoise-50 to-white">
                  <p className="font-bold text-azul-900 text-sm">{selectedDate}</p>
                  <p className="text-xs text-gray-500">{selectedAct.nombre} · {daySlots.length} horario{daySlots.length !== 1 ? 's' : ''}</p>
                </div>

                {/* Bloqueos for this day */}
                {bloqueos.filter(b => b.fecha === selectedDate && (b.actividad_id === selectedActId || b.actividad_id === null)).map(b => (
                  <div key={b.id} className="px-4 py-2 bg-red-50 border-b border-red-100 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-red-700"><Ban className="w-3 h-3 inline mr-1" />Bloqueado{b.actividad_id ? '' : ' (global)'}</p>
                      {b.motivo && <p className="text-[10px] text-red-500">{b.motivo}</p>}
                    </div>
                    <button onClick={() => handleDeleteBloqueo(b.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}

                {/* Slots list */}
                <div className="divide-y divide-gray-50 max-h-[400px] overflow-y-auto">
                  {daySlots.length === 0 ? (
                    <div className="px-4 py-8 text-center text-gray-400">
                      <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm font-medium">Sin horarios</p>
                      <p className="text-xs mt-1">Agrega uno abajo</p>
                    </div>
                  ) : daySlots.map(s => {
                    const isEditing = editingSlotId === s.id
                    if (isEditing) {
                      return (
                        <div key={s.id} className="px-4 py-3 bg-blue-50">
                          <div className="flex items-center gap-2">
                            <input type="time" value={editSlotData.hora} onChange={e => setEditSlotData(prev => ({ ...prev, hora: e.target.value }))}
                              className="px-2 py-1 border border-gray-200 rounded text-sm w-28" />
                            <input type="number" value={editSlotData.capacidad} min="1" onChange={e => setEditSlotData(prev => ({ ...prev, capacidad: e.target.value }))}
                              className="px-2 py-1 border border-gray-200 rounded text-sm w-16" />
                            <button onClick={() => handleSaveSlot(s.id)} className="p-1 bg-turquoise-500 text-white rounded hover:bg-turquoise-600"><Save className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setEditingSlotId(null)} className="p-1 bg-gray-300 text-white rounded hover:bg-gray-400"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      )
                    }
                    const pct = s.capacidad > 0 ? (s.reservados / s.capacidad) * 100 : 0
                    return (
                      <div key={s.id} className={`px-4 py-2.5 flex items-center justify-between ${s.bloqueado ? 'bg-red-50/50 line-through opacity-60' : ''}`}>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-gray-900 w-14">{s.hora}</span>
                          <div className="flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-xs font-medium ${pct >= 100 ? 'text-orange-600' : pct >= 70 ? 'text-yellow-600' : 'text-green-600'}`}>
                                {s.reservados}/{s.capacidad}
                              </span>
                            </div>
                            <div className="w-20 h-1 bg-gray-200 rounded-full mt-0.5">
                              <div className={`h-1 rounded-full transition-all ${pct >= 100 ? 'bg-orange-400' : pct >= 70 ? 'bg-yellow-400' : 'bg-green-400'}`}
                                style={{ width: `${Math.min(pct, 100)}%` }} />
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5">
                          <button onClick={() => { setEditingSlotId(s.id); setEditSlotData({ hora: s.hora, capacidad: String(s.capacidad) }) }}
                            className="p-1 text-gray-400 hover:text-blue-600 rounded"><Edit3 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleToggleBlock(s)}
                            className="p-1 text-gray-400 hover:text-orange-600 rounded" title={s.bloqueado ? 'Desbloquear' : 'Bloquear'}>
                            {s.bloqueado ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={() => handleDeleteSlot(s.id)} className="p-1 text-gray-400 hover:text-red-600 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Add slot form */}
                <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50">
                  <p className="text-xs font-medium text-gray-500 mb-2"><Plus className="w-3 h-3 inline mr-1" />Agregar horario</p>
                  <div className="flex items-center gap-2">
                    <input type="time" value={quickHora} onChange={e => setQuickHora(e.target.value)}
                      className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm w-28 focus:ring-2 focus:ring-turquoise-500 focus:outline-none" />
                    <input type="number" value={quickCapacidad} min="1" onChange={e => setQuickCapacidad(e.target.value)}
                      className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm w-16 focus:ring-2 focus:ring-turquoise-500 focus:outline-none" placeholder="Cupos" />
                    <button onClick={handleCreateSlot} disabled={creating}
                      className="px-3 py-1.5 bg-turquoise-600 text-white rounded-lg text-sm font-medium hover:bg-turquoise-700 disabled:opacity-50">
                      {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Block day button */}
                <div className="px-4 py-3 border-t border-gray-100">
                  {!showBloqueoForm ? (
                    <button onClick={() => setShowBloqueoForm(true)}
                      className="w-full px-3 py-2 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 flex items-center justify-center gap-2">
                      <Ban className="w-4 h-4" /> Bloquear este día
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <input value={bloqueoMotivo} onChange={e => setBloqueoMotivo(e.target.value)} placeholder="Motivo (opcional)"
                        className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:outline-none" />
                      <div className="flex gap-2">
                        <button onClick={handleCreateBloqueo}
                          className="flex-1 px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">Bloquear</button>
                        <button onClick={() => setShowBloqueoForm(false)}
                          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-center text-gray-400">
                <Calendar className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium">Selecciona un día</p>
                <p className="text-xs mt-1">Haz clic en el calendario para ver y editar los horarios</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════ TAB: PLANTILLAS ════════════ */}
      {tab === 'plantillas' && (
        <>
          {/* Create plantilla form */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">Plantillas Semanales</h3>
                <p className="text-xs text-gray-400">Definen los horarios recurrentes de cada producto</p>
              </div>
              <button onClick={() => setShowNewPlantilla(!showNewPlantilla)}
                className={`text-sm font-medium flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors ${showNewPlantilla ? 'bg-gray-200 text-gray-700' : 'bg-turquoise-50 text-turquoise-600 hover:bg-turquoise-100'}`}>
                {showNewPlantilla ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {showNewPlantilla ? 'Cerrar' : 'Nueva'}
              </button>
            </div>

            {showNewPlantilla && (
              <div className="p-4 bg-turquoise-50/50 border-b border-turquoise-100 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <select value={newPlantilla.actividad_id} onChange={e => setNewPlantilla({ ...newPlantilla, actividad_id: e.target.value })}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-turquoise-500">
                    <option value="">Actividad...</option>
                    {actividades.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                  </select>
                  <input type="number" value={newPlantilla.capacidad} onChange={e => setNewPlantilla({ ...newPlantilla, capacidad: e.target.value })}
                    placeholder="Cupos" min="1" className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-turquoise-500" />
                </div>
                <div>
                  <p className="text-[11px] font-medium text-gray-500 mb-1.5">Días de la semana</p>
                  <div className="flex flex-wrap gap-1.5">
                    {DAYS_FULL.map((d, i) => {
                      const selected = newPlantilla.dias_semana.includes(i)
                      return (
                        <button key={i} type="button"
                          onClick={() => setNewPlantilla(prev => ({
                            ...prev,
                            dias_semana: selected ? prev.dias_semana.filter(x => x !== i) : [...prev.dias_semana, i]
                          }))}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${selected ? 'bg-turquoise-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:border-turquoise-300'}`}>
                          {d}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">Hora desde</label>
                    <input type="time" value={newPlantilla.hora_desde} onChange={e => setNewPlantilla({ ...newPlantilla, hora_desde: e.target.value })}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-turquoise-500" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">Hora hasta</label>
                    <input type="time" value={newPlantilla.hora_hasta} onChange={e => setNewPlantilla({ ...newPlantilla, hora_hasta: e.target.value })}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-turquoise-500" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">Intervalo</label>
                    <select value={newPlantilla.intervalo} onChange={e => setNewPlantilla({ ...newPlantilla, intervalo: e.target.value })}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-turquoise-500">
                      <option value="30">30 min</option>
                      <option value="60">1 hora</option>
                      <option value="90">1.5 horas</option>
                      <option value="120">2 horas</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-gray-400">
                    {newPlantilla.dias_semana.length > 0
                      ? (() => {
                        const times = generateTimeSlots(newPlantilla.hora_desde, newPlantilla.hora_hasta, parseInt(newPlantilla.intervalo) || 60)
                        return `${newPlantilla.dias_semana.length} día(s) × ${times.length} hora(s) = ${newPlantilla.dias_semana.length * times.length} plantilla(s)`
                      })()
                      : 'Selecciona días'}
                  </p>
                  <button onClick={handleCreatePlantilla} disabled={!newPlantilla.actividad_id || newPlantilla.dias_semana.length === 0}
                    className="px-5 py-2 bg-turquoise-600 text-white rounded-lg text-sm font-medium hover:bg-turquoise-700 disabled:opacity-50 shadow-sm">
                    Crear Plantillas
                  </button>
                </div>
              </div>
            )}

            {/* Plantillas list grouped by activity */}
            {plantillas.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <Clock className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="font-medium">No hay plantillas configuradas</p>
                <p className="text-sm mt-1">Crea una para generar horarios automáticamente</p>
              </div>
            ) : (() => {
              const grouped = plantillas.reduce((acc, p) => {
                const key = p.actividad_id
                if (!acc[key]) acc[key] = []
                acc[key].push(p)
                return acc
              }, {} as Record<number, Plantilla[]>)

              return (
                <div className="divide-y divide-gray-100">
                  {Object.entries(grouped).map(([actId, items]) => {
                    const actName = actividades.find(a => a.id === Number(actId))?.nombre || `#${actId}`
                    const byDay = items.reduce((acc, p) => {
                      if (!acc[p.dia_semana]) acc[p.dia_semana] = []
                      acc[p.dia_semana].push(p)
                      return acc
                    }, {} as Record<number, Plantilla[]>)

                    return (
                      <div key={actId} className="px-4 py-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-semibold text-gray-900 text-sm">{actName}</h4>
                          <span className="text-[10px] text-gray-400">{items.length} horario{items.length !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="grid grid-cols-7 gap-1.5">
                          {[0, 1, 2, 3, 4, 5, 6].map(dayIdx => {
                            const dayPls = byDay[dayIdx] || []
                            const hasSlots = dayPls.length > 0
                            return (
                              <div key={dayIdx} className={`rounded-lg p-2 text-center ${hasSlots ? 'bg-turquoise-50 border border-turquoise-200' : 'bg-gray-50 border border-gray-100'}`}>
                                <p className={`text-[10px] font-semibold mb-1 ${hasSlots ? 'text-turquoise-700' : 'text-gray-300'}`}>{DAYS[dayIdx]}</p>
                                {hasSlots ? (
                                  <div className="space-y-0.5">
                                    {dayPls.sort((a, b) => a.hora.localeCompare(b.hora)).map(pl => (
                                      <div key={pl.id} className="group relative">
                                        <div className="text-[10px] font-medium text-turquoise-800">{pl.hora}</div>
                                        <div className="text-[9px] text-turquoise-600">{pl.capacidad} cupos</div>
                                        <div className="hidden group-hover:flex absolute -top-1 -right-1 gap-0.5">
                                          <button onClick={() => handleDeletePlantilla(pl.id)}
                                            className="p-0.5 bg-white rounded shadow-sm border border-gray-200 text-gray-400 hover:text-red-600"><Trash2 className="w-2.5 h-2.5" /></button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-[9px] text-gray-300">—</p>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </>
      )}

      {/* ════════════ TAB: CONFIG ════════════ */}
      {tab === 'config' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="font-semibold text-azul-900 mb-4 flex items-center gap-2"><Settings className="w-5 h-5" /> Configuración de Reservas</h3>
          <p className="text-sm text-gray-500 mb-4">Estas configuraciones se aplicarán en las próximas fases (booking público, PayPal, etc.)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm font-medium text-gray-700">Anticipación mínima</p>
              <p className="text-xs text-gray-400">24 horas antes del tour</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm font-medium text-gray-700">Reservas hasta</p>
              <p className="text-xs text-gray-400">60 días en el futuro</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm font-medium text-gray-700">Auto-generación de slots</p>
              <p className="text-xs text-gray-400">60 días hacia el futuro</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm font-medium text-gray-700">PayPal</p>
              <p className="text-xs text-gray-400">No configurado — Fase 2</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
