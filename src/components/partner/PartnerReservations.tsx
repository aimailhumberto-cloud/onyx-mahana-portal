import { useState, useEffect, useRef } from 'react'
import { getTours, getTourById, updatePartnerTour, uploadFile } from '../../api/api'
import type { Tour } from '../../api/api'
import { Loader2, Search, Calendar, Filter, ChevronDown, ChevronUp, Edit3, Save, X, AlertTriangle, Upload, Trash2 } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  'Por Aprobar': 'bg-orange-100 text-orange-800 border-orange-200',
  'Aprobado': 'bg-blue-100 text-blue-800 border-blue-200',
  'Reservado': 'bg-green-100 text-green-800 border-green-200',
  'Pagado': 'bg-green-100 text-green-800 border-green-200',
  'Rechazado': 'bg-red-100 text-red-800 border-red-200',
  'Consulta': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'Cancelado': 'bg-red-100 text-red-800 border-red-200',
  'Cerrado': 'bg-gray-100 text-gray-800 border-gray-200',
}

const STATUS_EMOJI: Record<string, string> = {
  'Por Aprobar': '🟠',
  'Aprobado': '🔵',
  'Reservado': '🟢',
  'Pagado': '🟢',
  'Rechazado': '🔴',
  'Consulta': '🟡',
  'Cancelado': '🔴',
  'Cerrado': '⚫',
}

// Parse comprobante_url which may be comma-separated multiple URLs
function parseComprobantes(url: string | null | undefined): string[] {
  if (!url) return []
  return url.split(',').map(u => u.trim()).filter(Boolean)
}

