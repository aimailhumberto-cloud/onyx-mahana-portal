import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Calendar, DollarSign, TrendingUp, Building2, ArrowRight,
  Loader2, AlertCircle, Bot, User, ChevronDown
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts'
import type { DashboardData } from '../api/api'

interface ChartData {
  ingresosPorMes: { mes: string; ingresos: number; ganancia: number; cantidad: number }[]
  porActividad: { nombre: string; cantidad: number; ingresos: number }[]
  mesesDisponibles: string[]
  filteredStats: { cantidad: number; ingresos: number; ganancia: number }
  estadiasFinancieros: { total: number; ingresos: number; comisiones: number }
  mesActual: string
}

const PIE_COLORS = ['#14b8a6', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16']

const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`

const formatMonth = (m: string) => {
  if (m === 'todo') return 'Todos los tiempos'
  if (m.length === 4) return `Año ${m}`
  const [y, mo] = m.split('-')
  const names = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return `${names[parseInt(mo) - 1]} ${y}`
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [charts, setCharts] = useState<ChartData | null>(null)
  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [mesesDisponibles, setMesesDisponibles] = useState<string[]>([])
  const [showMonthPicker, setShowMonthPicker] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const loadAll = async (mes?: string) => {
    try {
      setLoading(true)
      const param = mes || ''
      const dashUrl = param ? `/api/v1/dashboard?mes=${param}` : '/api/v1/dashboard'
      const chartUrl = param ? `/api/v1/charts?mes=${param}` : '/api/v1/charts'

      const [dashRes, chartRes] = await Promise.all([
        fetch(dashUrl).then(r => r.json()),
        fetch(chartUrl).then(r => r.json())
      ])

      if (dashRes.success) {
        setData(dashRes.data)
        if (!mes && dashRes.data.mesActual) {
          setSelectedMonth(dashRes.data.mesActual)
        }
        if (dashRes.data.mesesDisponibles) {
          setMesesDisponibles(dashRes.data.mesesDisponibles)
        }
      } else {
        setError(dashRes.error?.message || 'Error')
      }

      if (chartRes.success) {
        setCharts(chartRes.data)
      }
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  const handleMonthChange = (mes: string) => {
    setSelectedMonth(mes)
    setShowMonthPicker(false)
    loadAll(mes)
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-turquoise-600" /></div>
  if (error || !data) return (
    <div className="bg-white rounded-xl shadow-sm p-8 text-center">
      <AlertCircle className="w-8 h-8 text-red-600 mx-auto mb-4" />
      <p className="text-gray-500 mb-4">{error}</p>
      <button onClick={() => window.location.reload()} className="px-4 py-2 bg-turquoise-600 text-white rounded-lg">Reintentar</button>
    </div>
  )

  const estadiasComisiones = data.estadias?.comisiones || 0
  const ingresosTotalConEstadias = data.resumen.ingresos_total + estadiasComisiones

  const stats = [
    { label: 'Tours Hoy', value: data.resumen.tours_hoy.toString(), icon: Calendar, color: 'bg-turquoise-500', textColor: '' },
    { label: 'Ingresos Total', value: fmt(ingresosTotalConEstadias), icon: DollarSign, color: 'bg-green-500', textColor: 'text-green-600' },
    { label: 'Ganancia Tours', value: fmt(data.resumen.ganancia_total), icon: TrendingUp, color: 'bg-arena-500', textColor: 'text-arena-600' },
    { label: 'Comisiones Estadías', value: fmt(estadiasComisiones), icon: Building2, color: 'bg-purple-500', textColor: 'text-purple-600' },
  ]

  return (
    <div className="space-y-5">
      {/* Brand Header with integrated Month Filter */}
      <div className="bg-gradient-to-r from-azul-900 via-azul-800 to-[#1a2744] rounded-2xl p-5 text-white">
        <div className="flex items-center gap-4">
          <img src="/mahana-logo.jpg" alt="Mahana Tours" className="w-16 h-16 rounded-xl object-cover shadow-lg ring-2 ring-white/20" />
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold">Portal de Reservas</h1>
            <p className="text-gray-300 text-sm">Mahana Tours — Panamá</p>
          </div>
          <div className="hidden sm:flex items-center gap-3">
            <img src="/ans-logo.jpg" alt="ANS" className="h-8 rounded-lg bg-white px-1.5 py-0.5 hover:shadow-md transition-shadow" />
            <img src="/caracol-logo.png" alt="Caracol" className="h-8 rounded-lg bg-white px-1.5 py-0.5 hover:shadow-md transition-shadow" />
          </div>
        </div>
        {/* Month Filter - integrated in header */}
        <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between">
          <span className="text-sm text-gray-300">Período:</span>
          <div className="relative">
            <button onClick={() => setShowMonthPicker(!showMonthPicker)}
              className="flex items-center gap-2 px-4 py-1.5 bg-white/10 border border-white/20 rounded-lg text-sm font-medium text-white hover:bg-white/20 transition-colors">
              <Calendar className="w-4 h-4 text-turquoise-400" />
              {formatMonth(selectedMonth)}
              <ChevronDown className="w-3.5 h-3.5 text-gray-300" />
            </button>
            {showMonthPicker && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl shadow-xl border border-gray-100 z-20 max-h-72 overflow-y-auto">
                <button onClick={() => handleMonthChange('todo')}
                  className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 ${selectedMonth === 'todo' ? 'font-semibold text-turquoise-600 bg-turquoise-50' : 'text-gray-700'}`}>
                  📅 Todo el historial
                </button>
                {mesesDisponibles.length > 0 && (
                  <button onClick={() => handleMonthChange(mesesDisponibles[0].substring(0, 4))}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 text-gray-700 border-t border-gray-100">
                    📆 Año {mesesDisponibles[0].substring(0, 4)}
                  </button>
                )}
                <div className="border-t border-gray-100" />
                {mesesDisponibles.map((m) => (
                  <button key={m} onClick={() => handleMonthChange(m)}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${selectedMonth === m ? 'font-semibold text-turquoise-600 bg-turquoise-50' : 'text-gray-700'}`}>
                    {formatMonth(m)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl shadow-sm p-4 hover:shadow-md transition-shadow border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div className={`${stat.color} p-2 rounded-lg`}>
                <stat.icon className="w-4 h-4 text-white" />
              </div>
            </div>
            <p className={`text-2xl font-bold ${stat.textColor || 'text-azul-900'}`}>{stat.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Three-column: Mahana Tours + Partners + Estadías */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
          <div className="flex items-center gap-2.5 mb-3">
            <img src="/mahana-logo.jpg" alt="Mahana" className="w-8 h-8 rounded-lg object-cover" />
            <div>
              <h3 className="text-sm font-semibold text-azul-900">Mahana Tours</h3>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Ventas Directas</p>
            </div>
          </div>
          <p className="text-3xl font-bold text-azul-900">{data.tours_mahana.total}</p>
          <div className="flex items-center gap-3 mt-2 text-sm">
            <span className="text-gray-500">Ingresos: <strong className="text-green-600">{fmt(data.tours_mahana.ingresos)}</strong></span>
          </div>
          <div className="text-sm text-gray-500 mt-0.5">Ganancia: <strong className="text-turquoise-600">{fmt(data.tours_mahana.ganancia)}</strong></div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
          <div className="flex items-center gap-2.5 mb-3">
            <img src="/caracol-logo.png" alt="Caracol" className="w-8 h-8 rounded-lg object-contain bg-blue-50 p-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-azul-900">Playa Caracol</h3>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Ventas Partners</p>
            </div>
          </div>
          <p className="text-3xl font-bold text-azul-900">{data.ventas_partners.total}</p>
          <div className="flex items-center gap-3 mt-2 text-sm">
            <span className="text-gray-500">Ingresos: <strong className="text-green-600">{fmt(data.ventas_partners.ingresos)}</strong></span>
          </div>
          <div className="text-sm text-gray-500 mt-0.5">Comisiones: <strong className="text-purple-600">{fmt(data.ventas_partners.comisiones)}</strong></div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="flex items-center -space-x-2">
              <img src="/caracol-logo.png" alt="Caracol" className="w-7 h-7 rounded-lg object-contain bg-white p-0.5 ring-2 ring-white shadow-sm" />
              <img src="/casa-mahana-logo.png" alt="Casa Mahana" className="w-7 h-7 rounded-lg object-contain bg-white p-0.5 ring-2 ring-white shadow-sm" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-azul-900">Estadías</h3>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Reservas de Hospedaje</p>
            </div>
          </div>
          <p className="text-3xl font-bold text-azul-900">{data.resumen.estadias_total}</p>
          <div className="flex items-center gap-3 mt-2 text-sm">
            <span className="text-gray-500">Pendientes: <strong className="text-arena-600">{data.resumen.estadias_pendientes}</strong></span>
            <span className="text-gray-500">Confirmadas: <strong className="text-turquoise-600">{data.resumen.estadias_confirmadas}</strong></span>
          </div>
          {estadiasComisiones > 0 && (
            <div className="text-sm text-gray-500 mt-0.5">Comisiones: <strong className="text-purple-600">{fmt(estadiasComisiones)}</strong></div>
          )}
        </div>
      </div>

      {/* Charts Section */}
      {charts && (
        <>
          {/* Filtered KPIs */}
          {charts.filteredStats && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gradient-to-br from-turquoise-50 to-turquoise-100/50 rounded-xl px-4 py-3 text-center border border-turquoise-200/50">
                <p className="text-xs text-turquoise-600 font-medium mb-1">Reservas</p>
                <p className="text-2xl font-bold text-turquoise-700">{charts.filteredStats.cantidad}</p>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-green-100/50 rounded-xl px-4 py-3 text-center border border-green-200/50">
                <p className="text-xs text-green-600 font-medium mb-1">Ingresos</p>
                <p className="text-2xl font-bold text-green-700">{fmt(charts.filteredStats.ingresos)}</p>
              </div>
              <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl px-4 py-3 text-center border border-blue-200/50">
                <p className="text-xs text-blue-600 font-medium mb-1">Ganancia</p>
                <p className="text-2xl font-bold text-blue-700">{fmt(charts.filteredStats.ganancia)}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Bar Chart */}
            {charts.ingresosPorMes.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
                <h3 className="text-base font-semibold text-azul-900 mb-4">Ingresos por Mes</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={charts.ingresosPorMes} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="mes" tick={{ fontSize: 10 }} tickFormatter={(v) => { const p = String(v).split('-'); return `${p[1]}/${p[0]?.slice(2)}`; }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(Number(v)/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v) => [`${fmt(Number(v))}`, '']} labelFormatter={(l) => `${formatMonth(String(l))}`} />
                    <Bar dataKey="ingresos" name="Ingresos" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="ganancia" name="Ganancia" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex items-center justify-center gap-4 mt-2 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-turquoise-500 inline-block" /> Ingresos</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-500 inline-block" /> Ganancia</span>
                </div>
              </div>
            )}

            {/* Donut Chart with Legend */}
            {charts.porActividad.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
                <h3 className="text-base font-semibold text-azul-900 mb-4">Distribución por Actividad</h3>
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <ResponsiveContainer width={180} height={180}>
                    <PieChart>
                      <Pie data={charts.porActividad} nameKey="nombre" dataKey="cantidad"
                        cx="50%" cy="50%" outerRadius={80} innerRadius={40} paddingAngle={2}>
                        {charts.porActividad.map((_: any, i: number) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-1.5">
                    {charts.porActividad.map((a, i) => {
                      const total = charts!.porActividad.reduce((s, x) => s + x.cantidad, 0)
                      const pct = total > 0 ? Math.round((a.cantidad / total) * 100) : 0
                      return (
                        <div key={a.nombre} className="flex items-center gap-2 text-sm">
                          <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                          <span className="truncate text-gray-700 flex-1">{a.nombre}</span>
                          <span className="font-medium text-azul-900 shrink-0">{a.cantidad}</span>
                          <span className="text-gray-400 text-xs shrink-0">({pct}%)</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Tours by Status */}
      <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
        <h3 className="text-base font-semibold text-azul-900 mb-3">Tours por Estado</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-green-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-green-700">{data.tours_por_estatus.pagados}</p>
            <p className="text-xs text-green-600">✅ Pagados</p>
          </div>
          <div className="bg-turquoise-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-turquoise-700">{data.tours_por_estatus.reservados}</p>
            <p className="text-xs text-turquoise-600">📋 Reservados</p>
          </div>
          <div className="bg-arena-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-arena-700">{data.tours_por_estatus.consultas}</p>
            <p className="text-xs text-arena-600">💬 Consultas</p>
          </div>
        </div>
      </div>

      {/* Recent Activity (5 max) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="px-5 py-3.5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-azul-900">Actividad Reciente</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {data.recientes && data.recientes.length > 0 ? (
            data.recientes.slice(0, 5).map((item, i) => (
              <div key={`${item.tipo}-${item.id}-${i}`} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className={`text-xs px-2.5 py-1 rounded-lg font-medium ${
                    item.tipo === 'tour' ? 'bg-turquoise-100 text-turquoise-700' : 'bg-purple-100 text-purple-700'
                  }`}>{item.tipo === 'tour' ? '🏄' : '🏨'}</span>
                  <div className="min-w-0">
                    <p className="font-medium text-azul-900 text-sm truncate">{item.cliente}</p>
                    <p className="text-xs text-gray-500 truncate">{item.descripcion}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 text-right shrink-0">
                  {item.monto && <span className="font-semibold text-sm text-azul-900">{fmt(item.monto)}</span>}
                  <span className="text-[10px] text-gray-400">{item.fecha}</span>
                  {item.fuente === 'openclaw' && <Bot className="w-3.5 h-3.5 text-purple-400" />}
                  {item.fuente === 'manual' && <User className="w-3.5 h-3.5 text-gray-400" />}
                </div>
              </div>
            ))
          ) : (
            <div className="px-5 py-8 text-center text-gray-500">No hay actividad reciente</div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button onClick={() => navigate('/tours/nuevo')} className="bg-gradient-to-r from-turquoise-600 to-turquoise-500 text-white py-3 px-4 rounded-xl font-medium hover:shadow-lg hover:scale-[1.02] transition-all">
          + Nuevo Tour
        </button>
        <button onClick={() => navigate('/estadias/nuevo')} className="bg-gradient-to-r from-purple-600 to-purple-500 text-white py-3 px-4 rounded-xl font-medium hover:shadow-lg hover:scale-[1.02] transition-all">
          + Nueva Estadía
        </button>
        <button onClick={() => navigate('/tours')} className="bg-white border border-gray-200 text-azul-900 py-3 px-4 rounded-xl font-medium hover:bg-gray-50 hover:shadow-sm transition-all flex items-center justify-center gap-2">
          Ver Tours <ArrowRight className="w-4 h-4" />
        </button>
        <button onClick={() => navigate('/estadias')} className="bg-white border border-gray-200 text-azul-900 py-3 px-4 rounded-xl font-medium hover:bg-gray-50 hover:shadow-sm transition-all flex items-center justify-center gap-2">
          Ver Estadías <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
