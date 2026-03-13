import { useEffect, useState } from 'react'
import {
  Calendar,
  DollarSign,
  Clock,
  TrendingUp,
  ArrowRight,
  Loader2,
  AlertCircle
} from 'lucide-react'
import { getDashboard, getTours } from '../api/sheets'
import type { Dashboard, Tour } from '../api/sheets'

const statusColors: Record<string, string> = {
  confirmada: 'bg-turquoise-100 text-turquoise-700',
  pendiente: 'bg-arena-100 text-arena-700',
  cancelada: 'bg-red-100 text-red-700',
}

export default function Dashboard() {
  const [stats, setStats] = useState([
    { label: 'Reservas Hoy', value: '0', change: 0, trend: 'neutral' as 'up' | 'down' | 'neutral', icon: Calendar, color: 'bg-turquoise-500' },
    { label: 'Ingresos Mes', value: '$0', change: 0, trend: 'neutral' as 'up' | 'down' | 'neutral', icon: DollarSign, color: 'bg-arena-500' },
    { label: 'Pendientes', value: '0', change: 0, trend: 'neutral' as 'up' | 'down' | 'neutral', icon: Clock, color: 'bg-azul-600' },
  ])

  const [reservations, setReservations] = useState<
    { id: number; client: string; activity: string; date: string; status: string; amount: number }[]
  >([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      setError(null)
      try {
        const [dashboardData, toursData] = await Promise.all([
          getDashboard(),
          getTours(),
        ])

        // Mapear dashboard data a stats
        setStats([
          {
            label: 'Reservas Hoy',
            value: dashboardData.toursMahana.total.toString(),
            change: 3,
            trend: 'up' as const,
            icon: Calendar,
            color: 'bg-turquoise-500',
          },
          {
            label: 'Ingresos Mes',
            value: `$${dashboardData.toursMahana.ingresos.toLocaleString()}`,
            change: 12,
            trend: 'up' as const,
            icon: DollarSign,
            color: 'bg-arena-500',
          },
          {
            label: 'Pendientes',
            value: dashboardData.crm.pendientes.toString(),
            change: -2,
            trend: 'down' as const,
            icon: Clock,
            color: 'bg-azul-600',
          },
        ])

        // Mapear tours a reservations
        const formattedReservations = (toursData.data || []).slice(0, 4).map((tour, index) => ({
          id: index,
          client: tour.Cliente || 'Sin cliente',
          activity: tour.Actividad || 'Sin actividad',
          date: tour.Fecha || 'Sin fecha',
          status: tour.Estatus?.toLowerCase() || 'pendiente',
          amount: tour['Precio (Ingreso)'] || 0,
        }))
        setReservations(formattedReservations)
      } catch (err) {
        setError('Error al cargar los datos')
        console.error('Error loading dashboard data:', err)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

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
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-turquoise-600 text-white rounded-lg hover:bg-turquoise-700"
        >
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">{stat.label}</p>
                <p className="text-3xl font-bold text-azul-900">{stat.value}</p>
              </div>
              <div className={`${stat.color} p-3 rounded-lg`}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
            </div>
            <div className="flex items-center gap-1 mt-3">
              {stat.trend === 'up' ? (
                <TrendingUp className="w-4 h-4 text-green-500" />
              ) : stat.trend === 'down' ? (
                <TrendingDown className="w-4 h-4 text-red-500" />
              ) : null}
              {stat.trend !== 'neutral' && (
                <span className={`text-sm ${stat.trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
                  {stat.change > 0 ? '+' : ''}{stat.change}% vs ayer
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Recent Reservations */}
      <div className="bg-white rounded-xl shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-azul-900">Reservas Recientes</h2>
          <button className="text-sm text-turquoise-600 hover:text-turquoise-700 flex items-center gap-1">
            Ver todas <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="divide-y divide-gray-100">
          {reservations.length > 0 ? (
            reservations.map((reservation) => (
              <div key={reservation.id} className="px-6 py-4 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-azul-900 truncate">{reservation.client}</p>
                  <p className="text-sm text-gray-500">{reservation.activity}</p>
                </div>
                <div className="text-right mx-4">
                  <p className="text-sm font-medium text-azul-900">${reservation.amount}</p>
                  <p className="text-xs text-gray-400">{reservation.date}</p>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[reservation.status] || statusColors['pendiente']}`}
                >
                  {reservation.status}
                </span>
              </div>
            ))
          ) : (
            <div className="px-6 py-8 text-center text-gray-500">
              No hay reservas recientes
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button className="bg-turquoise-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-turquoise-700 transition-colors">
          Nueva Reserva
        </button>
        <button className="bg-arena-500 text-white py-3 px-4 rounded-lg font-medium hover:bg-arena-600 transition-colors">
          Nueva Solicitud CRM
        </button>
        <button className="bg-white border border-gray-200 text-azul-900 py-3 px-4 rounded-lg font-medium hover:bg-gray-50 transition-colors">
          Exportar Excel
        </button>
        <button className="bg-white border border-gray-200 text-azul-900 py-3 px-4 rounded-lg font-medium hover:bg-gray-50 transition-colors">
          Ver Calendario
        </button>
      </div>
    </div>
  )
}
