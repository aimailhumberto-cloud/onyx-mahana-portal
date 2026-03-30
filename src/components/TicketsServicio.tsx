import { useState, useEffect } from 'react'
import { getTickets, getTicketStats, createTicket, updateTicketStatus, assignTicket, updateTicket, getActividades, getStaff, Ticket, TicketStats } from '../api/api'
import { AlertTriangle, CheckCircle, Clock, Plus, X, Search, User, Tag, Activity, RefreshCw, FileText } from 'lucide-react'

const TIPOS = [
  { value: 'queja', label: 'Queja', icon: '😤' },
  { value: 'sugerencia', label: 'Sugerencia', icon: '💡' },
  { value: 'felicitacion', label: 'Felicitación', icon: '🎉' },
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

const PRIORIDADES = [
  { value: 'critica', label: 'Crítica', color: 'bg-red-500', textColor: 'text-red-700', bgLight: 'bg-red-50' },
  { value: 'alta', label: 'Alta', color: 'bg-orange-500', textColor: 'text-orange-700', bgLight: 'bg-orange-50' },
  { value: 'media', label: 'Media', color: 'bg-yellow-500', textColor: 'text-yellow-700', bgLight: 'bg-yellow-50' },
  { value: 'baja', label: 'Baja', color: 'bg-gray-400', textColor: 'text-gray-600', bgLight: 'bg-gray-50' },
]

const ESTATUS = [
  { value: 'Abierto', color: 'bg-red-100 text-red-800', dot: 'bg-red-500' },
  { value: 'En Proceso', color: 'bg-yellow-100 text-yellow-800', dot: 'bg-yellow-500' },
  { value: 'Resuelto', color: 'bg-green-100 text-green-800', dot: 'bg-green-500' },
  { value: 'Cerrado', color: 'bg-gray-100 text-gray-700', dot: 'bg-gray-400' },
]

function PrioTag({ prioridad }: { prioridad: string }) {
  const p = PRIORIDADES.find(pr => pr.value === prioridad) || PRIORIDADES[2]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${p.bgLight} ${p.textColor}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${p.color}`}></span>
      {p.label}
    </span>
  )
}

function StatusBadge({ estatus }: { estatus: string }) {
  const s = ESTATUS.find(st => st.value === estatus) || ESTATUS[0]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.color}`}>
      <span className={`w-2 h-2 rounded-full ${s.dot} animate-pulse`}></span>
      {estatus}
    </span>
  )
}