export default function PartnerReservations() {
  const [tours, setTours] = useState<Tour[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [total, setTotal] = useState(0)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [detailData, setDetailData] = useState<Record<number, any>>({})

  // Comprobante upload
  const [newComprobante, setNewComprobante] = useState<File | null>(null)
  const [newComprobantePreview, setNewComprobantePreview] = useState<string | null>(null)
  const [existingComprobantes, setExistingComprobantes] = useState<string[]>([])
  const editFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadTours()
  }, [statusFilter])

  const loadTours = async () => {
    setLoading(true)
    const params: Record<string, string | number> = { limit: 100 }
    if (statusFilter) params.estatus = statusFilter
    const res = await getTours(params)
    if (res.success) {
      setTours(res.data)
      setTotal(res.meta?.total || res.data.length)
    }
    setLoading(false)
  }

  const handleExpandToggle = async (tourId: number) => {
    if (expandedId === tourId) {
      setExpandedId(null)
      setEditingId(null)
      return
    }
    setExpandedId(tourId)
    setEditingId(null)
    setSaveResult(null)
    if (!detailData[tourId]) {
      try {
        const res = await getTourById(tourId)
        if (res.success) setDetailData(prev => ({ ...prev, [tourId]: res.data }))
      } catch { }
    }
  }

  const startEditing = (tour: any) => {
    setEditingId(tour.id)
    setSaveResult(null)
    setNewComprobante(null)
    setNewComprobantePreview(null)
    setExistingComprobantes(parseComprobantes(tour.comprobante_url))
    setEditForm({
      cliente: tour.cliente || '',
      whatsapp: tour.whatsapp || '',
      email_cliente: tour.email_cliente || '',
      hotel: tour.hotel || '',
      nacionalidad: tour.nacionalidad || '',
      idioma: tour.idioma || '',
      edades: tour.edades || '',
      pax: tour.pax || 1,
      notas: tour.notas || '',
      solicitado_por: tour.solicitado_por || '',
    })
  }

  const handleEditFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setNewComprobante(file)
      const reader = new FileReader()
      reader.onload = (ev) => setNewComprobantePreview(ev.target?.result as string)
      reader.readAsDataURL(file)
    }
  }

  const removeExistingComprobante = (index: number) => {
    setExistingComprobantes(prev => prev.filter((_, i) => i !== index))
  }

  const handleSave = async (tourId: number) => {
    setSaving(true)
    setSaveResult(null)
    try {
      const data = { ...editForm }
      let allComprobantes = [...existingComprobantes]

      if (newComprobante) {
        const uploadRes = await uploadFile(newComprobante)
        if (uploadRes.success) allComprobantes.push(uploadRes.data.url)
      }

      data.comprobante_url = allComprobantes.join(',')

      const res = await updatePartnerTour(tourId, data)
      if (res.success) {
        setSaveResult({ type: 'success', message: '✅ Tour actualizado. Estado reiniciado a "Por Aprobar".' })
        setEditingId(null)
        setDetailData(prev => ({ ...prev, [tourId]: res.data }))
        loadTours()
      } else {
        setSaveResult({ type: 'error', message: res.error?.message || 'Error al guardar' })
      }
    } catch {
      setSaveResult({ type: 'error', message: 'Error de conexión' })
    }
    setSaving(false)
  }

  const filtered = tours.filter(t =>
    !search || t.cliente?.toLowerCase().includes(search.toLowerCase()) ||
    t.actividad?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-blue-900">Mis Reservas</h1>
          <p className="text-sm text-gray-500">{total} reservas en total</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Buscar por cliente o actividad..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm" />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="pl-10 pr-8 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm appearance-none">
            <option value="">Todos los estados</option>
            <option value="Por Aprobar">🟠 Por Aprobar</option>
            <option value="Aprobado">🔵 Aprobado</option>
            <option value="Reservado">🟢 Reservado</option>
            <option value="Rechazado">🔴 Rechazado</option>
          </select>
        </div>
      </div>

      {saveResult && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${saveResult.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          <span>{saveResult.message}</span>
          <button onClick={() => setSaveResult(null)} className="ml-auto text-sm opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center shadow-sm border border-gray-100">
          <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500">No se encontraron reservas</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(tour => {
            const detail = detailData[tour.id] || tour
            const isExpanded = expandedId === tour.id
            const isEditing = editingId === tour.id
            const comprobantes = parseComprobantes(detail.comprobante_url)

            return (
              <div key={tour.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => handleExpandToggle(tour.id)}>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{tour.cliente}</p>
                      <p className="text-xs text-gray-500 truncate">{tour.actividad} · {tour.fecha} {tour.hora ? `· ${tour.hora}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${STATUS_COLORS[tour.estatus] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                      {STATUS_EMOJI[tour.estatus] || '⚪'} {tour.estatus}
                    </span>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 py-4 space-y-4">
                    {detail.estatus === 'Rechazado' && detail.motivo_rechazo && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                        <strong>Motivo de rechazo:</strong> {detail.motivo_rechazo}
                      </div>
                    )}

                    {!isEditing ? (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                          <div><span className="text-gray-400 text-xs block">Cliente</span><span className="font-medium text-gray-900">{detail.cliente}</span></div>
                          <div><span className="text-gray-400 text-xs block">WhatsApp</span><span className="font-medium text-gray-900">{detail.whatsapp || '—'}</span></div>
                          <div><span className="text-gray-400 text-xs block">Email</span><span className="font-medium text-gray-900">{detail.email_cliente || '—'}</span></div>
                          <div><span className="text-gray-400 text-xs block">Hotel</span><span className="font-medium text-gray-900">{detail.hotel || '—'}</span></div>
                          <div><span className="text-gray-400 text-xs block">Nacionalidad</span><span className="font-medium text-gray-900">{detail.nacionalidad || '—'}</span></div>
                          <div><span className="text-gray-400 text-xs block">Idioma</span><span className="font-medium text-gray-900">{detail.idioma || '—'}</span></div>
                          <div><span className="text-gray-400 text-xs block">Personas</span><span className="font-medium text-gray-900">{detail.pax || '—'}</span></div>
                          <div><span className="text-gray-400 text-xs block">Edades</span><span className="font-medium text-gray-900">{detail.edades || '—'}</span></div>
                          <div><span className="text-gray-400 text-xs block">Solicitado por</span><span className="font-medium text-gray-900">{detail.solicitado_por || '—'}</span></div>
                        </div>
                        {(detail.precio_ingreso || detail.costo_pago) && (
                          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mt-2">
                            <p className="text-xs font-semibold text-blue-800 mb-2">💰 Detalle de Precio</p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                              <div><span className="text-blue-500 text-xs block">Precio Tour</span><span className="font-bold text-blue-900">${(detail.precio_ingreso || 0).toLocaleString()}</span></div>
                              <div><span className="text-blue-500 text-xs block">ITBM (7%)</span><span className="font-bold text-blue-900">${Math.round((detail.precio_ingreso || 0) * 0.07).toLocaleString()}</span></div>
                              <div><span className="text-blue-500 text-xs block">Total</span><span className="font-bold text-green-700">${Math.round((detail.precio_ingreso || 0) * 1.07).toLocaleString()}</span></div>
                              {detail.comision_pct != null && (
                                <div><span className="text-blue-500 text-xs block">Comisión ({detail.comision_pct}%)</span><span className="font-bold text-purple-700">${Math.round((detail.precio_ingreso || 0) * detail.comision_pct / 100).toLocaleString()}</span></div>
                              )}
                            </div>
                          </div>
                        )}
                        {detail.notas && (
                          <div className="bg-gray-50 rounded-lg p-3 text-sm">
                            <span className="text-gray-400 text-xs block mb-1">Notas</span>
                            <p className="text-gray-700">{detail.notas}</p>
                          </div>
                        )}
                        {comprobantes.length > 0 && (
                          <div>
                            <span className="text-gray-400 text-xs block mb-1">Comprobantes ({comprobantes.length})</span>
                            <div className="flex flex-wrap gap-2">
                              {comprobantes.map((url, i) => (
                                <img key={i} src={url} alt={`Comprobante ${i + 1}`} className="max-h-40 rounded-lg border border-gray-200 object-contain bg-gray-50" />
                              ))}
                            </div>
                          </div>
                        )}
                        {/* CxC / Factura Mahana cross-link */}
                        {detail.cxc_total > 0 && (
                          <div className="bg-gradient-to-r from-turquoise-50 to-blue-50 border border-turquoise-200 rounded-lg p-3 mt-2">
                            <p className="text-xs font-semibold text-turquoise-800 mb-2">📄 Factura Mahana (CxC)</p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                              <div><span className="text-turquoise-500 text-xs block">Subtotal</span><span className="font-bold text-turquoise-900">${(detail.cxc_subtotal || 0).toFixed(2)}</span></div>
                              <div><span className="text-turquoise-500 text-xs block">ITBM (7%)</span><span className="font-bold text-turquoise-900">${(detail.cxc_itbm || 0).toFixed(2)}</span></div>
                              <div><span className="text-turquoise-500 text-xs block">Total CxC</span><span className="font-bold text-turquoise-900">${(detail.cxc_total || 0).toFixed(2)}</span></div>
                              <div>
                                <span className="text-turquoise-500 text-xs block">Estatus</span>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                  detail.cxc_estatus === 'Pagada' ? 'bg-green-100 text-green-700'
                                  : detail.cxc_estatus === 'Enviada' ? 'bg-blue-100 text-blue-700'
                                  : detail.cxc_estatus === 'Pendiente' ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-gray-100 text-gray-500'
                                }`}>{detail.cxc_estatus || 'Sin Factura'}</span>
                              </div>
                            </div>
                            {detail.cxc_factura_url && (
                              <a href={detail.cxc_factura_url} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-turquoise-600 hover:underline text-xs mt-2 font-medium">
                                📥 Descargar Factura Mahana
                              </a>
                            )}
                            {detail.cxc_fecha_emision && (
                              <p className="text-[10px] text-gray-500 mt-1">Emitida: {detail.cxc_fecha_emision} {detail.cxc_fecha_vencimiento ? `· Vence: ${detail.cxc_fecha_vencimiento}` : ''}</p>
                            )}
                          </div>
                        )}
                        <div className="flex justify-end">
                          <button onClick={(e) => { e.stopPropagation(); startEditing(detail) }}
                            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm">
                            <Edit3 className="w-3.5 h-3.5" /> Editar información
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2 text-sm text-amber-800">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          <span>Al guardar cambios, el tour <strong>volverá a estado "Por Aprobar"</strong> para revisión de Mahana.</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {[
                            { key: 'cliente', label: 'Nombre del cliente', placeholder: 'Nombre completo' },
                            { key: 'whatsapp', label: 'WhatsApp', placeholder: '+507...' },
                            { key: 'email_cliente', label: 'Email', placeholder: 'email@ejemplo.com' },
                            { key: 'hotel', label: 'Hotel / Alojamiento', placeholder: 'Nombre del hotel' },
                            { key: 'nacionalidad', label: 'Nacionalidad', placeholder: 'Ej: Panamá' },
                            { key: 'solicitado_por', label: 'Solicitado por', placeholder: 'Persona en Caracol' },
                          ].map(f => (
                            <div key={f.key}>
                              <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                              <input value={editForm[f.key] || ''}
                                onChange={e => setEditForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                                placeholder={f.placeholder}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                          ))}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Idioma</label>
                            <select value={editForm.idioma || ''}
                              onChange={e => setEditForm(prev => ({ ...prev, idioma: e.target.value }))}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                              <option value="">Seleccionar</option>
                              <option value="Español">Español</option>
                              <option value="English">English</option>
                              <option value="Français">Français</option>
                              <option value="Otro">Otro</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1"># Personas</label>
                            <input type="number" min="1" max="20" value={editForm.pax || 1}
                              onChange={e => setEditForm(prev => ({ ...prev, pax: parseInt(e.target.value) || 1 }))}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Edades</label>
                            <input value={editForm.edades || ''}
                              onChange={e => setEditForm(prev => ({ ...prev, edades: e.target.value }))}
                              placeholder="Ej: 25, 30, 8"
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
                          <textarea rows={3} value={editForm.notas || ''}
                            onChange={e => setEditForm(prev => ({ ...prev, notas: e.target.value }))}
                            placeholder="Lugar de salida, detalles, restricciones..."
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                        </div>

                        {/* Comprobantes — existing + add new */}
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Comprobantes de pago</label>
                          {existingComprobantes.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-2">
                              {existingComprobantes.map((url, i) => (
                                <div key={i} className="relative">
                                  <img src={url} alt={`Comprobante ${i + 1}`} className="max-h-32 rounded-lg border border-gray-200 object-contain bg-gray-50" />
                                  <button onClick={() => removeExistingComprobante(i)}
                                    className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600" title="Eliminar">
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          {newComprobantePreview && (
                            <div className="relative mb-2 inline-block">
                              <img src={newComprobantePreview} alt="Nuevo comprobante" className="max-h-32 rounded-lg border border-blue-200 object-contain bg-blue-50" />
                              <button onClick={() => { setNewComprobante(null); setNewComprobantePreview(null); if (editFileRef.current) editFileRef.current.value = '' }}
                                className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                          <button onClick={() => editFileRef.current?.click()}
                            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50">
                            <Upload className="w-3.5 h-3.5" /> Agregar comprobante
                          </button>
                          <input ref={editFileRef} type="file" accept="image/*,.pdf" onChange={handleEditFileChange} className="hidden" />
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                          <button onClick={() => { setEditingId(null); setNewComprobante(null); setNewComprobantePreview(null) }}
                            className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                            <X className="w-3.5 h-3.5" /> Cancelar
                          </button>
                          <button onClick={() => handleSave(tour.id)} disabled={saving}
                            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 shadow-sm">
                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            Guardar cambios
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
