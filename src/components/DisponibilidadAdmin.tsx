import { useState, useEffect } from 'react'
import { getActividades, getDisponibilidad, createSlot, updateSlot, deleteSlot, getPlantillas, createPlantilla, updatePlantilla, deletePlantilla, generarSlotsMes } from '../api/api'
import type { Actividad, Slot, Plantilla } from '../api/api'
import { Loader2, Plus, Trash2, Lock, Unlock, Calendar, Clock, ChevronLeft, ChevronRight, RefreshCw, AlertCircle, CheckCircle, Edit3, X, Save, Info, Zap } from 'lucide-react'

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const DAYS_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

function getWeekDates(startDate: string): string[] {
  const d = new Date(startDate + 'T12:00:00')
  const day = d.getDay()
  d.setDate(d.getDate() - day)
  const dates: string[] = []
  for (let i = 0; i < 7; i++) {
    dates.push(d.toISOString().split('T')[0])
    d.setDate(d.getDate() + 1)
  }
  return dates
}

function formatDateRange(dates: string[]): string {
  if (dates.length < 2) return dates[0] || ''
  const fmt = (d: string) => {
    const parts = d.split('-')
    return `${parts[2]}/${parts[1]}`
  }
  return `${fmt(dates[0])} — ${fmt(dates[dates.length - 1])}`
}

/** Generate array of times from start to end at interval minutes */
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

/** Get all dates between two dates inclusive */
function getDatesBetween(start: string, end: string): string[] {
  const dates: string[] = []
  const d = new Date(start + 'T12:00:00')
  const e = new Date(end + 'T12:00:00')
  while (d <= e) {
    dates.push(d.toISOString().split('T')[0])
    d.setDate(d.getDate() + 1)
  }
  return dates
}

