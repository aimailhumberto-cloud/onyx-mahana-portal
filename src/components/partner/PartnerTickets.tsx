import { useState, useEffect } from 'react'
import { getPartnerTickets, createPartnerTicket, getPartnerSatisfaccion, getActividades, Ticket } from '../../api/api'
import { AlertTriangle, CheckCircle, Clock, Plus, X, Star, FileText, User, Activity } from 'lucide-react'

const TIPOS = [
  { value: 'queja', label: 'Queja', icon: '😤' },
  { value: 'sugerencia', label: 'Sugerencia', icon: '💡' },
  { value: 'incidente', label: 'Incidente', icon: '⚠️' },
]

const CATEGORIAS = [
  { value: 'seguridad', label: 'Seguridad', icon: '🛡️' },
  { value: 'puntualidad', label: 'Puntualidad', icon: '⏰' },
  { value: 'atencion', label: 'Atención', icon: '🤝' },
  { value: 'equipo', label: 'Equipo', icon: '🛶' },
  { value: 'comunicacion', label: 'Comunicación', icon: '💬' },
  { value: 'limpieza', label: 'Limpieza', icon: '🧹' },
  { value: 'precio', label: 'Precio', icon: '💰' },
  { value: 'otro', label: 'Otro', icon: '📝' },
]

const ESTATUS_COLORS: Record<string, string> = {
  'Abierto': 'bg-red-100 text-red-800',
  'En Proceso': 'bg-yellow-100 text-yellow-800',
  'Resuelto': 'bg-green-100 text-green-800',
  'Cerrado': 'bg-gray-100 text-gray-700',
}

