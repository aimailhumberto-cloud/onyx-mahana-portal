import { useState, useEffect } from 'react'
import {
  Search,
  Calendar,
  Loader2,
  AlertCircle,
  Users,
  BedDouble,
  CheckCircle,
  XCircle,
  Mail,
  Phone
} from 'lucide-react'
import { getCRM, CRMRequest } from '../api/sheets'

// Status colors - Spanish status from API
const statusColors: Record<string, string> = {
  '📥 solicitada': 'bg-gray-100 text-gray-700 border-gray-200',
  '✅ confirmada': 'bg-turquoise-100 text-turquoise-700 border-turquoise-200',
  '❌ cancelada': 'bg-red-100 text-red-700 border-red-200',
  // Fallback without emoji
  'solicitada': 'bg-gray-100 text-gray-700 border-gray-200',
  'confirmada': 'bg-turquoise-100 text-turquoise-700 border-turquoise-200',
  'cancelada': 'bg-red-100 text-red-700 border-red-200',
}

export default function CRMList() {
  const [search, setSearch] = useState('')
  const [activeStatus, setActiveStatus] = useState<string | null>(null)
  const [crmRequests, setCrmRequests] = useState<CRMRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadCRM = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await getCRM()
        setCrmRequests(data.data || [])
      } catch (err) {
        setError('Error al cargar las solicitudes CRM')
        console.error('Error loading CRM:', err)
      } finally {
        setLoading(false)
      }
    }

    loadCRM()
  }, [])

  // Filtrar solicitudes CRM
  const filteredCRM = crmRequests.filter((request) => {
    if (search && !request.Cliente?.toLowerCase().includes(search.toLowerCase())) return false
    if (activeStatus && request.Estado?.toLowerCase() !== activeStatus) return false
    return true
  })

  // Formatear datos para mostrar
  const formattedRequests = filteredCRM.map((request, index) => ({
    id: request.ID || `R${index + 1}`,
    client: request.Cliente || 'Sin cliente',
    property: request.Propiedad || 'Sin propiedad',
    checkIn: request['Check-in'] || 'Sin fecha',
    checkOut: request['Check-out'] || 'Sin fecha',
    guests: request.Huéspedes || '0',
    state: request.Estado?.toLowerCase() || 'solicitada',
    responsible: request.Responsable || 'Sin responsable',
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
        <h1 className="text-2xl font-bold text-azul-900">Solicitudes CRM</h1>
        <button className="bg-turquoise-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-turquoise-700 transition-colors">
          + Nueva Solicitud
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
          {['📥 Solicitada', '✅ Confirmada', '❌ Cancelada'].map((status) => (
            <button
              key={status}
              onClick={() => setActiveStatus(activeStatus === status.toLowerCase() ? null : status.toLowerCase())}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                activeStatus === status.toLowerCase()
                  ? statusColors[status.toLowerCase()] || statusColors['solicitada']
                  : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Propiedad</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Check-in</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Check-out</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Huéspedes</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {formattedRequests.length > 0 ? (
              formattedRequests.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-azul-900">{r.id}</td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-azul-900">{r.client}</div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{r.property}</td>
                  <td className="px-6 py-4 text-gray-600 flex items-center gap-1">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    {r.checkIn}
                  </td>
                  <td className="px-6 py-4 text-gray-600 flex items-center gap-1">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    {r.checkOut}
                  </td>
                  <td className="px-6 py-4 text-gray-600 flex items-center gap-1">
                    <Users className="w-4 h-4 text-gray-400" />
                    {r.guests}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        statusColors[r.state] || statusColors['solicitada']
                      }`}
                    >
                      {r.state}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-azul-600 hover:text-azul-800 font-medium text-sm">
                      Ver
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                  No hay solicitudes que coincidan con tu búsqueda
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {formattedRequests.length > 0 ? (
          formattedRequests.map((r) => (
            <div key={r.id} className="bg-white rounded-xl shadow-sm p-4">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-azul-50 text-azul-700 rounded text-xs font-mono">
                    {r.id}
                  </span>
                  <h3 className="font-medium text-azul-900">{r.client}</h3>
                </div>
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                    statusColors[r.state] || statusColors['solicitada']
                  }`}
                >
                  {r.state}
                </span>
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between text-gray-600">
                  <span className="flex items-center gap-1">
                    <CheckCircle className="w-4 h-4 text-gray-400" />
                    {r.property}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-1 text-gray-500">
                    <Calendar className="w-4 h-4" />
                    <span className="text-xs">Check-in</span>
                  </div>
                  <div className="flex items-center gap-1 text-gray-500">
                    <Calendar className="w-4 h-4" />
                    <span className="text-xs">Check-out</span>
                  </div>
                  <div className="flex items-center gap-1 text-gray-500">
                    <Users className="w-4 h-4" />
                    <span className="text-xs">Huéspedes</span>
                  </div>
                  <div className="flex items-center gap-1 text-gray-500">
                    <BedDouble className="w-4 h-4" />
                    <span className="text-xs">Habitaciones</span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                  <span className="text-gray-600 text-xs">{r.checkIn}</span>
                  <span className="text-gray-600 text-xs">{r.checkOut}</span>
                  <span className="text-gray-600 text-xs">{r.guests}</span>
                </div>
              </div>
              
              <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end">
                <button className="text-azul-600 hover:text-azul-800 font-medium text-sm px-3 py-1">
                  Ver detalle
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <p className="text-gray-500">No hay solicitudes que coincidan con tu búsqueda</p>
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