export default function DisponibilidadAdmin() {
  const [actividades, setActividades] = useState<Actividad[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [plantillas, setPlantillas] = useState<Plantilla[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'semana' | 'plantillas'>('semana')
  const [currentDate, setCurrentDate] = useState(() => new Date().toISOString().split('T')[0])
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Bulk slot creation form
  const [showNewSlot, setShowNewSlot] = useState(false)
  const [bulkForm, setBulkForm] = useState({
    actividad_id: '',
    fecha_desde: '',
    fecha_hasta: '',
    hora_desde: '08:00',
    hora_hasta: '16:00',
    intervalo: '60',
    capacidad: '6',
  })
  const [creating, setCreating] = useState(false)

  // Quick-add from calendar click
  const [quickAdd, setQuickAdd] = useState<{ actividad_id: number; fecha: string } | null>(null)
  const [quickHora, setQuickHora] = useState('08:00')
  const [quickCapacidad, setQuickCapacidad] = useState('6')

  // Edit slot inline
  const [editingSlotId, setEditingSlotId] = useState<number | null>(null)
  const [editSlotData, setEditSlotData] = useState({ hora: '', capacidad: '' })

  // Plantilla form
  const [showNewPlantilla, setShowNewPlantilla] = useState(false)
  const [newPlantilla, setNewPlantilla] = useState({
    actividad_id: '', dias_semana: [] as number[],
    hora_desde: '08:00', hora_hasta: '16:00', intervalo: '60', capacidad: '6'
  })

  // Edit plantilla
  const [editingPlantillaId, setEditingPlantillaId] = useState<number | null>(null)
  const [editPlantillaData, setEditPlantillaData] = useState({ hora: '', capacidad: '' })

  // Generate month
  const [genMonth, setGenMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [generating, setGenerating] = useState(false)

  const weekDates = getWeekDates(currentDate)

  useEffect(() => { loadData() }, [currentDate])

  const loadData = async () => {
    setLoading(true)
    const [actsRes, plantRes] = await Promise.all([
      getActividades(),
      getPlantillas(),
    ])
    if (actsRes.success) setActividades(actsRes.data.filter(a => a.activa))
    if (plantRes.success) setPlantillas(plantRes.data)

    const promises = weekDates.map(d => getDisponibilidad({ fecha: d }))
    const results = await Promise.all(promises)
    const allSlots: Slot[] = []
    results.forEach(r => { if (r.success) allSlots.push(...r.data) })
    setSlots(allSlots)
    setLoading(false)
  }

  const navigateWeek = (dir: number) => {
    const d = new Date(currentDate + 'T12:00:00')
    d.setDate(d.getDate() + dir * 7)
    setCurrentDate(d.toISOString().split('T')[0])
  }

  const goToday = () => setCurrentDate(new Date().toISOString().split('T')[0])

  // ── Bulk create slots ──
  const handleBulkCreate = async () => {
    if (!bulkForm.actividad_id || !bulkForm.fecha_desde) return
    setCreating(true)
    setResult(null)

    const fechaHasta = bulkForm.fecha_hasta || bulkForm.fecha_desde
    const dates = getDatesBetween(bulkForm.fecha_desde, fechaHasta)
    const times = generateTimeSlots(bulkForm.hora_desde, bulkForm.hora_hasta, parseInt(bulkForm.intervalo) || 60)

    let created = 0
    let errors = 0

    for (const fecha of dates) {
      for (const hora of times) {
        try {
          const res = await createSlot({
            actividad_id: parseInt(bulkForm.actividad_id),
            fecha, hora,
            capacidad: parseInt(bulkForm.capacidad) || 6,
          })
          if (res.success) created++
          else errors++
        } catch { errors++ }
      }
    }

    if (created > 0) {
      setResult({ type: 'success', message: `✅ ${created} horarios creados${errors > 0 ? ` (${errors} duplicados omitidos)` : ''}` })
      setShowNewSlot(false)
      loadData()
    } else {
      setResult({ type: 'error', message: errors > 0 ? '⚠️ Todos los horarios ya existen' : 'Error al crear horarios' })
    }
    setCreating(false)
  }

  // ── Quick-add from calendar cell click ──
  const handleQuickAdd = async () => {
    if (!quickAdd) return
    try {
      const res = await createSlot({
        actividad_id: quickAdd.actividad_id,
        fecha: quickAdd.fecha,
        hora: quickHora,
        capacidad: parseInt(quickCapacidad) || 6,
      })
      if (res.success) {
        setResult({ type: 'success', message: '✅ Horario creado' })
        setQuickAdd(null)
        loadData()
      } else {
        setResult({ type: 'error', message: res.error?.message || 'Error' })
      }
    } catch { setResult({ type: 'error', message: 'Error de conexión' }) }
  }

  // ── Edit slot inline ──
  const handleEditSlot = (slot: Slot) => {
    setEditingSlotId(slot.id)
    setEditSlotData({ hora: slot.hora, capacidad: String(slot.capacidad) })
  }

  const handleSaveSlot = async (slotId: number) => {
    try {
      const res = await updateSlot(slotId, {
        hora: editSlotData.hora,
        capacidad: parseInt(editSlotData.capacidad) || 6,
      } as any)
      if (res.success) {
        setEditingSlotId(null)
        setResult({ type: 'success', message: '✅ Slot actualizado' })
        loadData()
      }
    } catch { setResult({ type: 'error', message: 'Error al actualizar' }) }
  }

  const handleToggleBlock = async (slot: Slot) => {
    const res = await updateSlot(slot.id, { bloqueado: slot.bloqueado ? 0 : 1 } as any)
    if (res.success) loadData()
  }

  const handleDeleteSlot = async (id: number) => {
    if (!confirm('¿Eliminar este horario?')) return
    const res = await deleteSlot(id)
    if (res.success) loadData()
  }

  // ── Plantilla CRUD ──
  const handleCreatePlantilla = async () => {
    if (!newPlantilla.actividad_id || newPlantilla.dias_semana.length === 0) return
    const times = generateTimeSlots(newPlantilla.hora_desde, newPlantilla.hora_hasta, parseInt(newPlantilla.intervalo) || 60)
    let created = 0
    let errors = 0
    for (const dia of newPlantilla.dias_semana) {
      for (const hora of times) {
        try {
          const res = await createPlantilla({
            actividad_id: parseInt(newPlantilla.actividad_id),
            dia_semana: dia,
            hora,
            capacidad: parseInt(newPlantilla.capacidad) || 6,
          })
          if (res.success) created++
          else errors++
        } catch { errors++ }
      }
    }
    if (created > 0) {
      setResult({ type: 'success', message: `✅ ${created} plantilla${created > 1 ? 's' : ''} creada${created > 1 ? 's' : ''}${errors > 0 ? ` (${errors} errores)` : ''}` })
      setShowNewPlantilla(false)
      setNewPlantilla({ actividad_id: '', dias_semana: [], hora_desde: '08:00', hora_hasta: '16:00', intervalo: '60', capacidad: '6' })
      loadData()
    } else {
      setResult({ type: 'error', message: 'Error al crear plantillas' })
    }
  }

  const handleDeletePlantilla = async (id: number) => {
    if (!confirm('¿Eliminar esta plantilla?')) return
    try {
      const res = await deletePlantilla(id)
      if (res.success) { setResult({ type: 'success', message: '✅ Plantilla eliminada' }); loadData() }
    } catch { setResult({ type: 'error', message: 'Error de conexión' }) }
  }

  const handleSavePlantilla = async (plantillaId: number) => {
    try {
      const res = await updatePlantilla(plantillaId, {
        hora: editPlantillaData.hora,
        capacidad: parseInt(editPlantillaData.capacidad) || 6,
      } as any)
      if (res.success) {
        setEditingPlantillaId(null)
        setResult({ type: 'success', message: '✅ Plantilla actualizada' })
        loadData()
      }
    } catch { setResult({ type: 'error', message: 'Error de conexión' }) }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await generarSlotsMes({ mes: genMonth })
      if (res.success) {
        setResult({ type: 'success', message: `✅ ${res.data.created} horarios generados para ${genMonth}` })
        loadData()
      } else {
        setResult({ type: 'error', message: res.error?.message || 'Error' })
      }
    } catch { setResult({ type: 'error', message: 'Error de conexión' }) }
    setGenerating(false)
  }

  const getActName = (id: number) => actividades.find(a => a.id === id)?.nombre || `#${id}`

  // Preview for bulk form
  const bulkPreview = (() => {
    if (!bulkForm.fecha_desde) return null
    const fechaHasta = bulkForm.fecha_hasta || bulkForm.fecha_desde
    const dates = getDatesBetween(bulkForm.fecha_desde, fechaHasta)
    const times = generateTimeSlots(bulkForm.hora_desde, bulkForm.hora_hasta, parseInt(bulkForm.intervalo) || 60)
    return { dias: dates.length, horas: times.length, total: dates.length * times.length, times }
  })()

  if (loading) {
    return <div className="flex items-center justify-center h-60"><Loader2 className="w-8 h-8 animate-spin text-turquoise-600" /></div>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-azul-900">Disponibilidad</h1>
          <p className="text-sm text-gray-500">Gestiona horarios y cupos de actividades</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setTab('semana')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'semana' ? 'bg-turquoise-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            <Calendar className="w-4 h-4 inline mr-1.5" />Vista Semanal
          </button>
          <button onClick={() => setTab('plantillas')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'plantillas' ? 'bg-turquoise-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            <Clock className="w-4 h-4 inline mr-1.5" />Plantillas
          </button>
        </div>
      </div>

      {/* Result toast */}
      {result && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl ${result.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {result.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <span className="text-sm font-medium">{result.message}</span>
          <button onClick={() => setResult(null)} className="ml-auto text-sm opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {tab === 'semana' && (
        <>
          {/* Week navigation */}
          <div className="flex items-center justify-between bg-white rounded-xl p-3 shadow-sm border border-gray-100">
            <button onClick={() => navigateWeek(-1)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div className="text-center">
              <p className="font-semibold text-azul-900 text-sm">{formatDateRange(weekDates)}</p>
              <p className="text-xs text-gray-400">Semana del {weekDates[0]}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={goToday} className="text-xs text-turquoise-600 hover:underline font-medium px-2 py-1 rounded bg-turquoise-50 hover:bg-turquoise-100 transition-colors">Hoy</button>
              <button onClick={() => navigateWeek(1)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                <ChevronRight className="w-5 h-5 text-gray-600" />
              </button>
            </div>
          </div>

          {/* Calendar grid — clickable empty cells */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 w-32">Actividad</th>
                  {weekDates.map((d, i) => {
                    const isToday = d === new Date().toISOString().split('T')[0]
                    return (
                      <th key={d} className={`px-2 py-2 text-center text-xs font-semibold ${isToday ? 'text-turquoise-600 bg-turquoise-50' : 'text-gray-500'}`}>
                        {DAYS[i]}<br /><span className="font-normal">{d.slice(5)}</span>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {actividades.map(act => {
                  const actSlots = slots.filter(s => s.actividad_id === act.id)
                  return (
                    <tr key={act.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-3 py-2 text-sm font-medium text-gray-900 whitespace-nowrap">{act.nombre}</td>
                      {weekDates.map(d => {
                        const daySlots = actSlots.filter(s => s.fecha === d)
                        const isQuickAdding = quickAdd?.actividad_id === act.id && quickAdd?.fecha === d
                        return (
                          <td key={d} className="px-1 py-1 align-top">
                            {daySlots.length > 0 ? (
                              <div className="space-y-1">
                                {daySlots.map(s => {
                                  const isEditingThis = editingSlotId === s.id
                                  if (isEditingThis) {
                                    return (
                                      <div key={s.id} className="text-[11px] px-1.5 py-1.5 rounded bg-blue-50 border border-blue-200">
                                        <input type="time" value={editSlotData.hora}
                                          onChange={e => setEditSlotData(prev => ({ ...prev, hora: e.target.value }))}
                                          className="w-full px-1 py-0.5 border border-gray-200 rounded text-[10px] mb-1" />
                                        <div className="flex items-center gap-1">
                                          <span className="text-[9px] text-gray-500">Cupos:</span>
                                          <input type="number" value={editSlotData.capacidad} min="1"
                                            onChange={e => setEditSlotData(prev => ({ ...prev, capacidad: e.target.value }))}
                                            className="w-12 px-1 py-0.5 border border-gray-200 rounded text-[10px]" />
                                        </div>
                                        <div className="flex items-center gap-0.5 mt-1">
                                          <button onClick={() => handleSaveSlot(s.id)} className="p-0.5 bg-turquoise-500 text-white rounded hover:bg-turquoise-600" title="Guardar">
                                            <Save className="w-3 h-3" />
                                          </button>
                                          <button onClick={() => setEditingSlotId(null)} className="p-0.5 bg-gray-300 text-white rounded hover:bg-gray-400" title="Cancelar">
                                            <X className="w-3 h-3" />
                                          </button>
                                        </div>
                                      </div>
                                    )
                                  }
                                  return (
                                    <div key={s.id} className={`text-[11px] px-1.5 py-1 rounded ${s.bloqueado ? 'bg-red-50 text-red-600 line-through' : s.reservados >= s.capacidad ? 'bg-orange-50 text-orange-700' : 'bg-green-50 text-green-700'}`}>
                                      <div className="flex items-center justify-between">
                                        <span className="font-medium">{s.hora}</span>
                                        <div className="flex items-center gap-0.5">
                                          <button onClick={() => handleEditSlot(s)} className="p-0.5 hover:bg-white/50 rounded" title="Editar">
                                            <Edit3 className="w-3 h-3" />
                                          </button>
                                          <button onClick={() => handleToggleBlock(s)} className="p-0.5 hover:bg-white/50 rounded" title={s.bloqueado ? 'Desbloquear' : 'Bloquear'}>
                                            {s.bloqueado ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                                          </button>
                                          <button onClick={() => handleDeleteSlot(s.id)} className="p-0.5 hover:bg-white/50 rounded text-red-400" title="Eliminar">
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        </div>
                                      </div>
                                      {!s.bloqueado && <span>{s.reservados}/{s.capacidad}</span>}
                                    </div>
                                  )
                                })}
                                {/* Add more to this cell */}
                                {!isQuickAdding && (
                                  <button onClick={() => { setQuickAdd({ actividad_id: act.id, fecha: d }); setQuickHora('08:00'); setQuickCapacidad('6') }}
                                    className="w-full text-[10px] text-turquoise-400 hover:text-turquoise-600 hover:bg-turquoise-50 rounded py-0.5 transition-colors flex items-center justify-center gap-0.5">
                                    <Plus className="w-2.5 h-2.5" /> más
                                  </button>
                                )}
                              </div>
                            ) : (
                              /* Empty cell — clickable to add */
                              !isQuickAdding ? (
                                <button
                                  onClick={() => { setQuickAdd({ actividad_id: act.id, fecha: d }); setQuickHora('08:00'); setQuickCapacidad('6') }}
                                  className="w-full py-3 text-center text-gray-300 hover:text-turquoise-500 hover:bg-turquoise-50 rounded-lg transition-all group cursor-pointer"
                                  title="Click para agregar horario"
                                >
                                  <Plus className="w-4 h-4 mx-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                              ) : null
                            )}

                            {/* Quick-add inline form */}
                            {isQuickAdding && (
                              <div className="text-[11px] px-1.5 py-1.5 rounded bg-turquoise-50 border border-turquoise-200 space-y-1">
                                <input type="time" value={quickHora} onChange={e => setQuickHora(e.target.value)}
                                  className="w-full px-1 py-0.5 border border-gray-200 rounded text-[10px]" autoFocus />
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] text-gray-500">Cupos:</span>
                                  <input type="number" value={quickCapacidad} min="1"
                                    onChange={e => setQuickCapacidad(e.target.value)}
                                    className="w-12 px-1 py-0.5 border border-gray-200 rounded text-[10px]" />
                                </div>
                                <div className="flex items-center gap-0.5">
                                  <button onClick={handleQuickAdd} className="p-0.5 bg-turquoise-500 text-white rounded hover:bg-turquoise-600" title="Crear">
                                    <Save className="w-3 h-3" />
                                  </button>
                                  <button onClick={() => setQuickAdd(null)} className="p-0.5 bg-gray-300 text-white rounded hover:bg-gray-400" title="Cancelar">
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Bulk add panel */}
          <div>
            <button onClick={() => setShowNewSlot(!showNewSlot)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium shadow-sm transition-all ${showNewSlot ? 'bg-gray-200 text-gray-700' : 'bg-turquoise-600 text-white hover:bg-turquoise-700'}`}>
              {showNewSlot ? <X className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
              {showNewSlot ? 'Cerrar' : 'Crear Horarios en Lote'}
            </button>
          </div>

          {showNewSlot && (
            <div className="bg-white rounded-xl shadow-md p-5 border border-turquoise-100 space-y-4">
              <h3 className="font-semibold text-azul-900 text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-turquoise-600" /> Crear Horarios en Lote
              </h3>
              <p className="text-xs text-gray-500">Crea múltiples horarios de una sola vez: selecciona rango de fechas + intervalo de horas.</p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Actividad *</label>
                  <select value={bulkForm.actividad_id} onChange={e => setBulkForm({ ...bulkForm, actividad_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-turquoise-500">
                    <option value="">Seleccionar...</option>
                    {actividades.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Fecha desde *</label>
                  <input type="date" value={bulkForm.fecha_desde} onChange={e => setBulkForm({ ...bulkForm, fecha_desde: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-turquoise-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Fecha hasta</label>
                  <input type="date" value={bulkForm.fecha_hasta}
                    min={bulkForm.fecha_desde}
                    onChange={e => setBulkForm({ ...bulkForm, fecha_hasta: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-turquoise-500" />
                  <p className="text-[10px] text-gray-400 mt-0.5">Vacío = solo la fecha "desde"</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Hora desde</label>
                  <input type="time" value={bulkForm.hora_desde} onChange={e => setBulkForm({ ...bulkForm, hora_desde: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-turquoise-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Hora hasta</label>
                  <input type="time" value={bulkForm.hora_hasta} onChange={e => setBulkForm({ ...bulkForm, hora_hasta: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-turquoise-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Intervalo</label>
                  <select value={bulkForm.intervalo} onChange={e => setBulkForm({ ...bulkForm, intervalo: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-turquoise-500">
                    <option value="30">Cada 30 min</option>
                    <option value="60">Cada 1 hora</option>
                    <option value="90">Cada 1.5 horas</option>
                    <option value="120">Cada 2 horas</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Cupos por horario</label>
                  <input type="number" value={bulkForm.capacidad} min="1"
                    onChange={e => setBulkForm({ ...bulkForm, capacidad: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-turquoise-500" />
                </div>
              </div>

              {/* Preview */}
              {bulkPreview && (
                <div className="bg-turquoise-50 rounded-lg p-3 border border-turquoise-100">
                  <p className="text-xs font-medium text-turquoise-800">
                    📋 Se crearán <strong>{bulkPreview.total}</strong> horarios
                    ({bulkPreview.dias} día{bulkPreview.dias > 1 ? 's' : ''} × {bulkPreview.horas} hora{bulkPreview.horas > 1 ? 's' : ''})
                  </p>
                  <p className="text-[10px] text-turquoise-600 mt-0.5">
                    Horas: {bulkPreview.times.join(', ')}
                  </p>
                </div>
              )}

              <div className="flex justify-end">
                <button onClick={handleBulkCreate} disabled={!bulkForm.actividad_id || !bulkForm.fecha_desde || creating}
                  className="px-5 py-2 bg-turquoise-600 text-white rounded-lg text-sm font-medium hover:bg-turquoise-700 disabled:opacity-50 shadow-sm flex items-center gap-2">
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  {creating ? 'Creando...' : 'Crear Horarios'}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'plantillas' && (
        <>
          {/* Info box */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
            <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">¿Qué son las plantillas?</p>
              <p>Las plantillas definen horarios recurrentes. Ej: "Surf los Lunes de 8:00 a 14:00 cada hora". Al <strong>Generar Horarios</strong> se crean los slots para todo el mes seleccionado.</p>
            </div>
          </div>

          {/* Generate month — prominent */}
          <div className="bg-gradient-to-r from-turquoise-50 to-blue-50 rounded-xl p-5 border border-turquoise-200 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1">
                <p className="font-semibold text-turquoise-900 text-sm flex items-center gap-2">
                  <Zap className="w-4 h-4 text-turquoise-600" /> Generar Horarios del Mes
                </p>
                <p className="text-xs text-turquoise-700 mt-0.5">Aplica las plantillas activas al mes seleccionado — crea todos los slots automáticamente</p>
              </div>
              <div className="flex items-center gap-2">
                <input type="month" value={genMonth} onChange={e => setGenMonth(e.target.value)}
                  className="px-3 py-2 border border-turquoise-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-turquoise-500" />
                <button onClick={handleGenerate} disabled={generating}
                  className="px-5 py-2 bg-turquoise-600 text-white rounded-lg text-sm font-medium hover:bg-turquoise-700 disabled:opacity-50 flex items-center gap-2 shadow-sm">
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Generar
                </button>
              </div>
            </div>
          </div>

          {/* Plantillas list */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">Plantillas Semanales</h3>
                <p className="text-xs text-gray-400">{plantillas.length} plantilla{plantillas.length !== 1 ? 's' : ''} configurada{plantillas.length !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setShowNewPlantilla(!showNewPlantilla)} className={`text-sm font-medium flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors ${showNewPlantilla ? 'bg-gray-200 text-gray-700' : 'bg-turquoise-50 text-turquoise-600 hover:bg-turquoise-100'}`}>
                {showNewPlantilla ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {showNewPlantilla ? 'Cerrar' : 'Nueva'}
              </button>
            </div>

            {showNewPlantilla && (
              <div className="p-4 bg-turquoise-50/50 border-b border-turquoise-100 space-y-3">
                <p className="text-xs font-medium text-gray-600">Nueva plantilla semanal con intervalos</p>
                {/* Row 1: Actividad + Cupos */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <select value={newPlantilla.actividad_id} onChange={e => setNewPlantilla({ ...newPlantilla, actividad_id: e.target.value })} className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-turquoise-500">
                    <option value="">Actividad...</option>
                    {actividades.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                  </select>
                  <input type="number" value={newPlantilla.capacidad} onChange={e => setNewPlantilla({ ...newPlantilla, capacidad: e.target.value })} placeholder="Cupos" min="1" className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-turquoise-500" />
                </div>
                {/* Row 2: Days chips */}
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
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${selected ? 'bg-turquoise-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:border-turquoise-300 hover:text-turquoise-600'}`}>
                          {d}
                        </button>
                      )
                    })}
                  </div>
                </div>
                {/* Row 3: Time interval */}
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
                {/* Preview + create */}
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-gray-400">
                    {newPlantilla.dias_semana.length > 0
                      ? (() => {
                          const times = generateTimeSlots(newPlantilla.hora_desde, newPlantilla.hora_hasta, parseInt(newPlantilla.intervalo) || 60)
                          return `${newPlantilla.dias_semana.length} día(s) × ${times.length} hora(s) = ${newPlantilla.dias_semana.length * times.length} plantilla(s) — Horas: ${times.join(', ')}`
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

            {plantillas.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <Clock className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="font-medium">No hay plantillas configuradas</p>
                <p className="text-sm mt-1">Crea una plantilla para poder generar horarios automáticamente cada mes</p>
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
                    const actName = getActName(Number(actId))
                    const byDay = items.reduce((acc, p) => {
                      if (!acc[p.dia_semana]) acc[p.dia_semana] = []
                      acc[p.dia_semana].push(p)
                      return acc
                    }, {} as Record<number, Plantilla[]>)

                    const sortedDays = Object.keys(byDay).map(Number).sort()

                    return (
                      <div key={actId} className="px-4 py-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-semibold text-gray-900 text-sm">{actName}</h4>
                          <span className="text-[10px] text-gray-400">
                            {items.length} horario{items.length !== 1 ? 's' : ''} · {sortedDays.length} día{sortedDays.length !== 1 ? 's' : ''}
                          </span>
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
                                    {dayPls.sort((a, b) => a.hora.localeCompare(b.hora)).map(pl => {
                                      const isEditingThis = editingPlantillaId === pl.id
                                      if (isEditingThis) {
                                        return (
                                          <div key={pl.id} className="text-[10px] bg-blue-50 rounded p-1 border border-blue-200">
                                            <input type="time" value={editPlantillaData.hora}
                                              onChange={e => setEditPlantillaData(prev => ({ ...prev, hora: e.target.value }))}
                                              className="w-full px-0.5 py-0 border border-gray-200 rounded text-[10px] mb-0.5" />
                                            <input type="number" value={editPlantillaData.capacidad} min="1"
                                              onChange={e => setEditPlantillaData(prev => ({ ...prev, capacidad: e.target.value }))}
                                              className="w-full px-0.5 py-0 border border-gray-200 rounded text-[10px]" />
                                            <div className="flex gap-0.5 mt-0.5 justify-center">
                                              <button onClick={() => handleSavePlantilla(pl.id)} className="p-0.5 text-green-500 hover:text-green-700" title="Guardar"><Save className="w-3 h-3" /></button>
                                              <button onClick={() => setEditingPlantillaId(null)} className="p-0.5 text-gray-400 hover:text-gray-600" title="Cancelar"><X className="w-3 h-3" /></button>
                                            </div>
                                          </div>
                                        )
                                      }
                                      return (
                                        <div key={pl.id} className="group relative">
                                          <div className="text-[10px] font-medium text-turquoise-800">{pl.hora}</div>
                                          <div className="text-[9px] text-turquoise-600">{pl.capacidad} cupos</div>
                                          <div className="hidden group-hover:flex absolute -top-1 -right-1 gap-0.5">
                                            <button onClick={() => { setEditingPlantillaId(pl.id); setEditPlantillaData({ hora: pl.hora, capacidad: String(pl.capacidad) }) }}
                                              className="p-0.5 bg-white rounded shadow-sm border border-gray-200 text-gray-400 hover:text-blue-600"><Edit3 className="w-2.5 h-2.5" /></button>
                                            <button onClick={() => handleDeletePlantilla(pl.id)}
                                              className="p-0.5 bg-white rounded shadow-sm border border-gray-200 text-gray-400 hover:text-red-600"><Trash2 className="w-2.5 h-2.5" /></button>
                                          </div>
                                        </div>
                                      )
                                    })}
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
    </div>
  )
}
