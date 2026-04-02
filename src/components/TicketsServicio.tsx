import { useState, useEffect } from 'react'
import { getTickets, getTicketStats, createTicket, updateTicketStatus, assignTicket, updateTicket, getActividades, getUsuarios, Ticket, TicketStats, Usuario } from '../api/api'
import { AlertTriangle, CheckCircle, Clock, Plus, X, Search, User, Tag, Activity, RefreshCw, FileText, BarChart3 } from 'lucide-react'

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

const CAT_COLORS = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#6b7280']
const PRIO_COLORS: Record<string, string> = { critica: '#ef4444', alta: '#f97316', media: '#eab308', baja: '#9ca3af' }

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

// Donut chart component
function DonutChart({ data, colors, title }: { data: { label: string; value: number }[]; colors: string[]; title: string }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) return <div className="text-center text-gray-400 text-sm py-8">Sin datos</div>
  
  let cumulative = 0
  const segments = data.map((d, i) => {
    const pct = (d.value / total) * 100
    const offset = cumulative
    cumulative += pct
    return { ...d, pct, offset, color: colors[i % colors.length] }
  })

  const gradientParts = segments.map(s => `${s.color} ${s.offset}% ${s.offset + s.pct}%`).join(', ')

  return (
    <div className="text-center">
      <h4 className="text-sm font-semibold text-gray-700 mb-3">{title}</h4>
      <div className="relative w-32 h-32 mx-auto mb-3">
        <div className="w-full h-full rounded-full" style={{ background: `conic-gradient(${gradientParts})` }} />
        <div className="absolute inset-3 bg-white rounded-full flex items-center justify-center">
          <span className="text-xl font-bold text-gray-800">{total}</span>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-1 text-xs text-gray-600">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
            {s.label} ({s.value})
          </div>
        ))}
      </div>
    </div>
  )
}

// Horizontal bar chart
function HBarChart({ data, title }: { data: { label: string; value: number }[]; title: string }) {
  const max = Math.max(...data.map(d => d.value), 1)
  if (data.length === 0) return null
  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-700 mb-3">{title}</h4>
      <div className="space-y-2">
        {data.slice(0, 8).map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-gray-600 w-32 truncate flex-shrink-0" title={d.label}>{d.label}</span>
            <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-500"
                style={{ width: `${(d.value / max) * 100}%` }} />
            </div>
            <span className="text-xs font-bold text-gray-700 w-6 text-right">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Trend line chart
function TrendChart({ data }: { data: { mes: string; total: number; resueltos: number }[] }) {
  if (!data || data.length === 0) return null
  const maxVal = Math.max(...data.map(d => d.total), 1)
  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-700 mb-3">📈 Tendencia Mensual</h4>
      <div className="flex items-end gap-1.5 h-28">
        {data.map((d, i) => {
          const totalH = (d.total / maxVal) * 100
          const resolvedH = (d.resueltos / maxVal) * 100
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
              <span className="text-[10px] font-bold text-gray-600">{d.total}</span>
              <div className="w-full relative" style={{ height: '80px' }}>
                <div className="absolute bottom-0 left-0 right-0 bg-blue-100 rounded-t-md transition-all" style={{ height: `${totalH}%` }} />
                <div className="absolute bottom-0 left-[15%] right-[15%] bg-green-500 rounded-t-md transition-all" style={{ height: `${resolvedH}%` }} />
              </div>
              <span className="text-[9px] text-gray-400">{d.mes?.substring(5)}</span>
            </div>
          )
        })}
      </div>
      <div className="flex justify-center gap-4 mt-2 text-[10px] text-gray-500">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-blue-100" /> Total</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-green-500" /> Resueltos</span>
      </div>
    </div>
  )
}