export default function TicketsServicio() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [stats, setStats] = useState<TicketStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [showDetail, setShowDetail] = useState<Ticket | null>(null)
  const [filters, setFilters] = useState({ estatus: '', categoria: '', prioridad: '', search: '' })
  const [actividades, setActividades] = useState<string[]>([])
  const [staffList, setStaffList] = useState<string[]>([])

  // Create form
  const [form, setForm] = useState({
    cliente: '', descripcion: '', actividad: '', vendedor: '', responsable: '',
    tipo: 'queja', categoria: '', prioridad: 'media', canal_origen: 'portal',
    whatsapp: '', email: ''
  })

  // Detail form (resolve)
  const [resolveForm, setResolveForm] = useState({ respuesta: '', accion_correctiva: '', satisfaccion_resolucion: 0 })

  useEffect(() => {
    loadData()
    loadCatalogs()
  }, [])

  async function loadData() {
    setLoading(true)
    const params: Record<string, string | number> = {}
    if (filters.estatus) params.estatus = filters.estatus
    if (filters.categoria) params.categoria = filters.categoria
    if (filters.prioridad) params.prioridad = filters.prioridad

    const [ticketsRes, statsRes] = await Promise.all([
      getTickets(params),
      getTicketStats()
    ])

    if (ticketsRes.success) {
      let data = ticketsRes.data
      if (filters.search) {
        const s = filters.search.toLowerCase()
        data = data.filter(t =>
          t.cliente?.toLowerCase().includes(s) ||
          t.codigo?.toLowerCase().includes(s) ||
          t.actividad?.toLowerCase().includes(s) ||
          t.descripcion?.toLowerCase().includes(s)
        )
      }
      setTickets(data)
    }
    if (statsRes.success) setStats(statsRes.data)
    setLoading(false)
  }

  async function loadCatalogs() {
    const [actRes, staffRes] = await Promise.all([getActividades(), getStaff()])
    if (actRes.success) setActividades(actRes.data.filter(a => a.activa).map(a => a.nombre))
    if (staffRes.success) setStaffList(staffRes.data.filter(s => s.activo).map(s => s.nombre))
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const res = await createTicket(form as any)
    if (res.success) {
      setShowCreate(false)
      setForm({ cliente: '', descripcion: '', actividad: '', vendedor: '', responsable: '', tipo: 'queja', categoria: '', prioridad: 'media', canal_origen: 'portal', whatsapp: '', email: '' })
      loadData()
    }
  }

  async function handleStatusChange(id: number, estatus: string) {
    const res = await updateTicketStatus(id, estatus)
    if (res.success) {
      loadData()
      if (showDetail) setShowDetail({ ...showDetail, estatus: estatus as any })
    }
  }

  async function handleAssign(id: number, asignado_a: string) {
    const res = await assignTicket(id, asignado_a)
    if (res.success) loadData()
  }

  async function handleResolve(ticket: Ticket) {
    await updateTicket(ticket.id, {
      respuesta: resolveForm.respuesta,
      accion_correctiva: resolveForm.accion_correctiva,
      satisfaccion_resolucion: resolveForm.satisfaccion_resolucion || undefined
    } as any)
    await updateTicketStatus(ticket.id, 'Resuelto')
    setShowDetail(null)
    setResolveForm({ respuesta: '', accion_correctiva: '', satisfaccion_resolucion: 0 })
    loadData()
  }

  useEffect(() => { loadData() }, [filters.estatus, filters.categoria, filters.prioridad])

  function timeSince(date: string) {
    const now = new Date()
    const then = new Date(date)
    const hours = Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60))
    if (hours < 1) return 'Hace menos de 1h'
    if (hours < 24) return `Hace ${hours}h`
    const days = Math.floor(hours / 24)
    return `Hace ${days}d`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">🎫 Tickets de Servicio</h1>
          <p className="text-sm text-gray-500">Gestión de quejas, incidencias y mejora continua</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2.5 rounded-xl font-medium flex items-center gap-2 shadow-lg shadow-blue-600/20 hover:shadow-blue-600/40 transition-all hover:scale-105"
        >
          <Plus className="w-4 h-4" /> Nuevo Ticket
        </button>
      </div>

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 text-red-600 mb-1">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-xs font-medium uppercase">Abiertos</span>
            </div>
            <span className="text-2xl font-bold text-gray-800">{stats.abiertos || 0}</span>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 text-yellow-600 mb-1">
              <Clock className="w-4 h-4" />
              <span className="text-xs font-medium uppercase">En Proceso</span>
            </div>
            <span className="text-2xl font-bold text-gray-800">{stats.en_proceso || 0}</span>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 text-green-600 mb-1">
              <CheckCircle className="w-4 h-4" />
              <span className="text-xs font-medium uppercase">Resueltos</span>
            </div>
            <span className="text-2xl font-bold text-gray-800">{stats.resueltos || 0}</span>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 text-blue-600 mb-1">
              <Clock className="w-4 h-4" />
              <span className="text-xs font-medium uppercase">T. Resolución</span>
            </div>
            <span className="text-2xl font-bold text-gray-800">
              {stats.avgResolutionHours ? `${stats.avgResolutionHours}h` : '—'}
            </span>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 text-purple-600 mb-1">
              <RefreshCw className="w-4 h-4" />
              <span className="text-xs font-medium uppercase">Recurrentes</span>
            </div>
            <span className="text-2xl font-bold text-gray-800">{stats.recurrentes?.length || 0}</span>
          </div>
        </div>
      )}

      {/* Recurrence alerts */}
      {stats?.recurrentes && stats.recurrentes.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <h3 className="font-semibold text-orange-800 flex items-center gap-2 mb-2">
            <RefreshCw className="w-4 h-4" /> Problemas Recurrentes
          </h3>
          <div className="space-y-1">
            {stats.recurrentes.map((r, i) => (
              <div key={i} className="text-sm text-orange-700 flex items-center gap-2">
                <span className="font-medium">{r.actividad}</span>
                <span className="text-orange-500">→</span>
                <span>{r.categoria}</span>
                <span className="bg-orange-200 px-2 py-0.5 rounded-full text-xs font-bold">{r.count}x</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar tickets..."
              value={filters.search}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && loadData()}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            />
          </div>
          <select
            value={filters.estatus}
            onChange={e => setFilters(f => ({ ...f, estatus: e.target.value }))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Todos los estatus</option>
            {ESTATUS.map(s => <option key={s.value} value={s.value}>{s.value}</option>)}
          </select>
          <select
            value={filters.categoria}
            onChange={e => setFilters(f => ({ ...f, categoria: e.target.value }))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Todas las categorías</option>
            {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
          </select>
          <select
            value={filters.prioridad}
            onChange={e => setFilters(f => ({ ...f, prioridad: e.target.value }))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Todas las prioridades</option>
            {PRIORIDADES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
      </div>

      {/* Ticket list */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-12 text-gray-400">Cargando tickets...</div>
        ) : tickets.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center border border-gray-100">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-600">Sin tickets</h3>
            <p className="text-sm text-gray-400">No hay tickets que coincidan con los filtros</p>
          </div>
        ) : (
          tickets.map(ticket => (
            <div
              key={ticket.id}
              onClick={() => setShowDetail(ticket)}
              className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:shadow-md hover:border-blue-200 transition-all cursor-pointer"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-mono text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{ticket.codigo}</span>
                    <StatusBadge estatus={ticket.estatus} />
                    <PrioTag prioridad={ticket.prioridad} />
                    {ticket.recurrence?.isRecurrent && (
                      <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">⚠️ Recurrente</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-800 font-medium truncate">{ticket.descripcion}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                    <span className="flex items-center gap-1"><User className="w-3 h-3" /> {ticket.cliente}</span>
                    {ticket.actividad && <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> {ticket.actividad}</span>}
                    {ticket.categoria && <span className="flex items-center gap-1"><Tag className="w-3 h-3" /> {ticket.categoria}</span>}
                    <span>{timeSince(ticket.created_at)}</span>
                  </div>
                </div>
                {ticket.asignado_a && (
                  <div className="ml-3 flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700"
                      title={ticket.asignado_a}>
                      {ticket.asignado_a.charAt(0)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-10 px-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mb-10">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">🎫 Nuevo Ticket</h2>
              <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cliente *</label>
                  <input type="text" required value={form.cliente} onChange={e => setForm(f => ({ ...f, cliente: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400" placeholder="Nombre del cliente" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp</label>
                  <input type="text" value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400" placeholder="+507..." />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                  <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    {TIPOS.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
                  <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="">Seleccionar...</option>
                    {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prioridad</label>
                  <select value={form.prioridad} onChange={e => setForm(f => ({ ...f, prioridad: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    {PRIORIDADES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Actividad</label>
                  <select value={form.actividad} onChange={e => setForm(f => ({ ...f, actividad: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="">Sin actividad</option>
                    {actividades.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Canal de Origen</label>
                  <select value={form.canal_origen} onChange={e => setForm(f => ({ ...f, canal_origen: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="portal">Portal</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="telefono">Teléfono</option>
                    <option value="email">Email</option>
                    <option value="social">Redes Sociales</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción *</label>
                <textarea required rows={4} value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 resize-none"
                  placeholder="Describe el problema o situación..." />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
                <button type="submit" className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">Crear Ticket</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-10 px-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mb-10">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-blue-600">{showDetail.codigo}</span>
                  <StatusBadge estatus={showDetail.estatus} />
                  <PrioTag prioridad={showDetail.prioridad} />
                </div>
              </div>
              <button onClick={() => setShowDetail(null)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Info grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-500">Cliente:</span> <strong>{showDetail.cliente}</strong></div>
                <div><span className="text-gray-500">Tipo:</span> {TIPOS.find(t => t.value === showDetail.tipo)?.icon} {showDetail.tipo}</div>
                {showDetail.actividad && <div><span className="text-gray-500">Tour:</span> {showDetail.actividad}</div>}
                {showDetail.vendedor && <div><span className="text-gray-500">Vendedor:</span> {showDetail.vendedor}</div>}
                {showDetail.categoria && <div><span className="text-gray-500">Categoría:</span> {showDetail.categoria}</div>}
                {showDetail.canal_origen && <div><span className="text-gray-500">Canal:</span> {showDetail.canal_origen}</div>}
                <div><span className="text-gray-500">Creado:</span> {new Date(showDetail.created_at).toLocaleString('es-PA')}</div>
                {showDetail.asignado_a && <div><span className="text-gray-500">Asignado:</span> {showDetail.asignado_a}</div>}
              </div>

              {/* Description */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Descripción</h4>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{showDetail.descripcion}</p>
              </div>

              {/* Resolution */}
              {showDetail.respuesta && (
                <div className="bg-green-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-green-800 mb-1">✅ Respuesta</h4>
                  <p className="text-sm text-green-700 whitespace-pre-wrap">{showDetail.respuesta}</p>
                </div>
              )}
              {showDetail.accion_correctiva && (
                <div className="bg-blue-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-blue-800 mb-1">🔧 Acción Correctiva</h4>
                  <p className="text-sm text-blue-700 whitespace-pre-wrap">{showDetail.accion_correctiva}</p>
                </div>
              )}

              {/* Actions */}
              <div className="border-t border-gray-100 pt-4 space-y-3">
                {/* Assign */}
                {!showDetail.asignado_a && showDetail.estatus !== 'Cerrado' && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">Asignar a:</span>
                    <select onChange={e => { if (e.target.value) handleAssign(showDetail.id, e.target.value) }}
                      className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm flex-1">
                      <option value="">Seleccionar...</option>
                      {staffList.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}

                {/* Resolve form */}
                {(['Abierto', 'En Proceso'].includes(showDetail.estatus)) && (
                  <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                    <h4 className="text-sm font-semibold text-gray-700">Resolver Ticket</h4>
                    <textarea placeholder="¿Qué se hizo para resolver?" rows={3}
                      value={resolveForm.respuesta} onChange={e => setResolveForm(f => ({ ...f, respuesta: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
                    <textarea placeholder="Acción correctiva implementada (prevención)" rows={2}
                      value={resolveForm.accion_correctiva} onChange={e => setResolveForm(f => ({ ...f, accion_correctiva: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
                    <button onClick={() => handleResolve(showDetail)}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors w-full">
                      ✅ Marcar como Resuelto
                    </button>
                  </div>
                )}

                {/* Status buttons */}
                <div className="flex gap-2 flex-wrap">
                  {showDetail.estatus === 'Abierto' && (
                    <button onClick={() => handleStatusChange(showDetail.id, 'En Proceso')}
                      className="px-3 py-1.5 bg-yellow-100 text-yellow-800 rounded-lg text-sm hover:bg-yellow-200 transition-colors">
                      🟡 Marcar En Proceso
                    </button>
                  )}
                  {showDetail.estatus === 'Resuelto' && (
                    <button onClick={() => handleStatusChange(showDetail.id, 'Cerrado')}
                      className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition-colors">
                      📁 Cerrar Ticket
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
