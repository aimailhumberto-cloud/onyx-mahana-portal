import { 
  Calendar, 
  DollarSign, 
  Clock, 
  TrendingUp, 
  TrendingDown,
  ArrowRight
} from 'lucide-react'

const stats = [
  { 
    label: 'Reservas Hoy', 
    value: '12', 
    change: 3, 
    trend: 'up',
    icon: Calendar,
    color: 'bg-turquoise-500'
  },
  { 
    label: 'Ingresos Mes', 
    value: '$4,250', 
    change: 12, 
    trend: 'up',
    icon: DollarSign,
    color: 'bg-arena-500'
  },
  { 
    label: 'Pendientes', 
    value: '5', 
    change: -2, 
    trend: 'down',
    icon: Clock,
    color: 'bg-azul-600'
  },
]

const recentReservations = [
  { id: 1, client: 'Juan Pérez', activity: 'Surf 101', date: '2024-03-12', status: 'confirmada', amount: 55 },
  { id: 2, client: 'María García', activity: 'Tour Cascadas', date: '2024-03-12', status: 'pendiente', amount: 120 },
  { id: 3, client: 'Carlos López', activity: 'Day Pass Caracol', date: '2024-03-13', status: 'confirmada', amount: 30 },
  { id: 4, client: 'Ana Martínez', activity: 'Kite Surf', date: '2024-03-13', status: 'cancelada', amount: 85 },
]

const statusColors: Record<string, string> = {
  confirmada: 'bg-turquoise-100 text-turquoise-700',
  pendiente: 'bg-arena-100 text-arena-700',
  cancelada: 'bg-red-100 text-red-700',
}

export default function Dashboard() {
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
              ) : (
                <TrendingDown className="w-4 h-4 text-red-500" />
              )}
              <span className={`text-sm ${stat.trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
                {stat.change > 0 ? '+' : ''}{stat.change}% vs ayer
              </span>
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
          {recentReservations.map((reservation) => (
            <div key={reservation.id} className="px-6 py-4 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-azul-900 truncate">{reservation.client}</p>
                <p className="text-sm text-gray-500">{reservation.activity}</p>
              </div>
              <div className="text-right mx-4">
                <p className="text-sm font-medium text-azul-900">${reservation.amount}</p>
                <p className="text-xs text-gray-400">{reservation.date}</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[reservation.status]}`}>
                {reservation.status}
              </span>
            </div>
          ))}
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