import { useState } from 'react'
import { 
  Search, 
  Filter, 
  ChevronDown,
  Calendar,
  User,
  DollarSign
} from 'lucide-react'

const categories = [
  { id: 'all', name: 'Todos', count: 45 },
  { id: 'surf', name: 'Surf', count: 12 },
  { id: 'tours', name: 'Tours', count: 18 },
  { id: 'cascadas', name: 'Cascadas', count: 8 },
  { id: 'kite', name: 'Kite/Wing', count: 7 },
]

const mockReservations = [
  { id: 1, client: 'Juan Pérez', activity: 'Surf 101', date: '2024-03-12', time: '09:00', status: 'confirmada', amount: 55, seller: 'Mahana' },
  { id: 2, client: 'María García', activity: 'Tour Cascadas', date: '2024-03-12', time: '10:00', status: 'pendiente', amount: 120, seller: 'Caracol' },
  { id: 3, client: 'Carlos López', activity: 'Day Pass', date: '2024-03-13', time: '14:00', status: 'confirmada', amount: 30, seller: 'Mahana' },
  { id: 4, client: 'Ana Martínez', activity: 'Kite Surf', date: '2024-03-13', time: '11:00', status: 'pagada', amount: 85, seller: 'Mahana' },
]

const statusColors: Record<string, string> = {
  confirmada: 'bg-turquoise-100 text-turquoise-700 border-turquoise-200',
  pendiente: 'bg-arena-100 text-arena-700 border-arena-200',
  pagada: 'bg-green-100 text-green-700 border-green-200',
  cancelada: 'bg-red-100 text-red-700 border-red-200',
}

export default function ToursList() {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [activeStatus, setActiveStatus] = useState<string | null>(null)

  const filteredReservations = mockReservations.filter(r => {
    if (search && !r.client.toLowerCase().includes(search.toLowerCase())) return false
    if (activeStatus && r.status !== activeStatus) return false
    return true
  })

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-bold text-azul-900">Tours Mahana</h1>
        <button className="bg-turquoise-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-turquoise-700 transition-colors">
          + Nueva Reserva
        </button>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-xl shadow-sm p-4 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-turquoise-500"
          />
        </div>

        {/* Status Filters */}
        <div className="flex flex-wrap gap-2">
          {['confirmada', 'pendiente', 'pagada', 'cancelada'].map((status) => (
            <button
              key={status}
              onClick={() => setActiveStatus(activeStatus === status ? null : status)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                activeStatus === status
                  ? statusColors[status]
                  : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex overflow-x-auto gap-2 pb-2">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
              activeCategory === cat.id
                ? 'bg-azul-900 text-white'
                : 'bg-white text-azul-900 hover:bg-gray-100'
            }`}
          >
            {cat.name} ({cat.count})
          </button>
        ))}
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actividad</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Monto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredReservations.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 font-medium text-azul-900">{r.client}</td>
                <td className="px-6 py-4 text-gray-600">{r.activity}</td>
                <td className="px-6 py-4 text-gray-600">{r.date} {r.time}</td>
                <td className="px-6 py-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[r.status]}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right font-medium text-azul-900">${r.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {filteredReservations.map((r) => (
          <div key={r.id} className="bg-white rounded-xl shadow-sm p-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="font-medium text-azul-900">{r.client}</h3>
                <p className="text-sm text-gray-500">{r.activity}</p>
              </div>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[r.status]}`}>
                {r.status}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 flex items-center gap-1">
                <Calendar className="w-4 h-4" /> {r.date}
              </span>
              <span className="font-medium text-azul-900">${r.amount}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex justify-center gap-2">
        <button className="px-4 py-2 bg-white rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
          Anterior
        </button>
        <button className="px-4 py-2 bg-turquoise-600 text-white rounded-lg font-medium">
          1
        </button>
        <button className="px-4 py-2 bg-white rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
          2
        </button>
        <button className="px-4 py-2 bg-white rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
          Siguiente
        </button>
      </div>
    </div>
  )
}