export default function PartnerTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [satisfaction, setSatisfaction] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [showDetail, setShowDetail] = useState<Ticket | null>(null)
  const [filterEstatus, setFilterEstatus] = useState('')
  const [tab, setTab] = useState<'tickets' | 'satisfaccion'>('tickets')
  const [actividades, setActividades] = useState<string[]>([])

  const [form, setForm] = useState({
    cliente: '', descripcion: '', actividad: '', tipo: 'queja', categoria: '',
    whatsapp: '', email: ''
  })

  useEffect(() => {
    loadData()
    // Load activities for the ticket form
    getActividades().then(res => {
      if (res.success && res.data) {
        const activas = res.data.filter(a => a.activa)
        // If filter returns empty, show all (activa field might not be set)
        setActividades(activas.length > 0 ? activas.map(a => a.nombre) : res.data.map(a => a.nombre))
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    loadData()
  }, [filterEstatus])

  async function loadData() {
    setLoading(true)
    const params: Record<string, string | number> = {}
    if (filterEstatus) params.estatus = filterEstatus

    const [ticketsRes, satRes] = await Promise.all([
      getPartnerTickets(params),
      getPartnerSatisfaccion()
    ])

    if (ticketsRes.success) setTickets(ticketsRes.data)
    if (satRes.success) setSatisfaction(satRes.data)
    setLoading(false)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const res = await createPartnerTicket(form as any)
    if (res.success) {
      setShowCreate(false)
      setForm({ cliente: '', descripcion: '', actividad: '', tipo: 'queja', categoria: '', whatsapp: '', email: '' })
      loadData()
    }
  }

  const abiertos = tickets.filter(t => t.estatus === 'Abierto').length
  const enProceso = tickets.filter(t => t.estatus === 'En Proceso').length
  const resueltos = tickets.filter(t => t.estatus === 'Resuelto' || t.estatus === 'Cerrado').length

  // Category distribution for mini chart
  const catDistrib = tickets.reduce<Record<string, number>>((acc, t) => {
    const cat = t.categoria || 'otro'
    acc[cat] = (acc[cat] || 0) + 1
    return acc
  }, {})
  const catData = Object.entries(catDistrib).sort((a, b) => b[1] - a[1])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">🎫 Calidad de Servicio</h1>
          <p className="text-sm text-gray-500">Tickets y satisfacción de tus tours</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2.5 rounded-xl font-medium flex items-center gap-2 shadow-lg shadow-blue-600/20 hover:shadow-blue-600/40 transition-all hover:scale-105"
        >
          <Plus className="w-4 h-4" /> Reportar Incidencia
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        <button onClick={() => setTab('tickets')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 'tickets' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500'
          }`}>
          <FileText className="w-4 h-4" /> Tickets {abiertos > 0 && <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{abiertos}</span>}
        </button>
        <button onClick={() => setTab('satisfaccion')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === 'satisfaccion' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500'
          }`}>
          <Star className="w-4 h-4" /> Satisfacción
        </button>
      </div>

      {/* Tickets Tab */}
      {tab === 'tickets' && (
        <>
          {/* KPIs + mini category chart */}
          <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm text-center">
              <AlertTriangle className="w-5 h-5 text-red-500 mx-auto mb-1" />
              <span className="text-2xl font-bold text-gray-800">{abiertos}</span>
              <p className="text-xs text-gray-500">Abiertos</p>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm text-center">
              <Clock className="w-5 h-5 text-yellow-500 mx-auto mb-1" />
              <span className="text-2xl font-bold text-gray-800">{enProceso}</span>
              <p className="text-xs text-gray-500">En Proceso</p>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm text-center">
              <CheckCircle className="w-5 h-5 text-green-500 mx-auto mb-1" />
              <span className="text-2xl font-bold text-gray-800">{resueltos}</span>
              <p className="text-xs text-gray-500">Resueltos</p>
            </div>
            {catData.length > 0 && (
              <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm hidden md:block">
                <p className="text-xs font-medium text-gray-500 mb-2">Por Categoría</p>
                <div className="space-y-1">
                  {catData.slice(0, 3).map(([cat, count]) => {
                    const catInfo = CATEGORIAS.find(c => c.value === cat)
                    const max = catData[0][1]
                    return (
                      <div key={cat} className="flex items-center gap-1.5">
                        <span className="text-xs w-4">{catInfo?.icon || '📝'}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                          <div className="h-full bg-blue-400 rounded-full" style={{ width: `${(count / max) * 100}%` }} />
                        </div>
                        <span className="text-xs font-bold text-gray-600 w-4 text-right">{count}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Filter */}
          <div className="flex gap-2">
            {['', 'Abierto', 'En Proceso', 'Resuelto', 'Cerrado'].map(e => (
              <button key={e} onClick={() => setFilterEstatus(e)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filterEstatus === e ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {e || 'Todos'}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="space-y-3">
            {loading ? (
              <div className="text-center py-12 text-gray-400">Cargando...</div>
            ) : tickets.length === 0 ? (
              <div className="bg-white rounded-xl p-12 text-center border border-gray-100">
                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-gray-600">Sin tickets</h3>
                <p className="text-sm text-gray-400">No tienes tickets registrados</p>
              </div>
            ) : (
              tickets.map(t => (
                <div key={t.id} onClick={() => setShowDetail(t)}
                  className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:shadow-md hover:border-blue-200 transition-all cursor-pointer">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-mono text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{t.codigo}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTATUS_COLORS[t.estatus] || ''}`}>{t.estatus}</span>
                    {t.categoria && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      {CATEGORIAS.find(c => c.value === t.categoria)?.icon} {t.categoria}
                    </span>}
                  </div>
                  <p className="text-sm text-gray-800 font-medium truncate">{t.descripcion}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                    <span className="flex items-center gap-1"><User className="w-3 h-3" /> {t.cliente}</span>
                    {t.actividad && <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> {t.actividad}</span>}
                    <span>{new Date(t.created_at).toLocaleDateString('es-PA')}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Satisfaction Tab */}
      {tab === 'satisfaccion' && satisfaction && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm text-center">
            <p className="text-sm text-gray-500 mb-2">Score General de tus Tours</p>
            <div className="flex justify-center items-center gap-2">
              {satisfaction.general?.avg ? (
                <>
                  <span className="text-4xl font-bold text-gray-800">{satisfaction.general.avg}</span>
                  <span className="text-gray-400">/5</span>
                  <Star className="w-8 h-8 fill-amber-400 text-amber-400" />
                </>
              ) : (
                <span className="text-gray-400">Sin datos aún</span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">{satisfaction.general?.total || 0} reseñas totales</p>

            {satisfaction.general?.total > 0 && satisfaction.scores?.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="flex justify-center gap-6">
                  {satisfaction.scores.map((s: any, i: number) => {
                    const score = s.avg_general || 0
                    const barH = (score / 5) * 100
                    const color = score >= 4 ? 'bg-green-500' : score >= 3 ? 'bg-yellow-500' : 'bg-red-500'
                    return (
                      <div key={i} className="flex flex-col items-center gap-1">
                        <span className="text-xs font-bold text-gray-700">{score}</span>
                        <div className="w-8 h-20 bg-gray-100 rounded-md relative overflow-hidden">
                          <div className={`absolute bottom-0 left-0 right-0 ${color} rounded-md transition-all`}
                            style={{ height: `${barH}%` }} />
                        </div>
                        <span className="text-[10px] text-gray-400 text-center max-w-[60px] truncate">{s.nombre}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {satisfaction.scores?.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-700">Score por Tour</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {satisfaction.scores.map((s: any, i: number) => (
                  <div key={i} className="p-4 flex items-center gap-4">
                    <div className="flex-1">
                      <p className="font-medium text-gray-800 text-sm">{s.nombre}</p>
                      <div className="flex gap-3 text-xs text-gray-400 mt-0.5">
                        <span>{s.total} reseñas</span>
                        {s.avg_guia && <span>Guía: {s.avg_guia}</span>}
                        {s.avg_puntualidad && <span>Puntualidad: {s.avg_puntualidad}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map(star => (
                        <Star key={star} className={`w-4 h-4 ${
                          star <= Math.round(s.avg_general || 0) ? 'fill-amber-400 text-amber-400' : 'text-gray-200'
                        }`} />
                      ))}
                      <span className="ml-1 text-sm font-bold text-gray-700">{s.avg_general}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {satisfaction.recientes?.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-700">Reseñas Recientes</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {satisfaction.recientes.map((r: any) => (
                  <div key={r.id} className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      {[1, 2, 3, 4, 5].map(star => (
                        <Star key={star} className={`w-3.5 h-3.5 ${
                          star <= r.score_general ? 'fill-amber-400 text-amber-400' : 'text-gray-200'
                        }`} />
                      ))}
                      <span className="text-xs text-gray-400 ml-2">{r.cliente} • {new Date(r.created_at).toLocaleDateString('es-PA')}</span>
                      {r.fuente === 'solicitada' && <span className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded">Solicitada</span>}
                    </div>
                    {r.comentario && <p className="text-sm text-gray-600 italic mt-1">"{r.comentario}"</p>}
                    {(r.score_guia || r.score_puntualidad || r.score_equipamiento) && (
                      <div className="flex gap-3 mt-2 text-xs text-gray-400">
                        {r.score_guia && <span>🧑‍🏫 Guía: <b className="text-gray-600">{r.score_guia}/5</b></span>}
                        {r.score_puntualidad && <span>⏰ Puntualidad: <b className="text-gray-600">{r.score_puntualidad}/5</b></span>}
                        {r.score_equipamiento && <span>🛶 Equipo: <b className="text-gray-600">{r.score_equipamiento}/5</b></span>}
                        {r.score_valor && <span>💰 Valor: <b className="text-gray-600">{r.score_valor}/5</b></span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Modal — with actividad/tour type selector */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-10 px-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mb-10">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">🎫 Reportar Incidencia</h2>
              <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cliente *</label>
                  <input type="text" required value={form.cliente} onChange={e => setForm(f => ({ ...f, cliente: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Nombre del cliente" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp</label>
                  <input type="text" value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="+507..." />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Tour / Actividad *</label>
                <select required value={form.actividad} onChange={e => setForm(f => ({ ...f, actividad: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  <option value="">Seleccionar tour...</option>
                  {actividades.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <p className="text-xs text-gray-400 mt-1">Selecciona el tipo de tour relacionado a la incidencia</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                  <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    {TIPOS.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categoría *</label>
                  <select required value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="">Seleccionar...</option>
                    {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción *</label>
                <textarea required rows={4} value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" placeholder="Describe la incidencia con detalle..." />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
                <button type="submit" className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">Enviar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-10 px-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mb-10">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-blue-600">{showDetail.codigo}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTATUS_COLORS[showDetail.estatus] || ''}`}>{showDetail.estatus}</span>
              </div>
              <button onClick={() => setShowDetail(null)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-500">Cliente:</span> <strong>{showDetail.cliente}</strong></div>
                <div><span className="text-gray-500">Tipo:</span> {showDetail.tipo}</div>
                {showDetail.actividad && <div><span className="text-gray-500">Tour:</span> <strong className="text-blue-700">{showDetail.actividad}</strong></div>}
                {showDetail.categoria && <div><span className="text-gray-500">Categoría:</span> {CATEGORIAS.find(c => c.value === showDetail.categoria)?.icon} {showDetail.categoria}</div>}
                <div><span className="text-gray-500">Creado:</span> {new Date(showDetail.created_at).toLocaleDateString('es-PA')}</div>
                {showDetail.asignado_a && <div><span className="text-gray-500">Asignado:</span> {showDetail.asignado_a}</div>}
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{showDetail.descripcion}</p>
              </div>
              {showDetail.respuesta && (
                <div className="bg-green-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-green-800 mb-1">✅ Respuesta</h4>
                  <p className="text-sm text-green-700">{showDetail.respuesta}</p>
                </div>
              )}
              {showDetail.accion_correctiva && (
                <div className="bg-blue-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-blue-800 mb-1">🔧 Acción Correctiva</h4>
                  <p className="text-sm text-blue-700">{showDetail.accion_correctiva}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
