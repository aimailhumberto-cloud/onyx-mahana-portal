import { useState, useEffect, useCallback } from 'react'
import { getCxC, updateCxC, uploadFile, CxCTour, CxCData } from '../api/api'
import { FileText, Clock, CheckCircle, Send, AlertTriangle, Filter, Upload, Download, ChevronDown, ChevronUp, Loader2, RefreshCw, Undo2, Image, ExternalLink } from 'lucide-react'

const fmt = (n: number) => `$${(n || 0).toFixed(2)}`

const statusConfig: Record<string, { label: string; color: string; icon: any; bg: string }> = {
  'Sin Factura': { label: 'Sin Factura', color: 'text-gray-500', icon: FileText, bg: 'bg-gray-100' },
  'Pendiente': { label: 'Pendiente', color: 'text-yellow-600', icon: Clock, bg: 'bg-yellow-50' },
  'Enviada': { label: 'Enviada al Cobro', color: 'text-blue-600', icon: Send, bg: 'bg-blue-50' },
  'Pagada': { label: 'Pagada', color: 'text-green-600', icon: CheckCircle, bg: 'bg-green-50' },
}

const nextStatus: Record<string, string> = {
  'Sin Factura': 'Pendiente',
  'Pendiente': 'Enviada',
  'Enviada': 'Pagada',
}

const prevStatus: Record<string, string> = {
  'Pendiente': 'Sin Factura',
  'Enviada': 'Pendiente',
  'Pagada': 'Enviada',
}

