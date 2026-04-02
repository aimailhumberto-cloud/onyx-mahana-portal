import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, MapPin, Building2, Clock, X, ExternalLink } from 'lucide-react'
import { getCalendarData } from '../api/api'

interface CalendarTour {
  id: number; fecha: string; hora: string; cliente: string;
  actividad: string; estatus: string; vendedor: string;
  responsable: string; precio_ingreso: number; ganancia_mahana: number;
}

interface CalendarEstadia {
  id: number; cliente: string; propiedad: string;
  check_in: string; check_out: string; estado: string;
  precio_final: number | null; monto_comision: number | null; huespedes: string;
}

interface DayEvents {
  date: string
  tours: CalendarTour[]
  estadias: CalendarEstadia[]
}

const TOUR_COLORS: Record<string, string> = {
  'Pagado':    'bg-green-500',
  'Reservado': 'bg-sky-500',
  'Consulta':  'bg-amber-400',
  'Cancelado': 'bg-red-400',
  'Cerrado':   'bg-gray-400',
}

const ESTADIA_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  'Solicitada': { bg: 'bg-gray-200', border: 'border-gray-400', text: 'text-gray-700' },
  'Cotizada':   { bg: 'bg-amber-200', border: 'border-amber-400', text: 'text-amber-800' },
  'Confirmada': { bg: 'bg-sky-200', border: 'border-sky-400', text: 'text-sky-800' },
  'Pagada':     { bg: 'bg-green-200', border: 'border-green-400', text: 'text-green-800' },
  'Perdida':    { bg: 'bg-red-200', border: 'border-red-400', text: 'text-red-700' },
}

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function getMonthData(year: number, month: number) {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  // Monday = 0, Sunday = 6
  let startDow = firstDay.getDay() - 1
  if (startDow < 0) startDow = 6
  const totalDays = lastDay.getDate()
  return { startDow, totalDays }
}

