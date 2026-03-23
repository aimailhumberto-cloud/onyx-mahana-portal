import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Loader2, AlertCircle, Bot, User, ChevronLeft, ChevronRight, DollarSign, TrendingUp, Calendar, MapPin, Download, CheckCircle, XCircle, Building2, ChevronDown, ChevronUp, Image, FileText, Trash2 } from 'lucide-react'
import { getTours, getCharts, aprobarTour, rechazarTour, updateTourStatus, getTourById, deleteTour } from '../api/api'
import type { Tour, Meta } from '../api/api'
import { downloadCSV } from '../utils/exportUtils'

const statusConfig: Record<string, { bg: string; text: string; dot: string }> = {
  'Pagado':      { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
  'Reservado':   { bg: 'bg-turquoise-50', text: 'text-turquoise-700', dot: 'bg-turquoise-500' },
  'Aprobado':    { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  'Consulta':    { bg: 'bg-arena-50', text: 'text-arena-700', dot: 'bg-arena-500' },
  'Por Aprobar': { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  'Rechazado':   { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  'Cancelado':   { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  'Cerrado':     { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-500' },
}

interface PeriodStats { cantidad: number; ingresos: number; ganancia: number }

const PERIODS = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mes' },
  { key: 'anio', label: 'Año' },
  { key: 'todo', label: 'Todo' },
] as const

const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`

export default function ToursList() {
  const [search, setSearch] = useState('')
  const [activeStatus, setActiveStatus] = useState<string | null>(null)
  const [activePeriod, setActivePeriod] = useState<string>('semana')
  const [tours, setTours] = useState<Tour[]>([])
  const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: 20, pages: 0 })
  const [periodStats, setPeriodStats] = useState<Record<string, PeriodStats>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rejectModal, setRejectModal] = useState<{ id: number; cliente: string } | null>(null)
  const [rejectMotivo, setRejectMotivo] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [expandedTourId, setExpandedTourId] = useState<number | null>(null)
  const [expandedDetail, setExpandedDetail] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [deleteModal, setDeleteModal] = useState<{ id: number; cliente: string } | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    getCharts().then(r => {
      if (r.success && r.data?.periodos) setPeriodStats(r.data.periodos)
    })
  }, [])

  const getDateRange = (period: string): { desde?: string; hasta?: string } => {
    const now = new Date()
    const today = now.toISOString().split('T')[0]
    switch (period) {
      case 'hoy': return { desde: today, hasta: today }
      case 'semana': { const s = new Date(now); s.setDate(s.getDate() - s.getDay()); return { desde: s.toISOString().split('T')[0] } }
      case 'mes': return { desde: today.substring(0, 7) + '-01' }
      case 'anio': return { desde: today.substring(0, 4) + '-01-01' }
      default: return {}
    }
  }

  const loadTours = async (page = 1) => {
    setLoading(true); setError(null)
    try {
      const params: Record<string, string | number> = { page, limit: 20 }
      if (activeStatus) params.estatus = activeStatus
      if (search) params.cliente = search
      const range = getDateRange(activePeriod)
      if (range.desde) params.fecha_desde = range.desde
      if (range.hasta) params.fecha_hasta = range.hasta
      const result = await getTours(params)
      if (result.success) { setTours(result.data || []); if (result.meta) setMeta(result.meta) }
      else setError(result.error?.message || 'Error')
    } catch { setError('Error de conexión') }
    finally { setLoading(false) }
  }

  useEffect(() => { loadTours() }, [activeStatus, activePeriod])
  const handleSearch = () => loadTours(1)
  const currentStats = periodStats[activePeriod]

  const handleAprobar = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (actionLoading) return
    setActionLoading(true)
    try {
      // Fetch full details to check for missing fields
      const detail = await getTourById(id)
      if (detail.success && detail.data) {
        const t = detail.data
        const missing: string[] = []
        if (!t.precio_ingreso) missing.push('Precio Venta')
        if (!t.costo_pago && t.costo_pago !== 0) missing.push('Costo')
        if (!t.responsable) missing.push('Responsable')
        
        if (missing.length > 0) {
          const goToEdit = confirm(`⚠️ Faltan campos obligatorios: ${missing.join(', ')}.\n\n¿Deseas ir al formulario de edición para completarlos?`)
          if (goToEdit) {
            navigate(`/tours/${id}/editar`)
          }
          setActionLoading(false)
          return
        }
      }
      const res = await aprobarTour(id)
      if (res.success) loadTours(meta.page)
    } catch { }
    setActionLoading(false)
  }

  const handleReservar = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (actionLoading) return
    setActionLoading(true)
    try {
      const res = await updateTourStatus(id, 'Reservado')
      if (res.success) loadTours(meta.page)
    } catch { }
    setActionLoading(false)
  }

  const handleExpandToggle = async (tour: Tour) => {
    if (expandedTourId === tour.id) {
      setExpandedTourId(null)
      setExpandedDetail(null)
      return
    }
    setExpandedTourId(tour.id)
    setDetailLoading(true)
    try {
      const res = await getTourById(tour.id)
      if (res.success) setExpandedDetail(res.data)
      else setExpandedDetail(tour)
    } catch {
      setExpandedDetail(tour)
    }
    setDetailLoading(false)
  }

  const handleRechazar = async () => {
    if (!rejectModal || actionLoading) return
    setActionLoading(true)
    try {
      const res = await rechazarTour(rejectModal.id, rejectMotivo)
      if (res.success) { setRejectModal(null); setRejectMotivo(''); loadTours(meta.page) }
    } catch { }
    setActionLoading(false)
  }

  const handleDelete = async () => {
    if (!deleteModal || actionLoading) return
    setActionLoading(true)
    try {
      const res = await deleteTour(deleteModal.id)
      if (res.success) {
        setDeleteModal(null)
        setExpandedTourId(null)
        setExpandedDetail(null)
        loadTours(meta.page)
      }
    } catch { }
    setActionLoading(false)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <img src="/mahana-logo.jpg" alt="Mahana Tours" className="w-11 h-11 rounded-xl object-cover shadow-sm ring-1 ring-gray-200" />
          <div>
            <h1 className="text-2xl font-bold text-azul-900">Tours</h1>
            <p className="text-sm text-gray-500">{meta.total} reservas</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => {
            const range = getDateRange(activePeriod)
            const params = new URLSearchParams()
            if (range.desde) params.set('fecha_desde', range.desde)
            if (range.hasta) params.set('fecha_hasta', range.hasta)
            if (activeStatus) params.set('estatus', activeStatus)
            downloadCSV(`/api/v1/tours/export?${params}`, `tours_${new Date().toISOString().split('T')[0]}.csv`)
          }} className="flex items-center gap-1.5 bg-white text-azul-900 border border-gray-200 px-4 py-2.5 rounded-xl font-medium hover:bg-gray-50 hover:shadow-sm transition-all text-sm">
            <Download className="w-4 h-4" /> Exportar
          </button>
          <button onClick={() => navigate('/tours/nuevo')} className="bg-gradient-to-r from-turquoise-600 to-turquoise-500 text-white px-5 py-2.5 rounded-xl font-medium hover:shadow-lg hover:scale-[1.02] transition-all">
            + Nueva Reserva
          </button>
        </div>
      </div>

      {/* Period + KPIs + Filters */}
      <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100 space-y-4">
        {/* Period Pills */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => setActivePeriod(p.key)}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                activePeriod === p.key ? 'bg-white text-azul-900 shadow-sm ring-1 ring-gray-200' : 'text-gray-500 hover:text-gray-700'
              }`}>{p.label}</button>
          ))}
        </div>

        {/* Mini KPIs */}
        {currentStats && (
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-gradient-to-br from-turquoise-50 to-turquoise-100/50 rounded-xl px-3 py-2.5 text-center border border-turquoise-200/50">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <Calendar className="w-3.5 h-3.5 text-turquoise-600" />
                <span className="text-[10px] text-turquoise-600 font-semibold uppercase">Reservas</span>
              </div>
              <p className="text-xl font-bold text-turquoise-700">{currentStats.cantidad}</p>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-green-100/50 rounded-xl px-3 py-2.5 text-center border border-green-200/50">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <DollarSign className="w-3.5 h-3.5 text-green-600" />
                <span className="text-[10px] text-green-600 font-semibold uppercase">Ingresos</span>
              </div>
              <p className="text-xl font-bold text-green-700">{fmt(currentStats.ingresos)}</p>
            </div>
            <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl px-3 py-2.5 text-center border border-blue-200/50">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-[10px] text-blue-600 font-semibold uppercase">Ganancia</span>
              </div>
              <p className="text-xl font-bold text-blue-700">{fmt(currentStats.ganancia)}</p>
            </div>
          </div>
        )}

        {/* Search + Status */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Buscar por cliente..." value={search}
              onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-turquoise-500 text-sm" />
          </div>
          <button onClick={handleSearch} className="px-4 py-2 bg-azul-900 text-white rounded-lg hover:bg-azul-800 transition-colors text-sm font-medium">Buscar</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(statusConfig).filter(([k]) => k !== 'Cerrado').map(([status, conf]) => (
            <button key={status} onClick={() => setActiveStatus(activeStatus === status ? null : status)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                activeStatus === status ? `${conf.bg} ${conf.text} border-current` : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}>
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${conf.dot} mr-1.5`} />
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-8 h-8 animate-spin text-turquoise-600" /></div>
      ) : error ? (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <AlertCircle className="w-8 h-8 text-red-600 mx-auto mb-2" />
          <p className="text-gray-500 mb-4">{error}</p>
          <button onClick={() => loadTours()} className="px-4 py-2 bg-turquoise-600 text-white rounded-lg">Reintentar</button>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden lg:block bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
            <table className="w-full">
              <thead className="bg-gray-50/80 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Cliente</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Actividad</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Fecha</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Responsable</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Origen</th>
                  <th className="px-4 py-3 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Ingreso</th>
                  <th className="px-4 py-3 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Ganancia</th>
                  <th className="px-4 py-3 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {tours.length > 0 ? tours.map((t, i) => {
                  const conf = statusConfig[t.estatus] || statusConfig['Cerrado']
                  return (
                    <React.Fragment key={t.id}>
                    <tr className={`hover:bg-turquoise-50/30 cursor-pointer transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/30'} ${expandedTourId === t.id ? 'bg-blue-50/40' : ''}`}
                      onClick={() => {
                        handleExpandToggle(t)
                      }}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-azul-900 text-sm">{t.cliente}</p>
                        {t.whatsapp && <p className="text-[11px] text-gray-400">{t.whatsapp}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-sm text-gray-700">
                          <MapPin className="w-3 h-3 text-turquoise-500" />{t.actividad}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        <span>{t.fecha}</span>
                        {t.hora && <span className="text-xs text-gray-400 ml-1.5 bg-gray-100 px-1.5 py-0.5 rounded">{t.hora}</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{t.responsable}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${conf.bg} ${conf.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${conf.dot}`} />
                          {t.estatus}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {t.fuente === 'partner-portal' || (t.vendedor && t.vendedor !== 'Mahana Tours') ? (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200 font-medium">
                            <Building2 className="w-3 h-3" /> {t.vendedor || 'Partner'}
                          </span>
                        ) : t.fuente === 'openclaw' ? (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 font-medium">
                            <Bot className="w-3 h-3" /> AI
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-turquoise-50 text-turquoise-700 border border-turquoise-200 font-medium">
                            🏠 Mahana
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-azul-900">{fmt(t.precio_ingreso || 0)}</td>
                      <td className={`px-4 py-3 text-right text-sm font-semibold ${(t.ganancia_mahana || 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {fmt(t.ganancia_mahana || 0)}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="flex items-center gap-1 justify-center">
                          {expandedTourId === t.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                        </div>
                      </td>
                    </tr>
                    {/* Expanded detail row */}
                    {expandedTourId === t.id && (
                      <tr>
                        <td colSpan={9} className="px-0 py-0">
                          <div className="bg-gradient-to-r from-blue-50/60 to-orange-50/40 border-t border-b border-blue-100 px-6 py-5">
                            {detailLoading ? (
                              <div className="flex items-center justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div>
                            ) : expandedDetail ? (
                              <div className="flex gap-6">
                                {/* Left: Client details */}
                                <div className="flex-1 space-y-3">
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                                    <div><span className="text-gray-400 text-xs block">Cliente</span><span className="font-medium text-gray-900">{expandedDetail.cliente}</span></div>
                                    <div><span className="text-gray-400 text-xs block">WhatsApp</span><span className="font-medium text-gray-900">{expandedDetail.whatsapp || '—'}</span></div>
                                    <div><span className="text-gray-400 text-xs block">Email</span><span className="font-medium text-gray-900">{expandedDetail.email_cliente || '—'}</span></div>
                                    <div><span className="text-gray-400 text-xs block">Hotel</span><span className="font-medium text-gray-900">{expandedDetail.hotel || '—'}</span></div>
                                    <div><span className="text-gray-400 text-xs block">Nacionalidad</span><span className="font-medium text-gray-900">{expandedDetail.nacionalidad || '—'}</span></div>
                                    <div><span className="text-gray-400 text-xs block">Idioma</span><span className="font-medium text-gray-900">{expandedDetail.idioma || '—'}</span></div>
                                    <div><span className="text-gray-400 text-xs block">Personas</span><span className="font-medium text-gray-900">{expandedDetail.pax || '—'}</span></div>
                                    <div><span className="text-gray-400 text-xs block">Edades</span><span className="font-medium text-gray-900">{expandedDetail.edades || '—'}</span></div>
                                    <div><span className="text-gray-400 text-xs block">Solicitado por</span><span className="font-semibold text-blue-700">{expandedDetail.solicitado_por || '—'}</span></div>
                                  </div>
                                  {expandedDetail.notas && (
                                    <div className="bg-white/70 rounded-lg p-3 text-sm border border-gray-200">
                                      <span className="text-gray-400 text-xs block mb-1">Notas</span>
                                      <p className="text-gray-700">{expandedDetail.notas}</p>
                                    </div>
                                  )}
                                  {/* Actions */}
                                  <div className="flex items-center gap-2 pt-2">
                                    {t.estatus === 'Por Aprobar' && (
                                      <>
                                        <button onClick={(e) => handleAprobar(t.id, e)} disabled={actionLoading}
                                          className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 shadow-sm">
                                          <CheckCircle className="w-4 h-4" /> Aprobar
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); setRejectModal({ id: t.id, cliente: t.cliente }) }} disabled={actionLoading}
                                          className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 shadow-sm">
                                          <XCircle className="w-4 h-4" /> Rechazar
                                        </button>
                                      </>
                                    )}
                                    {t.estatus === 'Aprobado' && (
                                      <button onClick={(e) => handleReservar(t.id, e)} disabled={actionLoading}
                                        className="flex items-center gap-1.5 px-4 py-2 bg-turquoise-600 text-white rounded-lg text-sm font-medium hover:bg-turquoise-700 disabled:opacity-50 shadow-sm">
                                        <CheckCircle className="w-4 h-4" /> Marcar como Reservado
                                      </button>
                                    )}
                                    <button onClick={() => navigate(`/tours/${t.id}/editar`)}
                                      className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-white">
                                      Editar completo
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); setDeleteModal({ id: t.id, cliente: t.cliente }) }}
                                      className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors ml-auto">
                                      <Trash2 className="w-4 h-4" /> Eliminar
                                    </button>
                                  </div>
                                </div>
                                {/* Right: Comprobante */}
                                <div className="w-56 shrink-0">
                                  <span className="text-gray-400 text-xs block mb-2 font-medium uppercase tracking-wide">Comprobante de pago</span>
                                  {expandedDetail.comprobante_url ? (
                                    <a href={expandedDetail.comprobante_url} target="_blank" rel="noopener noreferrer" className="block">
                                      {/\.(jpg|jpeg|png|gif|webp)$/i.test(expandedDetail.comprobante_url) ? (
                                        <img src={expandedDetail.comprobante_url} alt="Comprobante" className="w-full rounded-xl border-2 border-gray-200 shadow-md hover:shadow-lg transition-shadow object-contain bg-white max-h-48" />
                                      ) : (
                                        <div className="flex items-center gap-2 px-4 py-3 bg-white rounded-xl border-2 border-gray-200 hover:border-blue-300 transition-colors">
                                          <FileText className="w-6 h-6 text-blue-500" />
                                          <span className="text-sm text-blue-600 font-medium">Ver archivo PDF</span>
                                        </div>
                                      )}
                                    </a>
                                  ) : (
                                    <div className="flex flex-col items-center justify-center py-6 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 text-gray-400">
                                      <Image className="w-8 h-8 mb-1 opacity-40" />
                                      <span className="text-xs">Sin comprobante</span>
                                    </div>
                                  )}
                                </div>
                                {/* CxC / Facturación cross-link */}
                                {expandedDetail.vendedor && expandedDetail.cxc_total > 0 && (
                                  <div className="w-56 shrink-0">
                                    <span className="text-gray-400 text-xs block mb-2 font-medium uppercase tracking-wide">Facturación CxC</span>
                                    <div className="bg-white rounded-xl border-2 border-gray-200 p-3 space-y-1.5 text-xs">
                                      <div className="flex justify-between"><span className="text-gray-500">Subtotal:</span><span>{`$${(expandedDetail.cxc_subtotal || 0).toFixed(2)}`}</span></div>
                                      <div className="flex justify-between"><span className="text-gray-500">ITBM:</span><span>{`$${(expandedDetail.cxc_itbm || 0).toFixed(2)}`}</span></div>
                                      <div className="flex justify-between font-bold border-t pt-1"><span>Total CxC:</span><span className="text-turquoise-600">{`$${(expandedDetail.cxc_total || 0).toFixed(2)}`}</span></div>
                                      <div className="pt-1 border-t">
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                          expandedDetail.cxc_estatus === 'Pagada' ? 'bg-green-100 text-green-700'
                                          : expandedDetail.cxc_estatus === 'Enviada' ? 'bg-blue-100 text-blue-700'
                                          : expandedDetail.cxc_estatus === 'Pendiente' ? 'bg-yellow-100 text-yellow-700'
                                          : 'bg-gray-100 text-gray-500'
                                        }`}>{expandedDetail.cxc_estatus || 'Sin Factura'}</span>
                                      </div>
                                      {expandedDetail.cxc_factura_url && (
                                        <a href={expandedDetail.cxc_factura_url} target="_blank" rel="noopener noreferrer"
                                          className="flex items-center gap-1 text-turquoise-600 hover:underline text-xs mt-1">
                                          <FileText className="w-3 h-3" /> Ver Factura
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  )
                }) : (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400 text-sm">No hay tours en este período</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden space-y-2.5">
            {tours.length > 0 ? tours.map((t) => {
              const conf = statusConfig[t.estatus] || statusConfig['Cerrado']
              return (
                <div key={t.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 cursor-pointer hover:shadow-md hover:border-turquoise-200 transition-all"
                  onClick={() => navigate(`/tours/${t.id}/editar`)}>
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {t.hora && <span className="bg-azul-900 text-white text-[10px] px-2 py-0.5 rounded-md font-mono shrink-0">{t.hora}</span>}
                      <span className="text-sm font-medium text-turquoise-600 truncate flex items-center gap-1">
                        <MapPin className="w-3 h-3 shrink-0" />{t.actividad}
                      </span>
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ml-2 ${conf.bg} ${conf.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${conf.dot}`} />{t.estatus}
                    </span>
                  </div>
                  <p className="font-semibold text-azul-900 text-sm mb-1">{t.cliente}</p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 text-xs">{t.fecha} • {t.responsable || 'Sin asignar'}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-green-600">{fmt(t.precio_ingreso || 0)}</span>
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">→ {fmt(t.ganancia_mahana || 0)}</span>
                  {t.fuente === 'openclaw' && <Bot className="w-3 h-3 text-purple-400" />}
                      {(t.fuente === 'partner-portal' || (t.vendedor && t.vendedor !== 'Mahana Tours')) && <span className="text-[9px] text-orange-500 font-medium">{t.vendedor || 'Partner'}</span>}
                    </div>
                  </div>
                  {t.estatus === 'Por Aprobar' && (
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                      <button onClick={(e) => handleAprobar(t.id, e)} disabled={actionLoading}
                        className="flex-1 py-1.5 rounded-lg bg-green-100 text-green-700 text-xs font-medium hover:bg-green-200 transition-colors flex items-center justify-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" /> Aprobar
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setRejectModal({ id: t.id, cliente: t.cliente }) }} disabled={actionLoading}
                        className="flex-1 py-1.5 rounded-lg bg-red-100 text-red-700 text-xs font-medium hover:bg-red-200 transition-colors flex items-center justify-center gap-1">
                        <XCircle className="w-3.5 h-3.5" /> Rechazar
                      </button>
                    </div>
                  )}
                </div>
              )
            }) : (
              <div className="bg-white rounded-xl shadow-sm p-10 text-center text-gray-400 text-sm">No hay tours en este período</div>
            )}
          </div>

          {/* Pagination */}
          {meta.pages > 1 && (
            <div className="flex justify-center items-center gap-2">
              <button disabled={meta.page <= 1} onClick={() => loadTours(meta.page - 1)}
                className="p-2 bg-white rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-500 px-3 font-medium">{meta.page} / {meta.pages}</span>
              <button disabled={meta.page >= meta.pages} onClick={() => loadTours(meta.page + 1)}
                className="p-2 bg-white rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setRejectModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Rechazar Tour</h3>
            <p className="text-sm text-gray-500 mb-4">Tour de <strong>{rejectModal.cliente}</strong></p>
            <textarea
              value={rejectMotivo}
              onChange={(e) => setRejectMotivo(e.target.value)}
              placeholder="Motivo del rechazo (ej: comprobante incorrecto, tour no disponible...)"
              className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
              rows={3}
            />
            <div className="flex items-center gap-3 mt-4">
              <button onClick={() => { setRejectModal(null); setRejectMotivo('') }}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-medium text-sm hover:bg-gray-200 transition-colors">
                Cancelar
              </button>
              <button onClick={handleRechazar} disabled={actionLoading}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-medium text-sm hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1">
                <XCircle className="w-4 h-4" /> Rechazar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDeleteModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-full"><Trash2 className="w-5 h-5 text-red-600" /></div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Eliminar Tour</h3>
                <p className="text-sm text-gray-500">Esta acción se puede revertir desde el log</p>
              </div>
            </div>
            <p className="text-sm text-gray-700 mb-4">¿Estás seguro de eliminar el tour de <strong>{deleteModal.cliente}</strong>? El tour no se eliminará permanentemente — quedará registrado en el historial.</p>
            <div className="flex items-center gap-3">
              <button onClick={() => setDeleteModal(null)}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-medium text-sm hover:bg-gray-200 transition-colors">
                Cancelar
              </button>
              <button onClick={handleDelete} disabled={actionLoading}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-medium text-sm hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1">
                <Trash2 className="w-4 h-4" /> Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
