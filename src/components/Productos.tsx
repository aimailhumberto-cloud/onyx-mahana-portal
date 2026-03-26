import { useState, useEffect } from 'react'
import {
  Plus, Edit3, Trash2, ToggleLeft, ToggleRight, X, Save, Loader2,
  Waves, Mountain, MapPin, Truck, Package, Search, AlertCircle, CheckCircle,
  Building2, Clock, Users, DollarSign, ChevronDown, ChevronUp, ImageIcon,
  Copy, Link2, Globe, Eye, EyeOff
} from 'lucide-react'
import {
  getActividades, createActividad, updateActividad, deleteActividad,
  getPropiedades, createPropiedad, updatePropiedad, deletePropiedad,
  uploadFile,
} from '../api/api'
import type { Actividad, Propiedad } from '../api/api'

// ── Category config ──
const CATEGORIAS = [
  { key: 'Acuáticas', label: '🏄 Acuáticas', icon: Waves, color: 'bg-blue-50 border-blue-200 text-blue-700' },
  { key: 'Premium Adventures', label: '🌿 Premium Adventures', icon: Mountain, color: 'bg-green-50 border-green-200 text-green-700' },
  { key: 'Hiking & Tours', label: '🥾 Hiking & Tours', icon: MapPin, color: 'bg-amber-50 border-amber-200 text-amber-700' },
  { key: 'City Tours', label: '🏙️ City Tours', icon: MapPin, color: 'bg-orange-50 border-orange-200 text-orange-700' },
  { key: 'Transporte', label: '🚐 Transporte', icon: Truck, color: 'bg-purple-50 border-purple-200 text-purple-700' },
  { key: 'Otro', label: '📦 Otro', icon: Package, color: 'bg-gray-50 border-gray-200 text-gray-600' },
]

const SITIOS_OPTIONS = [
  { key: 'mahanatours', label: 'Mahana Tours' },
  { key: 'ans-surf', label: 'ANS Surf' },
  { key: 'circuito-chame', label: 'Circuito Chamé' },
]

const EMPTY_ACT: Partial<Actividad> = {
  nombre: '', tipo: 'tour', categoria: 'Acuáticas', descripcion: '', unidad: 'Por pax',
  duracion: '', horario: '', punto_encuentro: '', que_incluye: '', que_llevar: '',
  requisitos: '', disponibilidad: 'Todo el año', precio_base: null, costo_base: null,
  costo_instructor: null, comision_caracol_pct: null, capacidad_max: null, transporte: 0, activa: 1,
  slug: null, visible_web: 0, sitios: null, imagen_url: null,
}

const EMPTY_PROP: Partial<Propiedad> = {
  nombre: '', tipo: 'Apartamento', descripcion: '', habitaciones: null, capacidad: null,
  precio_noche: null, impuesto_pct: 0, cleaning_fee: 0, amenidades: '', activa: 1,
}