export default function Facturacion() {
  const [data, setData] = useState<CxCData | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ vendedor: '', cxc_estatus: '', fecha_desde: '', fecha_hasta: '' })
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [uploading, setUploading] = useState<number | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    const params: Record<string, string> = {}
    if (filter.vendedor) params.vendedor = filter.vendedor
    if (filter.cxc_estatus) params.cxc_estatus = filter.cxc_estatus
    if (filter.fecha_desde) params.fecha_desde = filter.fecha_desde
    if (filter.fecha_hasta) params.fecha_hasta = filter.fecha_hasta
    const result = await getCxC(params)
    if (result.success) setData(result.data)
    setLoading(false)
  }, [filter])

  useEffect(() => { loadData() }, [loadData])

  const handleStatusChange = async (tour: CxCTour, newStatus: string) => {
    const result = await updateCxC(tour.id, { cxc_estatus: newStatus })
    if (result.success) loadData()
  }

  const handleRevertStatus = async (tour: CxCTour) => {
    const prev = prevStatus[tour.cxc_estatus]
    if (!prev) return
    if (!confirm(`¿Revertir estatus de "${statusConfig[tour.cxc_estatus]?.label}" a "${statusConfig[prev]?.label}"?`)) return
    const updates: any = { cxc_estatus: prev }
    // Clear dates when reverting
    if (prev === 'Sin Factura') {
      updates.cxc_fecha_emision = null
      updates.cxc_fecha_vencimiento = null
    }
    if (tour.cxc_estatus === 'Pagada') {
      updates.cxc_fecha_pago = null
    }
    const result = await updateCxC(tour.id, updates)
    if (result.success) loadData()
  }

  const handleUploadFactura = async (tourId: number, file: File) => {
    setUploading(tourId)
    try {
      const uploadResult = await uploadFile(file)
      if (uploadResult.success) {
        await updateCxC(tourId, { cxc_factura_url: uploadResult.data.url })
        loadData()
      }
    } catch {
      alert('Error al subir factura')
    }
    setUploading(null)
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-turquoise-500" />
      </div>
    )
  }

  if (!data) return null
  const { tours, summary, aging, porVendedor } = data

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Facturación / CxC</h1>
          <p className="text-sm text-gray-500">Cuentas por cobrar a partners — por tour</p>
        </div>
        <button onClick={loadData} className="flex items-center gap-2 px-3 py-2 text-sm bg-white border rounded-lg hover:bg-gray-50">
          <RefreshCw className="w-4 h-4" /> Actualizar
        </button>
      </div>

      {/* Mini Dashboard KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Sin Factura" value={fmt(summary.sin_factura)} count={summary.count_sin_factura || 0} color="gray" icon={FileText} />
        <KpiCard label="Pendiente" value={fmt(summary.pendiente)} count={summary.count_pendiente || 0} color="yellow" icon={Clock} />
        <KpiCard label="Enviada al Cobro" value={fmt(summary.enviada)} count={summary.count_enviada || 0} color="blue" icon={Send} />
        <KpiCard label="Pagado" value={fmt(summary.pagado)} count={summary.count_pagado || 0} color="green" icon={CheckCircle} />
      </div>

      {/* Aging Report */}
      {(aging.corriente || aging.dias_15_30 || aging.dias_30_60 || aging.dias_60_plus) ? (
        <div className="bg-white rounded-xl border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-500" /> Antigüedad de Cartera Pendiente
          </h3>
          <div className="grid grid-cols-4 gap-3 text-center">
            <AgingBlock label="Corriente (≤15d)" value={aging.corriente} color="green" />
            <AgingBlock label="15-30 días" value={aging.dias_15_30} color="yellow" />
            <AgingBlock label="30-60 días" value={aging.dias_30_60} color="orange" />
            <AgingBlock label=">60 días" value={aging.dias_60_plus} color="red" />
          </div>
        </div>
      ) : null}

      {/* Per-vendor summary */}
      {porVendedor.length > 0 && (
        <div className="bg-white rounded-xl border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Resumen por Partner</h3>
          <div className="space-y-2">
            {porVendedor.map(v => (
              <div key={v.vendedor} className="flex items-center justify-between text-sm p-2 bg-gray-50 rounded-lg">
                <span className="font-medium">{v.vendedor}</span>
                <div className="flex gap-4">
                  <span className="text-yellow-600">{fmt(v.pendiente)} pendiente</span>
                  <span className="text-green-600">{fmt(v.pagado)} pagado</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Filter className="w-4 h-4 text-gray-400" />
          <select value={filter.cxc_estatus} onChange={e => setFilter({ ...filter, cxc_estatus: e.target.value })}
            className="px-3 py-1.5 text-sm border rounded-lg bg-white">
            <option value="">Todos los estatus</option>
            <option value="Sin Factura">Sin Factura</option>
            <option value="Pendiente">Pendiente</option>
            <option value="Enviada">Enviada al Cobro</option>
            <option value="Pagada">Pagada</option>
          </select>
          <select value={filter.vendedor} onChange={e => setFilter({ ...filter, vendedor: e.target.value })}
            className="px-3 py-1.5 text-sm border rounded-lg bg-white">
            <option value="">Todos los partners</option>
            {porVendedor.map(v => <option key={v.vendedor} value={v.vendedor}>{v.vendedor}</option>)}
          </select>
          <input type="date" value={filter.fecha_desde} onChange={e => setFilter({ ...filter, fecha_desde: e.target.value })}
            className="px-3 py-1.5 text-sm border rounded-lg" placeholder="Desde" />
          <input type="date" value={filter.fecha_hasta} onChange={e => setFilter({ ...filter, fecha_hasta: e.target.value })}
            className="px-3 py-1.5 text-sm border rounded-lg" placeholder="Hasta" />
          {(filter.vendedor || filter.cxc_estatus || filter.fecha_desde || filter.fecha_hasta) && (
            <button onClick={() => setFilter({ vendedor: '', cxc_estatus: '', fecha_desde: '', fecha_hasta: '' })}
              className="text-xs text-turquoise-600 hover:underline">Limpiar</button>
          )}
        </div>
      </div>

      {/* Tours Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Cliente</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Actividad</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Partner</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Precio</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">CxC Total</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Estatus CxC</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {tours.map(tour => {
                const cfg = statusConfig[tour.cxc_estatus] || statusConfig['Sin Factura']
                const Icon = cfg.icon
                const isExpanded = expandedId === tour.id
                return (
                  <>
                    <tr key={tour.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : tour.id)}>
                      <td className="px-4 py-3">{tour.fecha}</td>
                      <td className="px-4 py-3 font-medium">{tour.cliente}</td>
                      <td className="px-4 py-3">{tour.actividad}</td>
                      <td className="px-4 py-3">{tour.vendedor}</td>
                      <td className="px-4 py-3 text-right">{fmt(tour.precio_ingreso)}</td>
                      <td className="px-4 py-3 text-right font-semibold">{tour.cxc_total ? fmt(tour.cxc_total) : '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
                          <Icon className="w-3 h-3" /> {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 inline" /> : <ChevronDown className="w-4 h-4 text-gray-400 inline" />}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${tour.id}-detail`} className="bg-gray-50">
                        <td colSpan={8} className="px-4 py-4">
                          <ExpandedDetail tour={tour} onStatusChange={handleStatusChange} onRevert={handleRevertStatus} onUpload={handleUploadFactura} uploading={uploading === tour.id} />
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
              {tours.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No hay facturas con estos filtros</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function KpiCard({ label, value, count, color, icon: Icon }: { label: string; value: string; count: number; color: string; icon: any }) {
  const colorMap: Record<string, string> = {
    gray: 'bg-gray-50 border-gray-200 text-gray-600',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
  }
  return (
    <div className={`rounded-xl border p-4 ${colorMap[color]}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4" />
        <span className="text-xs font-medium uppercase">{label}</span>
      </div>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-xs opacity-70">{count} tour{count !== 1 ? 's' : ''}</p>
    </div>
  )
}

function AgingBlock({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    green: 'text-green-700 bg-green-50',
    yellow: 'text-yellow-700 bg-yellow-50',
    orange: 'text-orange-700 bg-orange-50',
    red: 'text-red-700 bg-red-50',
  }
  return (
    <div className={`rounded-lg p-3 ${colorMap[color]}`}>
      <p className="text-xs font-medium mb-1">{label}</p>
      <p className="text-lg font-bold">{fmt(value || 0)}</p>
    </div>
  )
}

function ExpandedDetail({ tour, onStatusChange, onRevert, onUpload, uploading }: {
  tour: CxCTour & { comprobante_url?: string }; onStatusChange: (t: CxCTour, s: string) => void; onRevert: (t: CxCTour) => void; onUpload: (id: number, f: File) => void; uploading: boolean
}) {
  const next = nextStatus[tour.cxc_estatus]
  const prev = prevStatus[tour.cxc_estatus]
  const nextCfg = next ? statusConfig[next] : null
  const prevCfg = prev ? statusConfig[prev] : null
  const NextIcon = nextCfg?.icon

  // Parse comprobante URLs (may be comma-separated)
  const comprobantes = tour.comprobante_url ? tour.comprobante_url.split(',').filter(Boolean) : []
  const isImage = (url: string) => /\.(jpg|jpeg|png|gif|webp)$/i.test(url)

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Financial breakdown */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-gray-500 uppercase">Desglose Financiero</h4>
        <div className="bg-white rounded-lg p-3 space-y-1 text-sm border">
          <div className="flex justify-between"><span className="text-gray-500">Precio tour:</span><span>{fmt(tour.precio_ingreso)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Comisión ({tour.comision_pct || 0}%):</span><span className="text-red-500">-{fmt(tour.monto_comision)}</span></div>
          <hr className="my-1" />
          <div className="flex justify-between"><span className="text-gray-500">Subtotal Mahana:</span><span>{fmt(tour.cxc_subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">ITBM (7%):</span><span>{fmt(tour.cxc_itbm)}</span></div>
          <hr className="my-1" />
          <div className="flex justify-between font-bold"><span>Total CxC:</span><span className="text-turquoise-600">{fmt(tour.cxc_total)}</span></div>
        </div>
      </div>

      {/* Tracking & Actions */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-gray-500 uppercase">Tracking</h4>
        <div className="bg-white rounded-lg p-3 space-y-2 text-sm border">
          {tour.cxc_fecha_emision && (
            <div className="flex justify-between"><span className="text-gray-500">Fecha emisión:</span><span>{tour.cxc_fecha_emision}</span></div>
          )}
          {tour.cxc_fecha_vencimiento && (
            <div className="flex justify-between"><span className="text-gray-500">Vencimiento:</span><span>{tour.cxc_fecha_vencimiento}</span></div>
          )}
          {tour.cxc_fecha_pago && (
            <div className="flex justify-between"><span className="text-gray-500">Fecha pago:</span><span className="text-green-600">{tour.cxc_fecha_pago}</span></div>
          )}

          {/* Factura Mahana — always show upload + existing */}
          <div className="pt-2 space-y-2 border-t">
            <span className="text-xs font-semibold text-gray-500 uppercase">Factura Mahana</span>
            {tour.cxc_factura_url && (
              <a href={tour.cxc_factura_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-turquoise-600 hover:underline text-xs">
                <Download className="w-3 h-3" /> Ver Factura Actual
              </a>
            )}
            <label className="inline-flex items-center gap-1 text-xs text-blue-600 cursor-pointer hover:underline">
              <Upload className="w-3 h-3" />
              {uploading ? 'Subiendo...' : tour.cxc_factura_url ? 'Reemplazar Factura' : 'Subir Factura PDF'}
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                onChange={e => e.target.files?.[0] && onUpload(tour.id, e.target.files[0])} />
            </label>
          </div>

          {/* Status actions — advance AND revert */}
          <div className="pt-2 border-t space-y-2">
            {next && nextCfg && NextIcon && (
              <button onClick={() => onStatusChange(tour, next)}
                className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  next === 'Pagada' ? 'bg-green-100 text-green-700 hover:bg-green-200'
                  : next === 'Enviada' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                }`}>
                <NextIcon className="w-4 h-4" /> Marcar como {nextCfg.label}
              </button>
            )}
            {prev && prevCfg && (
              <button onClick={() => onRevert(tour)}
                className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">
                <Undo2 className="w-3 h-3" /> Revertir a {prevCfg.label}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Comprobante del partner */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-gray-500 uppercase">Comprobante del Partner</h4>
        <div className="bg-white rounded-lg p-3 border">
          {comprobantes.length > 0 ? (
            <div className="space-y-2">
              {comprobantes.map((url, i) => (
                <div key={i}>
                  {isImage(url) ? (
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      <img src={url} alt={`Comprobante ${i + 1}`} className="w-full max-h-40 object-contain rounded-lg border bg-gray-50 hover:shadow-md transition-shadow" />
                    </a>
                  ) : (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-600 hover:underline p-2 bg-blue-50 rounded-lg">
                      <ExternalLink className="w-4 h-4" /> Comprobante {i + 1}
                    </a>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-4 text-gray-400">
              <Image className="w-8 h-8 opacity-30" />
              <p className="text-xs">Sin comprobante del partner</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
