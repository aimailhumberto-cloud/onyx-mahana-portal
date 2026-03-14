import { useEffect, useState } from 'react'
import {
  Calendar, DollarSign, Building2, TrendingUp, RefreshCw,
  Loader2, AlertCircle, Clock, Users
} from 'lucide-react'
import { getDashboard } from '../api/api'
import type { DashboardData } from '../api/api'

export default function AdminPanel() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getDashboard()
      if (result.success) setData(result.data)
      else setError(result.error?.message || 'Error')
    } catch { setError('Error de conexión') }
    finally { setLoading(false) }
  }

  useEffect(() => { loadData() }, [])

  const handleSync = () => {
    setSyncing(true)
    loadData().finally(() => setSyncing(false))
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-turquoise-600" /></div>
  if (error || !data) return (
    <div className="bg-white rounded-xl shadow-sm p-8 text-center">
      <AlertCircle className="w-8 h-8 text-red-600 mx-auto mb-2" />
      <p className="text-gray-500 mb-4">{error}</p>
      <button onClick={loadData} className="px-4 py-2 bg-turquoise-600 text-white rounded-lg">Reintentar</button>
    </div>
  )

  const stats = [
    { label: 'Total Reservas', value: data.resumen.tours_total, icon: Calendar, color: 'bg-turquoise-500' },
    { label: 'Ingresos Total', value: `$${Math.round(data.resumen.ingresos_total).toLocaleString()}`, icon: DollarSign, color: 'bg-green-500' },
    { label: 'Ganancia Mahana', value: `$${Math.round(data.resumen.ganancia_total).toLocaleString()}`, icon: TrendingUp, color: 'bg-arena-500' },
    { label: 'Estadías', value: data.resumen.estadias_total, icon: Building2, color: 'bg-purple-500' },
    { label: 'Pendientes', value: data.resumen.estadias_pendientes || 0, icon: Clock, color: 'bg-orange-500' },
    { label: 'Confirmadas', value: data.resumen.estadias_confirmadas || 0, icon: Users, color: 'bg-blue-500' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-azul-900">Administración</h1>
          <p className="text-gray-500 text-sm">Métricas y resumen ejecutivo</p>
        </div>
        <button onClick={handleSync} disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 bg-turquoise-600 text-white rounded-lg hover:bg-turquoise-700 transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl shadow-sm p-4 hover:shadow-md transition-shadow">
            <div className={`w-10 h-10 ${stat.color} rounded-lg flex items-center justify-center mb-3`}>
              <stat.icon className="w-5 h-5 text-white" />
            </div>
            <p className="text-xs text-gray-500 mb-1">{stat.label}</p>
            <p className="text-xl font-bold text-azul-900">
              {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-azul-900 mb-4">Tours Mahana (Directos)</h2>
          <div className="space-y-3">
            <div className="flex justify-between"><span className="text-gray-600">Cantidad</span><span className="font-semibold">{data.tours_mahana.total}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Ingresos</span><span className="font-semibold text-green-600">${Math.round(data.tours_mahana.ingresos).toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Ganancia</span><span className="font-semibold text-turquoise-600">${Math.round(data.tours_mahana.ganancia).toLocaleString()}</span></div>
            {data.tours_mahana.ingresos > 0 && (
              <div className="flex justify-between pt-2 border-t border-gray-100">
                <span className="text-gray-600">Margen</span>
                <span className="font-semibold text-azul-900">{Math.round((data.tours_mahana.ganancia / data.tours_mahana.ingresos) * 100)}%</span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-azul-900 mb-4">Ventas Partners (Caracol)</h2>
          <div className="space-y-3">
            <div className="flex justify-between"><span className="text-gray-600">Cantidad</span><span className="font-semibold">{data.ventas_partners.total}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Ingresos</span><span className="font-semibold text-green-600">${Math.round(data.ventas_partners.ingresos).toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Comisiones</span><span className="font-semibold text-purple-600">${Math.round(data.ventas_partners.comisiones).toLocaleString()}</span></div>
          </div>
        </div>
      </div>

      {/* System Info */}
      <div className="bg-gradient-to-r from-azul-900 to-azul-800 rounded-xl shadow-sm p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold mb-1">Mahana Portal v2.0</h3>
            <p className="text-gray-300 text-sm">API-first • OpenClaw ready • SQLite</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-300">Última actualización</p>
            <p className="font-medium">{new Date().toLocaleString('es-PA')}</p>
          </div>
        </div>
      </div>
    </div>
  )
}