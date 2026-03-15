import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Loader2, AlertCircle, Bot, User, ChevronLeft, ChevronRight, DollarSign, TrendingUp, Calendar, MapPin, Download } from 'lucide-react'
import { getTours, getCharts } from '../api/api'
import type { Tour, Meta } from '../api/api'
import { downloadCSV } from '../utils/exportUtils'

const statusConfig: Record<string, { bg: string; text: string; dot: string }> = {
  'Pagado':    { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
  'Reservado': { bg: 'bg-turquoise-50', text: 'text-turquoise-700', dot: 'bg-turquoise-500' },
  'Consulta':  { bg: 'bg-arena-50', text: 'text-arena-700', dot: 'bg-arena-500' },
  'Cancelado': { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  'Cerrado':   { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-500' },
}

interface PeriodStats { cantidad: number; ingresos: number; ganancia: number }

const PERIODS = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mes' },
  { key: 'anio', label: 'Año' },
  { key: 'todo', label: 'Todo' },
] as const

const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`

export default function ToursList() {
  const [search, setSearch] = useState('')
  const [activeStatus, setActiveStatus] = useState<string | null>(null)
  const [activePeriod, setActivePeriod] = useState<string>('semana')
  const [tours, setTours] = useState<Tour[]>([])
  const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: 20, pages: 0 })
  const [periodStats, setPeriodStats] = useState<Record<string, PeriodStats>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    getCharts().then(r => {
      if (r.success && r.data?.periodos) setPeriodStats(r.data.periodos)
    })
  }, [])

  const getDateRange = (period: string): { desde?: string; hasta?: string } => {
    const now = new Date()
    const today = now.toISOString().split('T')[0]
    switch (period) {
      case 'hoy': return { desde: today, hasta: today }
      case 'semana': { const s = new Date(now); s.setDate(s.getDate() - s.getDay()); return { desde: s.toISOString().split('T')[0] } }
      case 'mes': return { desde: today.substring(0, 7) + '-01' }
      case 'anio': return { desde: today.substring(0, 4) + '-01-01' }
      default: return {}
    }
  }

  const loadTours = async (page = 1) => {
    setLoading(true); setError(null)
    try {
      const params: Record<string, string | number> = { page, limit: 20 }
      if (activeStatus) params.estatus = activeStatus
      if (search) params.cliente = search
      const range = getDateRange(activePeriod)
      if (range.desde) params.fecha_desde = range.desde
      if (range.hasta) params.fecha_hasta = range.hasta
      const result = await getTours(params)
      if (result.success) { setTours(result.data || []); if (result.meta) setMeta(result.meta) }
      else setError(result.error?.message || 'Error')
    } catch { setError('Error de conexión') }
    finally { setLoading(false) }
  }

  useEffect(() => { loadTours() }, [activeStatus, activePeriod])
  const handleSearch = () => loadTours(1)
  const currentStats = periodStats[activePeriod]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <img src="/mahana-logo.jpg" alt="Mahana Tours" className="w-11 h-11 rounded-xl object-cover shadow-sm ring-1 ring-gray-200" />
          <div>
            <h1 className="text-2xl font-bold text-azul-900">Tours</h1>
            <p className="text-sm text-gray-500">{meta.total} reservas</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => {
            const range = getDateRange(activePeriod)
            const params = new URLSearchParams()
            if (range.desde) params.set('fecha_desde', range.desde)
            if (range.hasta) params.set('fecha_hasta', range.hasta)
            if (activeStatus) params.set('estatus', activeStatus)
            downloadCSV(`/api/v1/tours/export?${params}`, `tours_${new Date().toISOString().split('T')[0]}.csv`)
          }} className="flex items-center gap-1.5 bg-white text-azul-900 border border-gray-200 px-4 py-2.5 rounded-xl font-medium hover:bg-gray-50 hover:shadow-sm transition-all text-sm">
            <Download className="w-4 h-4" /> Exportar
          </button>
          <button onClick={() => navigate('/tours/nuevo')} className="bg-gradient-to-r from-turquoise-600 to-turquoise-500 text-white px-5 py-2.5 rounded-xl font-medium hover:shadow-lg hover:scale-[1.02] transition-all">
            + Nueva Reserva
          </button>
        </div>
      </div>

      {/* Period + KPIs + Filters */}
      <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100 space-y-4">
        {/* Period Pills */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => setActivePeriod(p.key)}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                activePeriod === p.key ? 'bg-white text-azul-900 shadow-sm ring-1 ring-gray-200' : 'text-gray-500 hover:text-gray-700'
              }`}>{p.label}</button>
          ))}
        </div>

        {/* Mini KPIs */}
        {currentStats && (
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-gradient-to-br from-turquoise-50 to-turquoise-100/50 rounded-xl px-3 py-2.5 text-center border border-turquoise-200/50">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <Calendar className="w-3.5 h-3.5 text-turquoise-600" />
                <span className="text-[10px] text-turquoise-600 font-semibold uppercase">Reservas</span>
              </div>
              <p className="text-xl font-bold text-turquoise-700">{currentStats.cantidad}</p>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-green-100/50 rounded-xl px-3 py-2.5 text-center border border-green-200/50">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <DollarSign className="w-3.5 h-3.5 text-green-600" />
                <span className="text-[10px] text-green-600 font-semibold uppercase">Ingresos</span>
              </div>
              <p className="text-xl font-bold text-green-700">{fmt(currentStats.ingresos)}</p>
            </div>
            <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl px-3 py-2.5 text-center border border-blue-200/50">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-[10px] text-blue-600 font-semibold uppercase">Ganancia</span>
              </div>
              <p className="text-xl font-bold text-blue-700">{fmt(currentStats.ganancia)}</p>
            </div>
          </div>
        )}

        {/* Search + Status */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Buscar por cliente..." value={search}
              onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-turquoise-500 text-sm" />
          </div>
          <button onClick={handleSearch} className="px-4 py-2 bg-azul-900 text-white rounded-lg hover:bg-azul-800 transition-colors text-sm font-medium">Buscar</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(statusConfig).filter(([k]) => k !== 'Cerrado').map(([status, conf]) => (
            <button key={status} onClick={() => setActiveStatus(activeStatus === status ? null : status)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                activeStatus === status ? `${conf.bg} ${conf.text} border-current` : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}>
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${conf.dot} mr-1.5`} />
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-8 h-8 animate-spin text-turquoise-600" /></div>
      ) : error ? (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <AlertCircle className="w-8 h-8 text-red-600 mx-auto mb-2" />
          <p className="text-gray-500 mb-4">{error}</p>
          <button onClick={() => loadTours()} className="px-4 py-2 bg-turquoise-600 text-white rounded-lg">Reintentar</button>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden lg:block bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
            <table className="w-full">
              <thead className="bg-gray-50/80 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Cliente</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Actividad</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Fecha</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Responsable</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-3 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Ingreso</th>
                  <th className="px-4 py-3 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Ganancia</th>
                  <th className="px-4 py-3 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {tours.length > 0 ? tours.map((t, i) => {
                  const conf = statusConfig[t.estatus] || statusConfig['Cerrado']
                  return (
                    <tr key={t.id} className={`hover:bg-turquoise-50/30 cursor-pointer transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/30'}`}
                      onClick={() => navigate(`/tours/${t.id}/editar`)}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-azul-900 text-sm">{t.cliente}</p>
                        {t.whatsapp && <p className="text-[11px] text-gray-400">{t.whatsapp}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-sm text-gray-700">
                          <MapPin className="w-3 h-3 text-turquoise-500" />{t.actividad}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        <span>{t.fecha}</span>
                        {t.hora && <span className="text-xs text-gray-400 ml-1.5 bg-gray-100 px-1.5 py-0.5 rounded">{t.hora}</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{t.responsable}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${conf.bg} ${conf.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${conf.dot}`} />
                          {t.estatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-azul-900">{fmt(t.precio_ingreso || 0)}</td>
                      <td className={`px-4 py-3 text-right text-sm font-semibold ${(t.ganancia_mahana || 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {fmt(t.ganancia_mahana || 0)}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {t.fuente === 'openclaw' && <Bot className="w-3.5 h-3.5 text-purple-400 inline" />}
                        {t.fuente === 'manual' && <User className="w-3.5 h-3.5 text-gray-300 inline" />}
                      </td>
                    </tr>
                  )
                }) : (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400 text-sm">No hay tours en este período</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden space-y-2.5">
            {tours.length > 0 ? tours.map((t) => {
              const conf = statusConfig[t.estatus] || statusConfig['Cerrado']
              return (
                <div key={t.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 cursor-pointer hover:shadow-md hover:border-turquoise-200 transition-all"
                  onClick={() => navigate(`/tours/${t.id}/editar`)}>
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {t.hora && <span className="bg-azul-900 text-white text-[10px] px-2 py-0.5 rounded-md font-mono shrink-0">{t.hora}</span>}
                      <span className="text-sm font-medium text-turquoise-600 truncate flex items-center gap-1">
                        <MapPin className="w-3 h-3 shrink-0" />{t.actividad}
                      </span>
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ml-2 ${conf.bg} ${conf.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${conf.dot}`} />{t.estatus}
                    </span>
                  </div>
                  <p className="font-semibold text-azul-900 text-sm mb-1">{t.cliente}</p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 text-xs">{t.fecha} • {t.responsable || 'Sin asignar'}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-green-600">{fmt(t.precio_ingreso || 0)}</span>
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">→ {fmt(t.ganancia_mahana || 0)}</span>
                      {t.fuente === 'openclaw' && <Bot className="w-3 h-3 text-purple-400" />}
                    </div>
                  </div>
                </div>
              )
            }) : (
              <div className="bg-white rounded-xl shadow-sm p-10 text-center text-gray-400 text-sm">No hay tours en este período</div>
            )}
          </div>

          {/* Pagination */}
          {meta.pages > 1 && (
            <div className="flex justify-center items-center gap-2">
              <button disabled={meta.page <= 1} onClick={() => loadTours(meta.page - 1)}
                className="p-2 bg-white rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-500 px-3 font-medium">{meta.page} / {meta.pages}</span>
              <button disabled={meta.page >= meta.pages} onClick={() => loadTours(meta.page + 1)}
                className="p-2 bg-white rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
