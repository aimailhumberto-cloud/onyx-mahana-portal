import { useState, useEffect } from 'react'
import {
  Search,
  Calendar,
  Loader2,
  AlertCircle
} from 'lucide-react'
import { getTours, Tour } from '../api/sheets'

const categories = [
  { id: 'all', name: 'Todos', count: 45 },
  { id: 'surf', name: 'Surf', count: 12 },
  { id: 'tours', name: 'Tours', count: 18 },
  { id: 'cascadas', name: 'Cascadas', count: 8 },
  { id: 'kite', name: 'Kite/Wing', count: 7 },
]

// Status colors - supports both Spanish (from API) and English (fallback)
const statusColors: Record<string, string> = {
  // Spanish status from API
  'pagado': 'bg-green-100 text-green-700 border-green-200',
  'reservado': 'bg-turquoise-100 text-turquoise-700 border-turquoise-200',
  'consulta': 'bg-arena-100 text-arena-700 border-arena-200',
  'cerrado': 'bg-gray-100 text-gray-700 border-gray-200',
  'cancelado': 'bg-red-100 text-red-700 border-red-200',
  // Legacy English status (fallback)
  'confirmada': 'bg-turquoise-100 text-turquoise-700 border-turquoise-200',
  'pendiente': 'bg-arena-100 text-arena-700 border-arena-200',
  'pagada': 'bg-green-100 text-green-700 border-green-200',
  'cancelada': 'bg-red-100 text-red-700 border-red-200',
}

export default function ToursList() {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [activeStatus, setActiveStatus] = useState<string | null>(null)
  const [tours, setTours] = useState<Tour[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadTours = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await getTours()
        setTours(data.data || [])
      } catch (err) {
        setError('Error al cargar los tours')
        console.error('Error loading tours:', err)
      } finally {
        setLoading(false)
      }
    }

    loadTours()
  }, [])

  // Filtrar tours
  const filteredReservations = tours.filter((tour) => {
    if (search && !tour.Cliente?.toLowerCase().includes(search.toLowerCase())) return false
    if (activeStatus && tour.Estatus?.toLowerCase() !== activeStatus) return false
    return true
  })

  // Formatear datos para mostrar
  const formattedReservations = filteredReservations.map((tour, index) => ({
    id: index,
    client: tour.Cliente || 'Sin cliente',
    activity: tour.Actividad || 'Sin actividad',
    date: tour.Fecha || 'Sin fecha',
    time: tour.Hora || '',
    status: tour.Estatus?.toLowerCase() || 'pendiente',
    amount: tour['Precio (Ingreso)'] || 0,
    seller: tour.Vendedor || 'Sin vendedor',
  }))

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

        {/* Status Filters - Spanish values from API */}
        <div className="flex flex-wrap gap-2">
          {['Pagado', 'Reservado', 'Consulta', 'Cancelado'].map((status) => (
            <button
              key={status}
              onClick={() => setActiveStatus(activeStatus === status.toLowerCase() ? null : status.toLowerCase())}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                activeStatus === status.toLowerCase()
                  ? statusColors[status.toLowerCase()] || statusColors['pendiente']
                  : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
              }`}
            >
              {status}
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
            {formattedReservations.length > 0 ? (
              formattedReservations.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-azul-900">{r.client}</td>
                  <td className="px-6 py-4 text-gray-600">{r.activity}</td>
                  <td className="px-6 py-4 text-gray-600">
                    {r.date} {r.time}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[r.status] || statusColors['pendiente']}`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-medium text-azul-900">${r.amount}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  No hay tours que coincidan con tu búsqueda
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {formattedReservations.length > 0 ? (
          formattedReservations.map((r) => (
            <div key={r.id} className="bg-white rounded-xl shadow-sm p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-medium text-azul-900">{r.client}</h3>
                  <p className="text-sm text-gray-500">{r.activity}</p>
                </div>
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                    statusColors[r.status] || statusColors['pendiente']
                  }`}
                >
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
          ))
        ) : (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <p className="text-gray-500">No hay tours que coincidan con tu búsqueda</p>
          </div>
        )}
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
