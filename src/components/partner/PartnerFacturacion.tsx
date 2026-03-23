import { useState, useEffect } from 'react'
import { getPartnerCxC, CxCTour } from '../../api/api'
import { FileText, Clock, CheckCircle, Send, Download, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'

const fmt = (n: number) => `$${(n || 0).toFixed(2)}`

const statusConfig: Record<string, { label: string; color: string; icon: any; bg: string }> = {
  'Pendiente': { label: 'Pendiente', color: 'text-yellow-600', icon: Clock, bg: 'bg-yellow-50' },
  'Enviada': { label: 'Enviada al Cobro', color: 'text-blue-600', icon: Send, bg: 'bg-blue-50' },
  'Pagada': { label: 'Pagada', color: 'text-green-600', icon: CheckCircle, bg: 'bg-green-50' },
}

export default function PartnerFacturacion() {
  const [tours, setTours] = useState<CxCTour[]>([])
  const [summary, setSummary] = useState({ por_pagar: 0, pagado: 0, count_pendiente: 0, count_pagado: 0 })
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    const result = await getPartnerCxC()
    if (result.success) {
      setTours(result.data.tours)
      setSummary(result.data.summary)
    }
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-turquoise-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mis Facturas</h1>
        <p className="text-sm text-gray-500">Estado de cuenta y facturas por tour</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-yellow-600" />
            <span className="text-xs font-medium uppercase text-yellow-700">Por Pagar</span>
          </div>
          <p className="text-2xl font-bold text-yellow-700">{fmt(summary.por_pagar)}</p>
          <p className="text-xs text-yellow-600">{summary.count_pendiente || 0} factura{(summary.count_pendiente || 0) !== 1 ? 's' : ''}</p>
        </div>
        <div className="rounded-xl border border-green-200 bg-green-50 p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <span className="text-xs font-medium uppercase text-green-700">Pagado</span>
          </div>
          <p className="text-2xl font-bold text-green-700">{fmt(summary.pagado)}</p>
          <p className="text-xs text-green-600">{summary.count_pagado || 0} factura{(summary.count_pagado || 0) !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Invoice list */}
      {tours.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center text-gray-400">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No hay facturas registradas aún</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tours.map(tour => {
            const cfg = statusConfig[tour.cxc_estatus] || statusConfig['Pendiente']
            const Icon = cfg.icon
            const isExpanded = expandedId === tour.id
            return (
              <div key={tour.id} className="bg-white rounded-xl border overflow-hidden">
                <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50" onClick={() => setExpandedId(isExpanded ? null : tour.id)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900">{tour.actividad}</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
                        <Icon className="w-3 h-3" /> {cfg.label}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">{tour.fecha} · {tour.cliente}</p>
                  </div>
                  <div className="text-right mr-3">
                    <p className="text-lg font-bold text-gray-900">{fmt(tour.cxc_total)}</p>
                    <p className="text-xs text-gray-400">Total CxC</p>
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>

                {isExpanded && (
                  <div className="border-t px-4 py-4 bg-gray-50">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Financial breakdown */}
                      <div className="bg-white rounded-lg p-3 border space-y-1 text-sm">
                        <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Desglose</h4>
                        <div className="flex justify-between"><span className="text-gray-500">Precio tour:</span><span>{fmt(tour.precio_ingreso)}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Tu comisión ({tour.comision_pct || 0}%):</span><span className="text-green-600">+{fmt(tour.monto_comision)}</span></div>
                        <hr className="my-1" />
                        <div className="flex justify-between"><span className="text-gray-500">Subtotal:</span><span>{fmt(tour.cxc_subtotal)}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">ITBM (7%):</span><span>{fmt(tour.cxc_itbm)}</span></div>
                        <hr className="my-1" />
                        <div className="flex justify-between font-bold"><span>Total a pagar:</span><span>{fmt(tour.cxc_total)}</span></div>
                      </div>
                      {/* Dates & PDF */}
                      <div className="bg-white rounded-lg p-3 border space-y-2 text-sm">
                        <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Información</h4>
                        {tour.cxc_fecha_emision && <div className="flex justify-between"><span className="text-gray-500">Fecha emisión:</span><span>{tour.cxc_fecha_emision}</span></div>}
                        {tour.cxc_fecha_vencimiento && <div className="flex justify-between"><span className="text-gray-500">Vencimiento:</span><span>{tour.cxc_fecha_vencimiento}</span></div>}
                        {tour.cxc_fecha_pago && <div className="flex justify-between"><span className="text-gray-500">Pagado:</span><span className="text-green-600">{tour.cxc_fecha_pago}</span></div>}
                        {tour.cxc_factura_url && (
                          <a href={tour.cxc_factura_url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-turquoise-600 hover:underline mt-2">
                            <Download className="w-4 h-4" /> Descargar Factura
                          </a>
                        )}
                      </div>
                    </div>
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
