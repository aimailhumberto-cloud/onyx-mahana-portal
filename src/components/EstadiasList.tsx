import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Loader2, AlertCircle, Bot, User, ChevronLeft, ChevronRight, Building2, Calendar, Users, Download } from 'lucide-react'
import { getEstadias, getCharts } from '../api/api'
import type { Estadia, Meta } from '../api/api'
import { downloadCSV } from '../utils/exportUtils'

const statusConfig: Record<string, { bg: string; text: string; dot: string; icon: string; label: string; border: string }> = {
  'Solicitada': { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-400', icon: '📥', label: 'Solicitadas', border: 'border-gray-300' },
  'Cotizada':   { bg: 'bg-arena-50', text: 'text-arena-700', dot: 'bg-arena-500', icon: '💬', label: 'Cotizadas', border: 'border-arena-300' },
  'Confirmada': { bg: 'bg-turquoise-50', text: 'text-turquoise-700', dot: 'bg-turquoise-500', icon: '✅', label: 'Confirmadas', border: 'border-turquoise-300' },
  'Pagada':     { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500', icon: '💰', label: 'Pagadas', border: 'border-green-300' },
  'Perdida':    { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-400', icon: '❌', label: 'Perdidas', border: 'border-red-300' },
}

const STATUS_ORDER = ['Solicitada', 'Cotizada', 'Confirmada', 'Pagada', 'Perdida']
const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`

export default function EstadiasList() {
  const [search, setSearch] = useState('')
  const [activeStatus, setActiveStatus] = useState<string | null>(null)
  const [estadias, setEstadias] = useState<Estadia[]>([])
  const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: 20, pages: 0 })
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [leadsAbiertos, setLeadsAbiertos] = useState({ cantidad: 0, monto: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    getCharts().then(r => {
      if (r.success && r.data) {
        if (r.data.estadiasPorEstado) {
          const counts: Record<string, number> = {}
          r.data.estadiasPorEstado.forEach((s: { estado: string; cantidad: number }) => { counts[s.estado] = s.cantidad })
          setStatusCounts(counts)
        }
        if (r.data.leadsAbiertos) {
          setLeadsAbiertos(r.data.leadsAbiertos)
        }
      }
    })
  }, [])

  const loadEstadias = async (page = 1) => {
    setLoading(true); setError(null)
    try {
      const params: Record<string, string | number> = { page, limit: 20 }
      if (activeStatus) params.estado = activeStatus
      if (search) params.cliente = search
      const result = await getEstadias(params)
      if (result.success) { setEstadias(result.data || []); if (result.meta) setMeta(result.meta) }
      else setError(result.error?.message || 'Error')
    } catch { setError('Error de conexión') }
    finally { setLoading(false) }
  }

  useEffect(() => { loadEstadias() }, [activeStatus])
  const handleSearch = () => loadEstadias(1)
  const totalAll = STATUS_ORDER.reduce((s, k) => s + (statusCounts[k] || 0), 0)

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Header — bigger logos */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-fadeInDown">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <img src="/caracol-logo.png" alt="Playa Caracol" className="w-14 h-14 rounded-xl object-contain bg-gradient-to-br from-blue-50 to-blue-100 p-1.5 shadow-md ring-1 ring-blue-200/50" />
            <img src="/casa-mahana-logo.png" alt="Casa Mahana" className="w-14 h-14 rounded-xl object-contain bg-gradient-to-br from-purple-50 to-purple-100 p-1.5 shadow-md ring-1 ring-purple-200/50" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-azul-900">Estadías</h1>
            <p className="text-sm text-gray-500">{meta.total} solicitudes</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => {
            const params = new URLSearchParams()
            if (activeStatus) params.set('estado', activeStatus)
            downloadCSV(`/api/v1/estadias/export?${params}`, `estadias_${new Date().toISOString().split('T')[0]}.csv`)
          }} className="card-premium-interactive flex items-center gap-1.5 text-azul-800 px-4 py-2.5 font-medium text-sm">
            <Download className="w-4 h-4" /> Exportar
          </button>
          <button onClick={() => navigate('/estadias/nuevo')} className="bg-gradient-to-r from-purple-600 to-purple-500 text-white px-5 py-2.5 rounded-xl font-medium btn-premium shadow-purple-500/20">
            + Nueva Estadía
          </button>
        </div>
      </div>

      {/* Status Pipeline + Leads KPI */}
      <div className="card-premium p-4 animate-fadeInUp">
        <div className="grid grid-cols-6 gap-2">
          {STATUS_ORDER.map((status) => {
            const conf = statusConfig[status]
            const count = statusCounts[status] || 0
            const isActive = activeStatus === status
            return (
              <button key={status} onClick={() => setActiveStatus(isActive ? null : status)}
                className={`rounded-xl p-3 text-center transition-all border-2 ${
                  isActive ? `${conf.bg} ${conf.text} ${conf.border} shadow-md scale-[1.03]` : 'bg-gray-50/50 border-transparent hover:border-gray-200 hover:bg-white'
                }`}>
                <span className="text-lg block mb-0.5">{conf.icon}</span>
                <span className="text-2xl font-bold block text-azul-900">{count}</span>
                <span className="text-[9px] sm:text-[10px] text-gray-400 font-medium uppercase tracking-wide block mt-0.5">{conf.label}</span>
              </button>
            )
          })}
          {/* Leads Abiertos KPI */}
          <div className="rounded-xl p-3 text-center bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200/50">
            <span className="text-lg block mb-0.5">🔥</span>
            <span className="text-lg font-bold block text-amber-700">{fmt(leadsAbiertos.monto)}</span>
            <span className="text-[9px] sm:text-[10px] text-amber-600 font-medium uppercase tracking-wide block mt-0.5">Leads $</span>
          </div>
        </div>
        {totalAll > 0 && (
          <div className="mt-3 flex h-2 rounded-full overflow-hidden bg-gray-100">
            {STATUS_ORDER.map((status) => {
              const count = statusCounts[status] || 0
              if (count === 0) return null
              const pct = (count / totalAll) * 100
              const conf = statusConfig[status]
              return <div key={status} className={`${conf.dot} transition-all`} style={{ width: `${pct}%` }} />
            })}
          </div>
        )}
      </div>

      {/* Search */}
      <div className="card-premium p-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Buscar por cliente..." value={search}
              onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm" />
          </div>
          <button onClick={handleSearch} className="px-4 py-2 bg-azul-900 text-white rounded-lg hover:bg-azul-800 transition-colors text-sm font-medium">Buscar</button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-8 h-8 animate-spin text-purple-600" /></div>
      ) : error ? (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <AlertCircle className="w-8 h-8 text-red-600 mx-auto mb-2" />
          <p className="text-gray-500 mb-4">{error}</p>
          <button onClick={() => loadEstadias()} className="px-4 py-2 bg-purple-600 text-white rounded-lg">Reintentar</button>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden lg:block card-premium overflow-hidden animate-fadeInUp">
            <table className="w-full table-premium">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Cliente</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Propiedad</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Fechas</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Huésp.</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-3 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Ganancia</th>
                  <th className="px-4 py-3 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {estadias.length > 0 ? estadias.map((e, i) => {
                  const conf = statusConfig[e.estado] || statusConfig['Solicitada']
                  return (
                    <tr key={e.id} className={`cursor-pointer transition-all duration-150 ${i % 2 === 0 ? '' : 'bg-gray-50/30'} hover:bg-purple-50/20`}
                      onClick={() => navigate(`/estadias/${e.id}/editar`)}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-azul-900 text-sm">{e.cliente}</p>
                        {e.email && <p className="text-[11px] text-gray-400 truncate max-w-[180px]">{e.email}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-sm text-gray-700">
                          <Building2 className="w-3 h-3 text-purple-400" />{e.propiedad}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-gray-400" />
                          <span>{e.check_in}</span>
                          <span className="text-gray-300">→</span>
                          <span>{e.check_out}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        <span className="inline-flex items-center gap-1"><Users className="w-3 h-3 text-gray-400" />{e.huespedes || '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${conf.bg} ${conf.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${conf.dot}`} />{e.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {e.monto_comision ? (
                          <span className="font-semibold text-green-600 text-sm">${Math.round(e.monto_comision).toLocaleString()}</span>
                        ) : (
                          <span className="text-gray-300 text-sm">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {e.fuente === 'openclaw' && <Bot className="w-3.5 h-3.5 text-purple-400 inline" />}
                        {e.fuente === 'manual' && <User className="w-3.5 h-3.5 text-gray-300 inline" />}
                      </td>
                    </tr>
                  )
                }) : (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400 text-sm">No hay estadías{activeStatus ? ` con estado "${activeStatus}"` : ''}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden space-y-2.5">
            {estadias.length > 0 ? estadias.map((e) => {
              const conf = statusConfig[e.estado] || statusConfig['Solicitada']
              return (
                <div key={e.id} className="card-premium-interactive p-4"
                  onClick={() => navigate(`/estadias/${e.id}/editar`)}>
                  <div className="flex justify-between items-start mb-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-azul-900 text-sm truncate">{e.cliente}</h3>
                      <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><Building2 className="w-3 h-3 text-purple-400" />{e.propiedad}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ml-2 ${conf.bg} ${conf.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${conf.dot}`} />{e.estado}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />{e.check_in} → {e.check_out}
                    </span>
                    <span className="font-semibold text-green-600">{e.monto_comision ? `$${Math.round(e.monto_comision)}` : '—'}</span>
                  </div>
                  {e.huespedes && (
                    <div className="mt-1.5 text-[10px] text-gray-400 flex items-center gap-1">
                      <Users className="w-3 h-3" /> {e.huespedes} huéspedes
                      {e.fuente === 'openclaw' && <Bot className="w-3 h-3 text-purple-300 ml-auto" />}
                    </div>
                  )}
                </div>
              )
            }) : (
              <div className="bg-white rounded-xl shadow-sm p-10 text-center text-gray-400 text-sm">No hay estadías{activeStatus ? ` con estado "${activeStatus}"` : ''}</div>
            )}
          </div>

          {meta.pages > 1 && (
            <div className="flex justify-center items-center gap-2">
              <button disabled={meta.page <= 1} onClick={() => loadEstadias(meta.page - 1)}
                className="p-2 bg-white rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-500 px-3 font-medium">{meta.page} / {meta.pages}</span>
              <button disabled={meta.page >= meta.pages} onClick={() => loadEstadias(meta.page + 1)}
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
