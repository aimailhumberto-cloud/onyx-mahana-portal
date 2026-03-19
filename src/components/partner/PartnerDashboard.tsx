import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Calendar, DollarSign, TrendingUp, Receipt, ArrowRight,
  Loader2, AlertCircle, ChevronDown, Phone, CheckCircle, Clock, XCircle
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts'
import { getPartnerDashboard } from '../../api/api'
import type { PartnerDashboardData } from '../../api/api'

const PIE_COLORS = ['#14b8a6', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16']

const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`

const formatMonth = (m: string) => {
  if (m === 'todo') return 'Todos los tiempos'
  if (m.length === 4) return `Año ${m}`
  const [y, mo] = m.split('-')
  const names = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return `${names[parseInt(mo) - 1]} ${y}`
}

const STATUS_COLORS: Record<string, string> = {
  'Consulta': 'bg-yellow-100 text-yellow-800',
  'Reservado': 'bg-blue-100 text-blue-800',
  'Pagado': 'bg-green-100 text-green-800',
  'Cancelado': 'bg-red-100 text-red-800',
}

export default function PartnerDashboard() {
  const navigate = useNavigate()
  const [data, setData] = useState<PartnerDashboardData | null>(null)
  const [selectedMonth, setSelectedMonth] = useState('')
  const [showMonthPicker, setShowMonthPicker] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadAll = async (mes?: string) => {
    try {
      setLoading(true)
      const params: Record<string, string> = {}
      if (mes) params.mes = mes
      const res = await getPartnerDashboard(params)
      if (res.success) {
        setData(res.data)
        if (!mes && res.data.mesActual) setSelectedMonth(res.data.mesActual)
      } else {
        setError(res.error?.message || 'Error')
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

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
  if (error || !data) return (
    <div className="bg-white rounded-xl shadow-sm p-8 text-center">
      <AlertCircle className="w-8 h-8 text-red-600 mx-auto mb-4" />
      <p className="text-gray-500 mb-4">{error}</p>
      <button onClick={() => window.location.reload()} className="px-4 py-2 bg-blue-600 text-white rounded-lg">Reintentar</button>
    </div>
  )

  const kpis = data.kpis

  return (
    <div className="space-y-3">
      {/* Brand Header with integrated Month Filter — same as admin */}
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-[#1a2744] rounded-2xl px-5 py-4 text-white">
        <div className="flex items-center gap-4">
          <img src="/caracol-logo.png" alt="Playa Caracol" className="w-14 h-14 rounded-xl object-contain bg-white p-1 shadow-lg ring-2 ring-white/20" />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold">Portal de Reservas</h1>
            <p className="text-gray-300 text-xs">Playa Caracol — Powered by Mahana</p>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <img src="/mahana-logo.jpg" alt="Mahana" className="h-7 rounded-md bg-white px-1.5 py-0.5" />
          </div>
          <div className="relative">
            <button onClick={() => setShowMonthPicker(!showMonthPicker)}
              className="flex items-center gap-2 px-3 py-1.5 bg-white/10 border border-white/20 rounded-lg text-sm font-medium text-white hover:bg-white/20 transition-colors">
              <Calendar className="w-3.5 h-3.5 text-blue-300" />
              {formatMonth(selectedMonth)}
              <ChevronDown className="w-3 h-3 text-gray-300" />
            </button>
            {showMonthPicker && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl shadow-xl border border-gray-100 z-20 max-h-64 overflow-y-auto">
                <button onClick={() => handleMonthChange('todo')}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${selectedMonth === 'todo' ? 'font-semibold text-blue-600 bg-blue-50' : 'text-gray-700'}`}>
                  📅 Todo el historial
                </button>
                {data.mesesDisponibles.length > 0 && (
                  <button onClick={() => handleMonthChange(data.mesesDisponibles[0].substring(0, 4))}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 text-gray-700 border-t border-gray-100">
                    📆 Año {data.mesesDisponibles[0].substring(0, 4)}
                  </button>
                )}
                <div className="border-t border-gray-100" />
                {data.mesesDisponibles.map((m) => (
                  <button key={m} onClick={() => handleMonthChange(m)}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${selectedMonth === m ? 'font-semibold text-blue-600 bg-blue-50' : 'text-gray-700'}`}>
                    {formatMonth(m)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats Grid — compact, same as admin */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { label: 'Total Tours', value: kpis.total_tours.toString(), icon: Calendar, color: 'bg-blue-500', tc: '' },
          { label: 'Monto Pagado', value: fmt(kpis.total_pagado), icon: DollarSign, color: 'bg-green-500', tc: 'text-green-600' },
          { label: 'ITBM (7%)', value: fmt(kpis.itbm), icon: Receipt, color: 'bg-orange-500', tc: 'text-orange-600' },
          { label: 'Comisión Caracol', value: fmt(kpis.total_comision), icon: TrendingUp, color: 'bg-purple-500', tc: 'text-purple-600' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl shadow-sm px-3 py-3 border border-gray-100">
            <div className="flex items-center gap-2 mb-1">
              <div className={`${s.color} p-1.5 rounded-md`}><s.icon className="w-3.5 h-3.5 text-white" /></div>
              <span className="text-[10px] text-gray-500 uppercase font-medium">{s.label}</span>
            </div>
            <p className={`text-xl font-bold ${s.tc || 'text-gray-900'}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Four-column: Status flow breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="bg-white rounded-xl shadow-sm px-4 py-3 border border-gray-100">
          <div className="flex items-center justify-between mb-1.5">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Por Aprobar</h3>
              <p className="text-[9px] text-gray-400 uppercase tracking-wide">Pendientes revisión</p>
            </div>
            <div className="bg-orange-500 p-1.5 rounded-md"><AlertCircle className="w-3.5 h-3.5 text-white" /></div>
          </div>
          <p className="text-2xl font-bold text-orange-600">{kpis.por_aprobar}</p>
          {(kpis as any).monto_por_aprobar > 0 && (
            <div className="flex items-center gap-3 mt-1 text-xs">
              <span className="text-gray-500">Monto: <strong className="text-orange-600">{fmt((kpis as any).monto_por_aprobar)}</strong></span>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm px-4 py-3 border border-gray-100">
          <div className="flex items-center justify-between mb-1.5">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Aprobados</h3>
              <p className="text-[9px] text-gray-400 uppercase tracking-wide">Revisados por Mahana</p>
            </div>
            <div className="bg-blue-500 p-1.5 rounded-md"><CheckCircle className="w-3.5 h-3.5 text-white" /></div>
          </div>
          <p className="text-2xl font-bold text-blue-600">{kpis.aprobados}</p>
          {(kpis as any).monto_aprobados > 0 && (
            <div className="flex items-center gap-3 mt-1 text-xs">
              <span className="text-gray-500">Monto: <strong className="text-blue-600">{fmt((kpis as any).monto_aprobados)}</strong></span>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm px-4 py-3 border border-gray-100">
          <div className="flex items-center justify-between mb-1.5">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Reservados</h3>
              <p className="text-[9px] text-gray-400 uppercase tracking-wide">Tour confirmado</p>
            </div>
            <div className="bg-green-500 p-1.5 rounded-md"><Clock className="w-3.5 h-3.5 text-white" /></div>
          </div>
          <p className="text-2xl font-bold text-green-600">{kpis.reservados}</p>
          {(kpis as any).monto_reservados > 0 && (
            <div className="flex items-center gap-3 mt-1 text-xs">
              <span className="text-gray-500">Monto: <strong className="text-green-600">{fmt((kpis as any).monto_reservados)}</strong></span>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm px-4 py-3 border border-gray-100">
          <div className="flex items-center justify-between mb-1.5">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Rechazados</h3>
              <p className="text-[9px] text-gray-400 uppercase tracking-wide">No aprobados</p>
            </div>
            <div className="bg-red-500 p-1.5 rounded-md"><XCircle className="w-3.5 h-3.5 text-white" /></div>
          </div>
          <p className="text-2xl font-bold text-red-600">{kpis.rechazados}</p>
          {(kpis as any).monto_rechazados > 0 && (
            <div className="flex items-center gap-3 mt-1 text-xs">
              <span className="text-gray-500">Monto: <strong className="text-red-600">{fmt((kpis as any).monto_rechazados)}</strong></span>
            </div>
          )}
        </div>
      </div>

      {/* Charts — compact, same as admin */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {data.ingresosPorMes && data.ingresosPorMes.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Ingresos por Mes</h3>
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={data.ingresosPorMes} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="mes" tick={{ fontSize: 9 }} tickFormatter={(v) => { const p = String(v).split('-'); return `${p[1]}/${p[0]?.slice(2)}`; }} />
                <YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => `$${(Number(v)/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any) => [`${fmt(Number(v))}`, '']} labelFormatter={(l: any) => `${formatMonth(String(l))}`} />
                <Bar dataKey="ingresos" name="Ingresos" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="comision" name="Comisión" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center justify-center gap-4 mt-1 text-[10px] text-gray-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-blue-500 inline-block" /> Ingresos</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-purple-500 inline-block" /> Comisión</span>
            </div>
          </div>
        )}

        {data.topTours && data.topTours.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Distribución por Actividad</h3>
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <ResponsiveContainer width={150} height={150}>
                <PieChart>
                  <Pie data={data.topTours} nameKey="nombre" dataKey="cantidad"
                    cx="50%" cy="50%" outerRadius={68} innerRadius={35} paddingAngle={2}>
                    {data.topTours.map((_: any, i: number) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1">
                {data.topTours.map((a, i) => {
                  const total = data.topTours.reduce((s, x) => s + x.cantidad, 0)
                  const pct = total > 0 ? Math.round((a.cantidad / total) * 100) : 0
                  return (
                    <div key={a.nombre} className="flex items-center gap-2 text-xs">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="truncate text-gray-700 flex-1">{a.nombre}</span>
                      <span className="font-medium text-gray-900 shrink-0">{a.cantidad}</span>
                      <span className="text-gray-400 text-[10px] shrink-0">({pct}%)</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Recent Activity — 3 items max, same as admin */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Clientes Recientes</h2>
          <button onClick={() => navigate('/reservas')} className="text-[10px] text-blue-600 font-medium hover:underline">
            Ver todos →
          </button>
        </div>
        <div className="divide-y divide-gray-50">
          {data.clientesRecientes && data.clientesRecientes.length > 0 ? (
            data.clientesRecientes.slice(0, 3).map((item, i) => (
              <div key={`${item.cliente}-${i}`} className="px-4 py-2.5 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <span className="text-xs px-2 py-0.5 rounded-md font-medium bg-blue-100 text-blue-700">🏄</span>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 text-xs truncate">{item.cliente}</p>
                    <p className="text-[10px] text-gray-500 truncate">{item.actividad} · {item.fecha}</p>
                  </div>
                </div>
                  <div className="flex items-center gap-2 text-right shrink-0">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${STATUS_COLORS[item.estatus] || 'bg-gray-100 text-gray-600'}`}>{item.estatus}</span>
                    {item.whatsapp && <Phone className="w-3 h-3 text-gray-400" />}
                  </div>
              </div>
            ))
          ) : (
            <div className="px-4 py-6 text-center text-gray-500 text-sm">No hay clientes recientes</div>
          )}
        </div>
      </div>

      {/* Quick Actions — same as admin */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <button onClick={() => navigate('/solicitar')} className="bg-gradient-to-r from-blue-600 to-blue-500 text-white py-2.5 px-3 rounded-xl text-sm font-medium hover:shadow-lg hover:scale-[1.02] transition-all">
          + Solicitar Tour
        </button>
        <button onClick={() => navigate('/reservas')} className="bg-white border border-gray-200 text-gray-900 py-2.5 px-3 rounded-xl text-sm font-medium hover:bg-gray-50 transition-all flex items-center justify-center gap-1">
          Mis Reservas <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