const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`

export default function CalendarView() {
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [tours, setTours] = useState<CalendarTour[]>([])
  const [estadias, setEstadias] = useState<CalendarEstadia[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<DayEvents | null>(null)
  const navigate = useNavigate()

  const mesStr = `${currentDate.year}-${String(currentDate.month + 1).padStart(2, '0')}`

  useEffect(() => {
    setLoading(true)
    setSelectedDay(null)
    getCalendarData(mesStr)
      .then(r => {
        if (r.success && r.data) {
          setTours(r.data.tours || [])
          setEstadias(r.data.estadias || [])
        }
      })
      .finally(() => setLoading(false))
  }, [mesStr])

  const prevMonth = () => setCurrentDate(d => d.month === 0 ? { year: d.year - 1, month: 11 } : { ...d, month: d.month - 1 })
  const nextMonth = () => setCurrentDate(d => d.month === 11 ? { year: d.year + 1, month: 0 } : { ...d, month: d.month + 1 })
  const goToday = () => { const now = new Date(); setCurrentDate({ year: now.getFullYear(), month: now.getMonth() }) }

  const { startDow, totalDays } = getMonthData(currentDate.year, currentDate.month)
  const today = new Date().toISOString().split('T')[0]
  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

  // Build grid cells
  const cells: (number | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= totalDays; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  // Index tours by date
  const toursByDate: Record<string, CalendarTour[]> = {}
  tours.forEach(t => {
    if (!toursByDate[t.fecha]) toursByDate[t.fecha] = []
    toursByDate[t.fecha].push(t)
  })

  // Check which dates have estadias
  const getEstadiasForDate = (dateStr: string): CalendarEstadia[] => {
    return estadias.filter(e => {
      if (!e.check_in) return false
      const checkOut = e.check_out || e.check_in
      return dateStr >= e.check_in && dateStr <= checkOut
    })
  }

  const handleDayClick = (day: number) => {
    const dateStr = `${currentDate.year}-${String(currentDate.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const dayTours = toursByDate[dateStr] || []
    const dayEstadias = getEstadiasForDate(dateStr)
    setSelectedDay({ date: dateStr, tours: dayTours, estadias: dayEstadias })
  }

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-azul-900">Calendario</h1>
          <p className="text-sm text-gray-500">Vista mensual de tours y estadías</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-2 bg-white rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <button onClick={goToday} className="px-4 py-2 bg-white rounded-lg border border-gray-200 text-sm font-medium text-azul-900 hover:bg-gray-50 transition-colors">
            Hoy
          </button>
          <button onClick={nextMonth} className="p-2 bg-white rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
          <span className="text-lg font-bold text-azul-900 ml-2">
            {monthNames[currentDate.month]} {currentDate.year}
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="card-premium px-4 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs animate-fadeInUp">
        <span className="font-semibold text-gray-500 uppercase tracking-wide mr-1">Tours:</span>
        {Object.entries(TOUR_COLORS).filter(([k]) => k !== 'Cerrado').map(([status, color]) => (
          <span key={status} className="flex items-center gap-1 text-gray-600">
            <span className={`w-2.5 h-2.5 rounded-full ${color}`} /> {status}
          </span>
        ))}
        <span className="text-gray-300 mx-1">|</span>
        <span className="font-semibold text-gray-500 uppercase tracking-wide mr-1">Estadías:</span>
        {Object.entries(ESTADIA_COLORS).filter(([k]) => k !== 'Perdida').map(([status, conf]) => (
          <span key={status} className="flex items-center gap-1 text-gray-600">
            <span className={`w-2.5 h-2.5 rounded-sm ${conf.bg} border ${conf.border}`} /> {status}
          </span>
        ))}
      </div>

      <div className="flex gap-4">
        {/* Calendar Grid */}
        <div className={`card-premium overflow-hidden flex-1 transition-all ${selectedDay ? 'lg:flex-[2]' : ''}`}>
          {loading ? (
            <div className="flex items-center justify-center h-96">
              <div className="w-8 h-8 border-4 border-turquoise-200 border-t-turquoise-600 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Day headers */}
              <div className="grid grid-cols-7 bg-gray-50/80 border-b border-gray-200">
                {DAYS.map(d => (
                  <div key={d} className="py-2.5 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{d}</div>
                ))}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7 auto-rows-fr">
                {cells.map((day, idx) => {
                  if (day === null) return <div key={`e-${idx}`} className="min-h-[100px] bg-gray-50/30 border-b border-r border-gray-100" />

                  const dateStr = `${currentDate.year}-${String(currentDate.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                  const dayTours = toursByDate[dateStr] || []
                  const dayEstadias = getEstadiasForDate(dateStr)
                  const isToday = dateStr === today
                  const isSelected = selectedDay?.date === dateStr
                  const hasEvents = dayTours.length > 0 || dayEstadias.length > 0

                  return (
                    <div
                      key={`d-${day}`}
                      onClick={() => handleDayClick(day)}
                      className={`min-h-[100px] border-b border-r border-gray-100 p-1.5 cursor-pointer transition-all
                        ${isToday ? 'bg-turquoise-50/40 ring-2 ring-inset ring-turquoise-300' : ''}
                        ${isSelected ? 'bg-azul-50/50 ring-2 ring-inset ring-azul-400' : ''}
                        ${!isToday && !isSelected ? 'hover:bg-gray-50' : ''}
                      `}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-sm font-medium leading-none ${isToday ? 'bg-turquoise-600 text-white w-6 h-6 rounded-full flex items-center justify-center' : 'text-gray-700'}`}>
                          {day}
                        </span>
                        {hasEvents && (
                          <span className="text-[9px] text-gray-400 font-medium">
                            {dayTours.length + dayEstadias.length}
                          </span>
                        )}
                      </div>

                      {/* Tour dots / pills */}
                      <div className="space-y-0.5">
                        {dayTours.slice(0, 3).map(t => (
                          <div key={t.id} className={`text-[9px] text-white px-1.5 py-0.5 rounded truncate ${TOUR_COLORS[t.estatus] || 'bg-gray-400'}`}>
                            {t.actividad}
                          </div>
                        ))}
                        {dayTours.length > 3 && (
                          <span className="text-[9px] text-gray-400 font-medium pl-1">+{dayTours.length - 3} más</span>
                        )}
                      </div>

                      {/* Estadía bars */}
                      <div className="space-y-0.5 mt-0.5">
                        {dayEstadias.slice(0, 2).map(e => {
                          const conf = ESTADIA_COLORS[e.estado] || ESTADIA_COLORS['Solicitada']
                          return (
                            <div key={e.id} className={`text-[9px] px-1.5 py-0.5 rounded-sm truncate border ${conf.bg} ${conf.border} ${conf.text}`}>
                              🏨 {e.propiedad}
                            </div>
                          )
                        })}
                        {dayEstadias.length > 2 && (
                          <span className="text-[9px] text-gray-400 font-medium pl-1">+{dayEstadias.length - 2} más</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Detail Panel */}
        {selectedDay && (
          <div className="hidden lg:block w-80 glass rounded-2xl shadow-premium-lg border border-gray-200/50 overflow-hidden self-start sticky top-20 animate-slideInRight">
            {/* Panel Header */}
            <div className="bg-gradient-to-r from-azul-900 to-azul-800 text-white px-4 py-3 flex items-center justify-between">
              <div>
                <p className="font-bold">{new Date(selectedDay.date + 'T12:00:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                <p className="text-xs text-white/70">{selectedDay.tours.length} tours · {selectedDay.estadias.length} estadías</p>
              </div>
              <button onClick={() => setSelectedDay(null)} className="p-1 rounded-lg hover:bg-white/20 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 space-y-3 max-h-[calc(100vh-200px)] overflow-y-auto">
              {/* Tours */}
              {selectedDay.tours.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> Tours ({selectedDay.tours.length})
                  </h4>
                  <div className="space-y-1.5">
                    {selectedDay.tours.map(t => (
                      <div
                        key={t.id}
                        onClick={(e) => { e.stopPropagation(); navigate(`/tours/${t.id}/editar`) }}
                        className="bg-white rounded-lg border border-gray-100 p-2.5 hover:border-turquoise-300 hover:shadow-sm cursor-pointer transition-all group"
                      >
                        <div className="flex items-start justify-between mb-1">
                          <span className="text-xs font-semibold text-azul-900">{t.cliente}</span>
                          <span className={`text-[9px] text-white px-1.5 py-0.5 rounded-full ${TOUR_COLORS[t.estatus] || 'bg-gray-400'}`}>{t.estatus}</span>
                        </div>
                        <p className="text-[11px] text-gray-600 flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-turquoise-500 shrink-0" /> {t.actividad}
                        </p>
                        <div className="flex items-center justify-between mt-1">
                          {t.hora && (
                            <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                              <Clock className="w-3 h-3" /> {t.hora}
                            </span>
                          )}
                          <span className="text-[11px] font-semibold text-green-600">{fmt(t.ganancia_mahana || 0)}</span>
                        </div>
                        <ExternalLink className="w-3 h-3 text-gray-300 group-hover:text-turquoise-500 absolute top-2 right-2 hidden group-hover:block transition-colors" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Estadías */}
              {selectedDay.estadias.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Building2 className="w-3 h-3" /> Estadías ({selectedDay.estadias.length})
                  </h4>
                  <div className="space-y-1.5">
                    {selectedDay.estadias.map(e => {
                      const conf = ESTADIA_COLORS[e.estado] || ESTADIA_COLORS['Solicitada']
                      return (
                        <div
                          key={e.id}
                          onClick={(ev) => { ev.stopPropagation(); navigate(`/estadias/${e.id}/editar`) }}
                          className="bg-white rounded-lg border border-gray-100 p-2.5 hover:border-purple-300 hover:shadow-sm cursor-pointer transition-all group"
                        >
                          <div className="flex items-start justify-between mb-1">
                            <span className="text-xs font-semibold text-azul-900">{e.cliente}</span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${conf.bg} ${conf.border} ${conf.text}`}>{e.estado}</span>
                          </div>
                          <p className="text-[11px] text-gray-600 flex items-center gap-1">
                            <Building2 className="w-3 h-3 text-purple-400 shrink-0" /> {e.propiedad}
                          </p>
                          <div className="flex items-center justify-between mt-1 text-[10px] text-gray-400">
                            <span>{e.check_in} → {e.check_out}</span>
                            {e.monto_comision && <span className="font-semibold text-green-600">{fmt(e.monto_comision)}</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {selectedDay.tours.length === 0 && selectedDay.estadias.length === 0 && (
                <div className="text-center py-6 text-gray-400 text-sm">
                  No hay eventos para este día
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mobile detail panel */}
      {selectedDay && (
        <div className="lg:hidden card-premium overflow-hidden animate-fadeInUp">
          <div className="bg-gradient-to-r from-azul-900 to-azul-800 text-white px-4 py-3 flex items-center justify-between">
            <div>
              <p className="font-bold text-sm">{new Date(selectedDay.date + 'T12:00:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
              <p className="text-[11px] text-white/70">{selectedDay.tours.length} tours · {selectedDay.estadias.length} estadías</p>
            </div>
            <button onClick={() => setSelectedDay(null)} className="p-1 rounded-lg hover:bg-white/20"><X className="w-4 h-4" /></button>
          </div>
          <div className="p-3 space-y-2">
            {selectedDay.tours.map(t => (
              <div key={t.id} onClick={() => navigate(`/tours/${t.id}/editar`)}
                className="bg-gray-50 rounded-lg p-2.5 cursor-pointer hover:bg-turquoise-50 transition-colors">
                <div className="flex justify-between items-start">
                  <span className="text-xs font-semibold text-azul-900">{t.cliente}</span>
                  <span className={`text-[9px] text-white px-1.5 py-0.5 rounded-full ${TOUR_COLORS[t.estatus] || 'bg-gray-400'}`}>{t.estatus}</span>
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5">{t.actividad} {t.hora && `• ${t.hora}`}</p>
              </div>
            ))}
            {selectedDay.estadias.map(e => {
              const conf = ESTADIA_COLORS[e.estado] || ESTADIA_COLORS['Solicitada']
              return (
                <div key={e.id} onClick={() => navigate(`/estadias/${e.id}/editar`)}
                  className="bg-gray-50 rounded-lg p-2.5 cursor-pointer hover:bg-purple-50 transition-colors">
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-semibold text-azul-900">{e.cliente}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${conf.bg} ${conf.border} ${conf.text}`}>{e.estado}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">🏨 {e.propiedad} • {e.check_in} → {e.check_out}</p>
                </div>
              )
            })}
            {selectedDay.tours.length === 0 && selectedDay.estadias.length === 0 && (
              <p className="text-center py-4 text-gray-400 text-sm">No hay eventos</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
