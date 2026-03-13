import { useEffect, useState } from 'react'
import {
  Calendar,
  DollarSign,
  Building2,
  Users,
  TrendingUp,
  TrendingDown,
  Download,
  RefreshCw,
  Loader2,
  AlertCircle,
  FileText,
  Clock
} from 'lucide-react'
import { getDashboard, getTours, Dashboard as DashboardType, Tour } from '../api/sheets'

interface Stat {
  label: string
  value: string | number
  change?: number
  trend?: 'up' | 'down' | 'neutral'
  icon: React.ComponentType<{ className?: string }>
  color: string
  bgColor: string
}

export default function AdminPanel() {
  const [stats, setStats] = useState<Stat[]>([
    { label: 'Total Reservas', value: 0, icon: Calendar, color: 'text-turquoise-600', bgColor: 'bg-turquoise-500' },
    { label: 'Ingresos del Mes', value: '$0', icon: DollarSign, color: 'text-green-600', bgColor: 'bg-green-500' },
    { label: 'Ganancia Mahana', value: '$0', icon: TrendingUp, color: 'text-arena-600', bgColor: 'bg-arena-500' },
    { label: 'Ventas Caracol', value: 0, icon: Building2, color: 'text-blue-600', bgColor: 'bg-blue-500' },
    { label: 'CRM Pendientes', value: 0, icon: Clock, color: 'text-orange-600', bgColor: 'bg-orange-500' },
    { label: 'CRM Confirmadas', value: 0, icon: Users, color: 'text-purple-600', bgColor: 'bg-purple-500' },
  ])

  const [recentTours, setRecentTours] = useState<Tour[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [dashboardData, toursData] = await Promise.all([
        getDashboard(),
        getTours(),
      ])

      setStats([
        { label: 'Total Reservas', value: dashboardData.toursMahana.total, icon: Calendar, color: 'text-turquoise-600', bgColor: 'bg-turquoise-500' },
        { label: 'Ingresos del Mes', value: `$${dashboardData.toursMahana.ingresos.toLocaleString()}`, icon: DollarSign, color: 'text-green-600', bgColor: 'bg-green-500' },
        { label: 'Ganancia Mahana', value: `$${dashboardData.toursMahana.ganancia.toLocaleString()}`, icon: TrendingUp, color: 'text-arena-600', bgColor: 'bg-arena-500' },
        { label: 'Ventas Caracol', value: dashboardData.ventasCaracol.total, icon: Building2, color: 'text-blue-600', bgColor: 'bg-blue-500' },
        { label: 'CRM Pendientes', value: dashboardData.crm.pendientes, icon: Clock, color: 'text-orange-600', bgColor: 'bg-orange-500' },
        { label: 'CRM Confirmadas', value: dashboardData.crm.confirmadas, icon: Users, color: 'text-purple-600', bgColor: 'bg-purple-500' },
      ])

      setRecentTours((toursData.data || []).slice(0, 5))
    } catch (err) {
      setError('Error al cargar los datos')
      console.error('Error loading admin data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSync = () => {
    setSyncing(true)
    setTimeout(() => {
      loadData().finally(() => setSyncing(false))
    }, 500)
  }

  const handleExport = () => {
    // TODO: Implementar exportación
    alert('Función de exportación próximamente')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-turquoise-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-8 text-center">
        <div className="bg-red-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-red-600" />
        </div>
        <h3 className="text-lg font-semibold text-azul-900 mb-2">Error al cargar</h3>
        <p className="text-gray-500 mb-4">{error}</p>
        <button
          onClick={loadData}
          className="px-4 py-2 bg-turquoise-600 text-white rounded-lg hover:bg-turquoise-700"
        >
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-azul-900">Administración</h1>
          <p className="text-gray-500 text-sm">Panel de control y métricas</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-azul-900 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Exportar
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-turquoise-600 text-white rounded-lg hover:bg-turquoise-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando...' : 'Sincronizar'}
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl shadow-sm p-4">
            <div className={`w-10 h-10 ${stat.bgColor} rounded-lg flex items-center justify-center mb-3`}>
              <stat.icon className="w-5 h-5 text-white" />
            </div>
            <p className="text-sm text-gray-500 mb-1">{stat.label}</p>
            <p className={`text-2xl font-bold ${stat.color}`}>
              {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Tours */}
        <div className="bg-white rounded-xl shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-turquoise-600" />
              <h2 className="text-lg font-semibold text-azul-900">Reservas Recientes</h2>
            </div>
            <span className="text-sm text-gray-500">{recentTours.length} de hoy</span>
          </div>
          <div className="divide-y divide-gray-100">
            {recentTours.length > 0 ? (
              recentTours.map((tour, index) => (
                <div key={index} className="px-6 py-3 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-azul-900 truncate">{tour.Cliente || 'Sin cliente'}</p>
                    <p className="text-sm text-gray-500">{tour.Actividad || 'Sin actividad'}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-azul-900">${tour['Precio (Ingreso)']?.toLocaleString() || 0}</p>
                    <p className="text-xs text-gray-400">{tour.Fecha}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-6 py-8 text-center text-gray-500">
                No hay reservas recientes
              </div>
            )}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="bg-white rounded-xl shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
            <FileText className="w-5 h-5 text-arena-600" />
            <h2 className="text-lg font-semibold text-azul-900">Resumen Ejecutivo</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Tours este mes</span>
              <span className="font-semibold text-azul-900">{recentTours.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Tasa de conversión CRM</span>
              <span className="font-semibold text-green-600">
                {stats[0].value && stats[4].value
                  ? `${Math.round((Number(stats[5].value) / (Number(stats[4].value) + Number(stats[5].value) || 1)) * 100)}%`
                  : '0%'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Margen promedio</span>
              <span className="font-semibold text-turquoise-600">
                {stats[0].value && Number(stats[0].value) > 0
                  ? `${Math.round((Number(stats[2].value.toString().replace('$', '').replace(',', '')) / Number(stats[1].value.toString().replace('$', '').replace(',', '')) || 0) * 100)}%`
                  : '0%'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* System Info */}
      <div className="bg-gradient-to-r from-azul-900 to-azul-800 rounded-xl shadow-sm p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold mb-1">Mahana Tours Portal</h3>
            <p className="text-gray-300 text-sm">Sistema de gestión de reservas v1.0</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-300">Última sincronización</p>
            <p className="font-medium">{new Date().toLocaleString('es-PA')}</p>
          </div>
        </div>
      </div>
    </div>
  )
}