export default function TicketsServicio() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [stats, setStats] = useState<TicketStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [showDetail, setShowDetail] = useState<Ticket | null>(null)
  const [showCharts, setShowCharts] = useState(false)
  const [filters, setFilters] = useState({ estatus: '', categoria: '', prioridad: '', search: '' })
  const [actividades, setActividades] = useState<string[]>([])
  const [usersList, setUsersList] = useState<Usuario[]>([])

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
    const [actRes, usersRes] = await Promise.all([getActividades(), getUsuarios()])
    if (actRes.success) setActividades(actRes.data.filter(a => a.activa).map(a => a.nombre))
    if (usersRes.success) setUsersList(usersRes.data.filter(u => u.activo))
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

  // Active Mahana users (admin + vendedor) for assignment
  const assignableUsers = usersList.filter(u => u.rol === 'admin' || u.rol === 'vendedor')

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between animate-fadeInDown">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">🎫 Tickets de Servicio</h1>
          <p className="text-sm text-gray-500">Gestión de quejas, incidencias y mejora continua</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCharts(!showCharts)}
            className={`px-3 py-2.5 rounded-xl font-medium flex items-center gap-2 text-sm border transition-all ${
              showCharts ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <BarChart3 className="w-4 h-4" /> Gráficas
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2.5 rounded-xl font-medium flex items-center gap-2 btn-premium shadow-glow-blue"
          >
            <Plus className="w-4 h-4" /> Nuevo Ticket
          </button>
        </div>
      </div>

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 animate-fadeInUp">
          <div className="card-premium p-4">
            <div className="flex items-center gap-2 text-red-600 mb-1">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Abiertos</span>
            </div>
            <span className="text-2xl font-bold text-gray-800">{stats.abiertos || 0}</span>
          </div>
          <div className="card-premium p-4">
            <div className="flex items-center gap-2 text-yellow-600 mb-1">
              <Clock className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">En Proceso</span>
            </div>
            <span className="text-2xl font-bold text-gray-800">{stats.en_proceso || 0}</span>
          </div>
          <div className="card-premium p-4">
            <div className="flex items-center gap-2 text-green-600 mb-1">
              <CheckCircle className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Resueltos</span>
            </div>
            <span className="text-2xl font-bold text-gray-800">{stats.resueltos || 0}</span>
          </div>
          <div className="card-premium p-4">
            <div className="flex items-center gap-2 text-blue-600 mb-1">
              <Clock className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">T. Resolución</span>
            </div>
            <span className="text-2xl font-bold text-gray-800">
              {stats.avgResolutionHours ? `${stats.avgResolutionHours}h` : '—'}
            </span>
          </div>
          <div className="card-premium p-4">
            <div className="flex items-center gap-2 text-purple-600 mb-1">
              <RefreshCw className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Recurrentes</span>
            </div>
            <span className="text-2xl font-bold text-gray-800">{stats.recurrentes?.length || 0}</span>
          </div>
        </div>
      )}

      {/* Charts section */}
      {showCharts && stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card-premium p-5 animate-fadeInUp">
            <DonutChart
              title="Por Categoría"
              data={(stats.porCategoria || []).map(c => ({ label: c.categoria || 'Sin cat.', value: c.count }))}
              colors={CAT_COLORS}
            />
          </div>
          <div className="card-premium p-5">
            <DonutChart
              title="Por Prioridad"
              data={(stats.porPrioridad || []).map(p => ({ label: p.prioridad, value: p.count }))}
              colors={(stats.porPrioridad || []).map(p => PRIO_COLORS[p.prioridad] || '#9ca3af')}
            />
          </div>
          <div className="card-premium p-5">
            <HBarChart
              title="Top Tours con Tickets"
              data={(stats.porActividad || []).map(a => ({ label: a.actividad || 'Sin tour', value: a.count }))}
            />
          </div>
          {stats.tendencia && stats.tendencia.length > 1 && (
            <div className="card-premium p-5 md:col-span-3">
              <TrendChart data={stats.tendencia} />
            </div>
          )}
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
      <div className="card-premium p-4 animate-fadeInUp">
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
              className="card-premium-interactive p-4"
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
        <div className="fixed inset-0 modal-overlay z-50 flex items-start justify-center pt-10 px-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-premium-xl w-full max-w-2xl mb-10 modal-content">
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Actividad / Tour</label>
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
                    <option value="partner-portal">Partner Portal</option>
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
        <div className="fixed inset-0 modal-overlay z-50 flex items-start justify-center pt-10 px-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-premium-xl w-full max-w-2xl mb-10 modal-content">
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
                {/* Re-assign or assign */}
                {showDetail.estatus !== 'Cerrado' && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">{showDetail.asignado_a ? 'Re-asignar a:' : 'Asignar a:'}</span>
                    <select
                      defaultValue=""
                      onChange={e => { if (e.target.value) handleAssign(showDetail.id, e.target.value) }}
                      className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm flex-1"
                    >
                      <option value="">Seleccionar usuario...</option>
                      {assignableUsers.map(u => (
                        <option key={u.id} value={u.nombre}>
                          {u.nombre} ({u.rol === 'admin' ? 'Admin' : 'Vendedor'})
                        </option>
                      ))}
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