export default function Productos() {
  const [tab, setTab] = useState<'actividades' | 'propiedades'>('actividades')
  const [actividades, setActividades] = useState<Actividad[]>([])
  const [propiedades, setPropiedades] = useState<Propiedad[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [actForm, setActForm] = useState<Partial<Actividad>>(EMPTY_ACT)
  const [propForm, setPropForm] = useState<Partial<Propiedad>>(EMPTY_PROP)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  // Expanded cards
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  // ── Data fetch ──
  const fetchAll = async () => {
    setLoading(true)
    const [actRes, propRes] = await Promise.all([getActividades(), getPropiedades()])
    if (actRes.success) setActividades(actRes.data)
    if (propRes.success) setPropiedades(propRes.data)
    setLoading(false)
  }
  useEffect(() => { fetchAll() }, [])

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3000)
  }

  // ── Activity CRUD ──
  const openNewAct = () => { setEditId(null); setActForm({ ...EMPTY_ACT }); setShowModal(true) }
  const openEditAct = (a: Actividad) => { setEditId(a.id); setActForm({ ...a }); setShowModal(true) }
  const saveAct = async () => {
    setSaving(true)
    try {
      const res = editId
        ? await updateActividad(editId, actForm)
        : await createActividad(actForm)
      if (res.success) {
        showToast('success', editId ? 'Actividad actualizada' : 'Actividad creada')
        setShowModal(false); fetchAll()
      } else {
        showToast('error', res.error?.message || 'Error')
      }
    } catch { showToast('error', 'Error de conexión') }
    setSaving(false)
  }
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const res = await uploadFile(file)
      if (res.success) {
        setActForm(prev => ({ ...prev, imagen_url: res.data.url }))
      }
    } catch { }
    setUploading(false)
  }
  const toggleActivo = async (a: Actividad) => {
    try {
      const res = await updateActividad(a.id, { activa: a.activa ? 0 : 1 })
      if (res.success) {
        showToast('success', a.activa ? 'Producto desactivado' : 'Producto activado')
        fetchAll()
      } else {
        showToast('error', res.error?.message || 'Error al cambiar estado')
      }
    } catch { showToast('error', 'Error de conexión') }
  }
  const doDeleteAct = async (id: number) => {
    try {
      const res = await deleteActividad(id)
      if (res.success) { showToast('success', 'Actividad eliminada'); fetchAll() }
      else showToast('error', res.error?.message || 'Error al eliminar')
    } catch (err: any) {
      showToast('error', err.response?.data?.error?.message || 'Error al eliminar actividad')
    }
    setConfirmDelete(null)
  }

  // ── Property CRUD ──
  const openNewProp = () => { setEditId(null); setPropForm({ ...EMPTY_PROP }); setShowModal(true) }
  const openEditProp = (p: Propiedad) => { setEditId(p.id); setPropForm({ ...p }); setShowModal(true) }
  const saveProp = async () => {
    setSaving(true)
    try {
      const res = editId
        ? await updatePropiedad(editId, propForm)
        : await createPropiedad(propForm)
      if (res.success) {
        showToast('success', editId ? 'Propiedad actualizada' : 'Propiedad creada')
        setShowModal(false); fetchAll()
      } else {
        showToast('error', res.error?.message || 'Error')
      }
    } catch { showToast('error', 'Error de conexión') }
    setSaving(false)
  }
  const togglePropActiva = async (p: Propiedad) => {
    await updatePropiedad(p.id, { activa: p.activa ? 0 : 1 })
    fetchAll()
  }
  const doDeleteProp = async (id: number) => {
    try {
      const res = await deletePropiedad(id)
      if (res.success) { showToast('success', 'Propiedad eliminada'); fetchAll() }
      else showToast('error', res.error?.message || 'Error al eliminar')
    } catch (err: any) {
      showToast('error', err.response?.data?.error?.message || 'Error al eliminar propiedad')
    }
    setConfirmDelete(null)
  }

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Filter ──
  const filteredActs = actividades.filter(a =>
    a.nombre.toLowerCase().includes(search.toLowerCase()) ||
    (a.categoria || '').toLowerCase().includes(search.toLowerCase())
  )
  const filteredProps = propiedades.filter(p =>
    p.nombre.toLowerCase().includes(search.toLowerCase()) ||
    (p.tipo || '').toLowerCase().includes(search.toLowerCase())
  )

  // Group activities by category
  const grouped = CATEGORIAS.map(cat => ({
    ...cat,
    items: filteredActs.filter(a => (a.categoria || 'Otro') === cat.key)
  })).filter(g => g.items.length > 0)

  // Uncategorized
  const uncategorized = filteredActs.filter(a => !a.categoria || !CATEGORIAS.some(c => c.key === a.categoria))
  if (uncategorized.length > 0 && !grouped.some(g => g.key === 'Otro')) {
    grouped.push({ ...CATEGORIAS[CATEGORIAS.length - 1], items: uncategorized })
  }

  if (loading) return <div className="flex items-center justify-center h-40"><Loader2 className="w-8 h-8 animate-spin text-turquoise-600" /></div>

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-azul-900">📦 Catálogo de Productos</h1>
        <button
          onClick={tab === 'actividades' ? openNewAct : openNewProp}
          className="flex items-center gap-2 px-4 py-2 bg-turquoise-600 text-white rounded-lg font-medium hover:bg-turquoise-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          {tab === 'actividades' ? 'Nueva Actividad' : 'Nueva Propiedad'}
        </button>
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex bg-white rounded-lg shadow-sm border border-gray-200">
          <button
            onClick={() => setTab('actividades')}
            className={`px-4 py-2 rounded-l-lg font-medium text-sm transition-colors
              ${tab === 'actividades' ? 'bg-turquoise-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            🏄 Actividades ({actividades.length})
          </button>
          <button
            onClick={() => setTab('propiedades')}
            className={`px-4 py-2 rounded-r-lg font-medium text-sm transition-colors
              ${tab === 'propiedades' ? 'bg-purple-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            🏨 Propiedades ({propiedades.length})
          </button>
        </div>
        <div className="relative flex-1 min-w-0 w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-turquoise-500 text-sm"
            placeholder={tab === 'actividades' ? 'Buscar actividad o categoría...' : 'Buscar propiedad...'}
          />
        </div>
      </div>

      {/* ═══ ACTIVIDADES TAB ═══ */}
      {tab === 'actividades' && (
        <div className="space-y-6">
          {grouped.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No hay actividades</p>
            </div>
          )}
          {grouped.map(group => (
            <div key={group.key}>
              <h2 className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold mb-3 border ${group.color}`}>
                <group.icon className="w-4 h-4" />
                {group.label} ({group.items.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {group.items.map(act => (
                  <div key={act.id} className={`bg-white rounded-xl border shadow-sm transition-all hover:shadow-md
                    ${act.activa ? 'border-gray-200' : 'border-red-200 opacity-60'}`}>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2.5">
                          {act.imagen_url ? (
                            <img src={act.imagen_url} alt={act.nombre} className="w-10 h-10 rounded-lg object-cover shadow-sm ring-1 ring-gray-200" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                              <ImageIcon className="w-5 h-5 text-gray-300" />
                            </div>
                          )}
                          <h3 className="font-semibold text-azul-900 leading-tight">{act.nombre}</h3>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => toggleActivo(act)} title={act.activa ? 'Desactivar' : 'Activar'}>
                            {act.activa ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                          </button>
                          <button onClick={() => openEditAct(act)} className="p-1 hover:bg-gray-100 rounded">
                            <Edit3 className="w-4 h-4 text-gray-500" />
                          </button>
                          {confirmDelete === act.id ? (
                            <div className="flex gap-1">
                              <button onClick={() => doDeleteAct(act.id)} className="px-1.5 py-0.5 bg-red-500 text-white text-xs rounded">Sí</button>
                              <button onClick={() => setConfirmDelete(null)} className="px-1.5 py-0.5 bg-gray-200 text-xs rounded">No</button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmDelete(act.id)} className="p-1 hover:bg-red-50 rounded">
                              <Trash2 className="w-4 h-4 text-red-400" />
                            </button>
                          )}
                        </div>
                      </div>
                      {/* Quick info */}
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 mb-2">
                        {act.precio_base != null && <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />${act.precio_base}</span>}
                        {act.duracion && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{act.duracion}</span>}
                        {act.capacidad_max != null && <span className="flex items-center gap-1"><Users className="w-3 h-3" />Max {act.capacidad_max}</span>}
                        {act.unidad && <span className="bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">{act.unidad}</span>}
                      </div>
                      {act.horario && <p className="text-xs text-gray-500">🕐 {act.horario}</p>}

                      {/* Expand toggle */}
                      <button onClick={() => toggleExpand(act.id)} className="text-xs text-turquoise-600 hover:text-turquoise-700 flex items-center gap-1 mt-2">
                        {expanded.has(act.id) ? <><ChevronUp className="w-3 h-3" /> Menos</> : <><ChevronDown className="w-3 h-3" /> Más detalles</>}
                      </button>

                      {expanded.has(act.id) && (
                        <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5 text-xs text-gray-600">
                          {act.descripcion && <p><span className="font-medium">Descripción:</span> {act.descripcion}</p>}
                          {act.punto_encuentro && <p><span className="font-medium">Punto de Encuentro:</span> {act.punto_encuentro}</p>}
                          {act.que_incluye && <p><span className="font-medium">Incluye:</span> {act.que_incluye}</p>}
                          {act.que_llevar && <p><span className="font-medium">Llevar:</span> {act.que_llevar}</p>}
                          {act.requisitos && <p><span className="font-medium">Requisitos:</span> {act.requisitos}</p>}
                          {act.disponibilidad && <p><span className="font-medium">Disponibilidad:</span> {act.disponibilidad}</p>}
                          <div className="flex gap-3 pt-1">
                            {act.costo_instructor != null && <span>Costo instructor: <strong>${act.costo_instructor}</strong></span>}
                            {act.comision_caracol_pct != null && <span>Comisión: <strong>{act.comision_caracol_pct}%</strong></span>}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ PROPIEDADES TAB ═══ */}
      {tab === 'propiedades' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredProps.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-400">
              <Building2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No hay propiedades</p>
            </div>
          )}
          {filteredProps.map(prop => (
            <div key={prop.id} className={`bg-white rounded-xl border shadow-sm transition-all hover:shadow-md
              ${prop.activa ? 'border-gray-200' : 'border-red-200 opacity-60'}`}>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <h3 className="font-semibold text-azul-900">{prop.nombre}</h3>
                    {prop.tipo && <span className="text-xs text-gray-500 bg-purple-50 px-2 py-0.5 rounded-full">{prop.tipo}</span>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => togglePropActiva(prop)} title={prop.activa ? 'Desactivar' : 'Activar'}>
                      {prop.activa ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                    </button>
                    <button onClick={() => openEditProp(prop)} className="p-1 hover:bg-gray-100 rounded">
                      <Edit3 className="w-4 h-4 text-gray-500" />
                    </button>
                    {confirmDelete === prop.id + 10000 ? (
                      <div className="flex gap-1">
                        <button onClick={() => doDeleteProp(prop.id)} className="px-1.5 py-0.5 bg-red-500 text-white text-xs rounded">Sí</button>
                        <button onClick={() => setConfirmDelete(null)} className="px-1.5 py-0.5 bg-gray-200 text-xs rounded">No</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDelete(prop.id + 10000)} className="p-1 hover:bg-red-50 rounded">
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                  {prop.habitaciones != null && <span>🛏️ {prop.habitaciones} hab.</span>}
                  {prop.capacidad != null && <span>👥 {prop.capacidad} huésp.</span>}
                  {prop.precio_noche != null && <span>💰 ${prop.precio_noche}/noche</span>}
                  <span>📊 Impuesto: {prop.impuesto_pct}%</span>
                  {prop.cleaning_fee > 0 && <span>🧹 Cleaning: ${prop.cleaning_fee}</span>}
                </div>
                {prop.amenidades && (
                  <p className="text-xs text-gray-500 mt-2">✨ {prop.amenidades}</p>
                )}
                {prop.descripcion && (
                  <p className="text-xs text-gray-400 mt-1">{prop.descripcion}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ MODAL ═══ */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-[5vh] px-4 overflow-y-auto" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mb-10" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white rounded-t-2xl flex items-center justify-between px-6 py-4 border-b z-10">
              <h2 className="text-lg font-bold text-azul-900">
                {editId ? 'Editar' : 'Nueva'} {tab === 'actividades' ? 'Actividad' : 'Propiedad'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {tab === 'actividades' ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input label="Nombre *" value={actForm.nombre || ''} onChange={v => setActForm({ ...actForm, nombre: v })} />
                    <Select label="Categoría" value={actForm.categoria || 'Otro'} onChange={v => setActForm({ ...actForm, categoria: v })}
                      options={CATEGORIAS.map(c => ({ value: c.key, label: c.label }))} />
                  </div>
                  <Input label="Descripción" value={actForm.descripcion || ''} onChange={v => setActForm({ ...actForm, descripcion: v })} textarea />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <NumberInput label="Precio $" value={actForm.precio_base} onChange={v => setActForm({ ...actForm, precio_base: v })} />
                    <NumberInput label="Costo $" value={actForm.costo_base} onChange={v => setActForm({ ...actForm, costo_base: v })} />
                    <NumberInput label="Costo Instr. $" value={actForm.costo_instructor} onChange={v => setActForm({ ...actForm, costo_instructor: v })} />
                    <NumberInput label="Comisión %" value={actForm.comision_caracol_pct} onChange={v => setActForm({ ...actForm, comision_caracol_pct: v })} />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <Input label="Duración" value={actForm.duracion || ''} onChange={v => setActForm({ ...actForm, duracion: v })} placeholder="2 horas" />
                    <Input label="Horario" value={actForm.horario || ''} onChange={v => setActForm({ ...actForm, horario: v })} placeholder="8:00am, 2:00pm" />
                    <Input label="Unidad" value={actForm.unidad || ''} onChange={v => setActForm({ ...actForm, unidad: v })} placeholder="Por pax" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input label="Punto de Encuentro" value={actForm.punto_encuentro || ''} onChange={v => setActForm({ ...actForm, punto_encuentro: v })} />
                    <Input label="Disponibilidad" value={actForm.disponibilidad || ''} onChange={v => setActForm({ ...actForm, disponibilidad: v })} placeholder="Todo el año" />
                  </div>
                  <Input label="Qué incluye" value={actForm.que_incluye || ''} onChange={v => setActForm({ ...actForm, que_incluye: v })} placeholder="Water, Equipo, Fotografía" />
                  <Input label="Qué llevar" value={actForm.que_llevar || ''} onChange={v => setActForm({ ...actForm, que_llevar: v })} placeholder="Bloqueador, Toalla" />
                  <Input label="Requisitos" value={actForm.requisitos || ''} onChange={v => setActForm({ ...actForm, requisitos: v })} placeholder="Saber nadar" />
                  <NumberInput label="Capacidad Máx." value={actForm.capacidad_max} onChange={v => setActForm({ ...actForm, capacidad_max: v })} integer />
                  {/* Imagen del Producto */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Imagen del Producto</label>
                    <div className="flex items-center gap-3">
                      {actForm.imagen_url ? (
                        <img src={actForm.imagen_url} alt="" className="w-16 h-16 rounded-lg object-cover shadow-sm ring-1 ring-gray-200" />
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center">
                          <ImageIcon className="w-6 h-6 text-gray-300" />
                        </div>
                      )}
                      <div className="flex flex-col gap-1.5">
                        <label className="cursor-pointer px-3 py-2 bg-turquoise-50 text-turquoise-700 border border-turquoise-200 rounded-lg text-sm font-medium hover:bg-turquoise-100 transition-colors flex items-center gap-1.5">
                          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                          {uploading ? 'Subiendo...' : 'Subir Foto'}
                          <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                        </label>
                        {actForm.imagen_url && (
                          <button onClick={() => setActForm({ ...actForm, imagen_url: '' })} className="text-xs text-red-500 hover:underline">Quitar</button>
                        )}
                      </div>
                    </div>
                    {/* URL de imagen (para pegar URL externa) */}
                    <div className="mt-2">
                      <input
                        value={actForm.imagen_url || ''}
                        onChange={e => setActForm({ ...actForm, imagen_url: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-turquoise-500 text-sm text-gray-600"
                        placeholder="O pegar URL de imagen: https://..."
                      />
                    </div>
                  </div>

                  {/* ═══ INTEGRACIÓN WEB ═══ */}
                  <div className="border-t border-gray-200 pt-4 mt-2">
                    <h3 className="text-sm font-bold text-azul-900 flex items-center gap-2 mb-3">
                      <Globe className="w-4 h-4 text-turquoise-600" />
                      Integración Web & Booking
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Slug */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Slug (URL del producto)</label>
                        <input
                          value={actForm.slug || ''}
                          onChange={e => setActForm({ ...actForm, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-turquoise-500 text-sm"
                          placeholder="ej: surf-lesson"
                        />
                        <p className="text-[10px] text-gray-400 mt-0.5">Solo letras, números y guiones</p>
                      </div>

                      {/* Visible Web */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Visible en Web</label>
                        <button
                          type="button"
                          onClick={() => setActForm({ ...actForm, visible_web: actForm.visible_web ? 0 : 1 })}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all w-full ${
                            actForm.visible_web
                              ? 'bg-green-50 border-green-300 text-green-700'
                              : 'bg-gray-50 border-gray-200 text-gray-500'
                          }`}
                        >
                          {actForm.visible_web ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                          {actForm.visible_web ? 'Visible en booking' : 'Oculto en booking'}
                        </button>
                      </div>
                    </div>

                    {/* Sitios */}
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">Sitios donde está activo</label>
                      <div className="flex flex-wrap gap-2">
                        {SITIOS_OPTIONS.map(sitio => {
                          const currentSitios: string[] = actForm.sitios ? (typeof actForm.sitios === 'string' ? JSON.parse(actForm.sitios) : actForm.sitios) : []
                          const isActive = currentSitios.includes(sitio.key)
                          return (
                            <button
                              key={sitio.key}
                              type="button"
                              onClick={() => {
                                const updated = isActive
                                  ? currentSitios.filter(s => s !== sitio.key)
                                  : [...currentSitios, sitio.key]
                                setActForm({ ...actForm, sitios: JSON.stringify(updated) })
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                isActive
                                  ? 'bg-turquoise-100 border-turquoise-300 text-turquoise-700'
                                  : 'bg-gray-50 border-gray-200 text-gray-400 hover:border-gray-300'
                              }`}
                            >
                              {isActive ? '✓ ' : ''}{sitio.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Integration Links — only show when slug exists */}
                    {actForm.slug && (
                      <div className="mt-4 bg-gradient-to-r from-turquoise-50 to-blue-50 rounded-xl p-4 border border-turquoise-200">
                        <h4 className="text-xs font-bold text-turquoise-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <Link2 className="w-3.5 h-3.5" />
                          Enlaces para el Webmaster
                        </h4>
                        <div className="space-y-2.5">
                          {/* Booking URL */}
                          <div>
                            <p className="text-[10px] text-turquoise-600 font-medium mb-1">🔗 URL de Booking (para botón "Reservar")</p>
                            <div className="flex items-center gap-2">
                              <code className="flex-1 bg-white px-3 py-2 rounded-lg text-xs text-gray-700 border border-turquoise-100 font-mono truncate">
                                {window.location.origin}/booking/{actForm.slug}
                              </code>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(`${window.location.origin}/booking/${actForm.slug}`)
                                  setCopiedField('booking')
                                  setTimeout(() => setCopiedField(null), 2000)
                                }}
                                className={`p-2 rounded-lg transition-all shrink-0 ${
                                  copiedField === 'booking'
                                    ? 'bg-green-500 text-white'
                                    : 'bg-white border border-turquoise-200 text-turquoise-600 hover:bg-turquoise-100'
                                }`}
                                title="Copiar"
                              >
                                {copiedField === 'booking' ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>

                          {/* Embeddable URL */}
                          <div>
                            <p className="text-[10px] text-turquoise-600 font-medium mb-1">📦 URL Embebible (para iframe)</p>
                            <div className="flex items-center gap-2">
                              <code className="flex-1 bg-white px-3 py-2 rounded-lg text-xs text-gray-700 border border-turquoise-100 font-mono truncate">
                                {window.location.origin}/booking/{actForm.slug}?embed=1
                              </code>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(`${window.location.origin}/booking/${actForm.slug}?embed=1`)
                                  setCopiedField('embed')
                                  setTimeout(() => setCopiedField(null), 2000)
                                }}
                                className={`p-2 rounded-lg transition-all shrink-0 ${
                                  copiedField === 'embed'
                                    ? 'bg-green-500 text-white'
                                    : 'bg-white border border-turquoise-200 text-turquoise-600 hover:bg-turquoise-100'
                                }`}
                                title="Copiar"
                              >
                                {copiedField === 'embed' ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>

                          {/* Image URL */}
                          {actForm.imagen_url && (
                            <div>
                              <p className="text-[10px] text-turquoise-600 font-medium mb-1">🖼️ URL de Imagen Hero</p>
                              <div className="flex items-center gap-2">
                                <code className="flex-1 bg-white px-3 py-2 rounded-lg text-xs text-gray-700 border border-turquoise-100 font-mono truncate">
                                  {actForm.imagen_url}
                                </code>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(actForm.imagen_url || '')
                                    setCopiedField('imagen')
                                    setTimeout(() => setCopiedField(null), 2000)
                                  }}
                                  className={`p-2 rounded-lg transition-all shrink-0 ${
                                    copiedField === 'imagen'
                                      ? 'bg-green-500 text-white'
                                      : 'bg-white border border-turquoise-200 text-turquoise-600 hover:bg-turquoise-100'
                                  }`}
                                  title="Copiar"
                                >
                                  {copiedField === 'imagen' ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Preview button */}
                          <div className="flex items-center gap-2 pt-1">
                            <a
                              href={`/booking/${actForm.slug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-turquoise-600 text-white rounded-lg text-xs font-medium hover:bg-turquoise-700 transition-colors shadow-sm"
                            >
                              <Globe className="w-3.5 h-3.5" />
                              Ver Booking Page ↗
                            </a>
                            {!actForm.visible_web && (
                              <span className="text-[10px] text-orange-600 bg-orange-50 px-2 py-1 rounded-lg border border-orange-200">
                                ⚠️ Producto oculto — activa "Visible en Web" para que aparezca
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input label="Nombre *" value={propForm.nombre || ''} onChange={v => setPropForm({ ...propForm, nombre: v })} />
                    <Select label="Tipo" value={propForm.tipo || ''} onChange={v => setPropForm({ ...propForm, tipo: v })}
                      options={[{ value: 'Hotel', label: 'Hotel' }, { value: 'Apartamento', label: 'Apartamento' }, { value: 'Casa', label: 'Casa' }, { value: 'Villa', label: 'Villa' }, { value: 'Otro', label: 'Otro' }]} />
                  </div>
                  <Input label="Descripción" value={propForm.descripcion || ''} onChange={v => setPropForm({ ...propForm, descripcion: v })} textarea />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <NumberInput label="Habitaciones" value={propForm.habitaciones} onChange={v => setPropForm({ ...propForm, habitaciones: v })} integer />
                    <NumberInput label="Capacidad" value={propForm.capacidad} onChange={v => setPropForm({ ...propForm, capacidad: v })} integer />
                    <NumberInput label="Precio/Noche $" value={propForm.precio_noche} onChange={v => setPropForm({ ...propForm, precio_noche: v })} />
                    <NumberInput label="Impuesto %" value={propForm.impuesto_pct ?? 0} onChange={v => setPropForm({ ...propForm, impuesto_pct: v ?? 0 })} />
                  </div>
                  <NumberInput label="Cleaning Fee $" value={propForm.cleaning_fee ?? 0} onChange={v => setPropForm({ ...propForm, cleaning_fee: v ?? 0 })} />
                  <Input label="Amenidades" value={propForm.amenidades || ''} onChange={v => setPropForm({ ...propForm, amenidades: v })} placeholder="WiFi, Piscina, A/C, Cocina" />
                </>
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button
                onClick={tab === 'actividades' ? saveAct : saveProp}
                disabled={saving}
                className="px-5 py-2 bg-turquoise-600 text-white rounded-lg font-medium hover:bg-turquoise-700 disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editId ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium
          ${toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ── Reusable field components ──

function Input({ label, value, onChange, placeholder, textarea }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; textarea?: boolean
}) {
  const cls = "w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-turquoise-500 text-sm"
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {textarea
        ? <textarea rows={2} value={value} onChange={e => onChange(e.target.value)} className={`${cls} resize-none`} placeholder={placeholder} />
        : <input value={value} onChange={e => onChange(e.target.value)} className={cls} placeholder={placeholder} />}
    </div>
  )
}

function NumberInput({ label, value, onChange, integer }: {
  label: string; value: number | null | undefined; onChange: (v: number | null) => void; integer?: boolean
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type="number" step={integer ? 1 : 0.01}
        value={value ?? ''}
        onChange={e => onChange(e.target.value === '' ? null : (integer ? parseInt(e.target.value) : parseFloat(e.target.value)))}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-turquoise-500 text-sm"
      />
    </div>
  )
}

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-turquoise-500 bg-white text-sm">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}
