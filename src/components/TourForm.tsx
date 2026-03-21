import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { createTour, getTourById, updateTour, getActividades } from '../api/api'
import type { Actividad } from '../api/api'

const STATUSES = ['Consulta', 'Reservado', 'Pagado', 'Cancelado', 'Cerrado']
const VENDEDORES = ['Mahana Tours', 'Casa Mahana', 'Playa Caracol', 'SurfShack', 'Otro']

export default function TourForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id

  const [form, setForm] = useState({
    cliente: '', whatsapp: '', email_cliente: '', fecha: '', hora: '', actividad: '', responsable: '',
    vendedor: 'Mahana Tours', estatus: 'Consulta', precio_ingreso: '', costo_pago: '',
    comision_pct: '', notas: '', gestionado_por: '', fuente: 'manual',
    hotel: '', nacionalidad: '', idioma: '', pax: '1', edades: ''
  })
  const [actividades, setActividades] = useState<Actividad[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(isEdit)
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    getActividades().then(r => { if (r.success) setActividades(r.data) })
    if (isEdit) {
      setLoading(true)
      getTourById(Number(id)).then(r => {
        if (r.success && r.data) {
          const t = r.data
          setForm({
            cliente: t.cliente || '', whatsapp: t.whatsapp || '', email_cliente: t.email_cliente || '',
            fecha: t.fecha || '', hora: t.hora || '',
            actividad: t.actividad || '', responsable: t.responsable || '', vendedor: t.vendedor || 'Mahana Tours',
            estatus: t.estatus || 'Consulta', precio_ingreso: t.precio_ingreso?.toString() || '',
            costo_pago: t.costo_pago?.toString() || '', comision_pct: t.comision_pct?.toString() || '',
            notas: t.notas || '', gestionado_por: t.gestionado_por || '', fuente: t.fuente || 'manual',
            hotel: t.hotel || '', nacionalidad: t.nacionalidad || '', idioma: t.idioma || '',
            pax: t.pax?.toString() || '1', edades: t.edades || ''
          })
        }
        setLoading(false)
      })
    }
  }, [id])

  // Auto-fill from catalog when selecting activity (only for new tours)
  const handleActividadChange = (nombre: string) => {
    onChange('actividad', nombre)
    if (!isEdit) {
      const act = actividades.find(a => a.nombre === nombre)
      if (act) {
        setForm(prev => ({
          ...prev,
          actividad: nombre,
          precio_ingreso: act.precio_base != null ? act.precio_base.toString() : prev.precio_ingreso,
          costo_pago: act.costo_base != null ? act.costo_base.toString() : prev.costo_pago,
          comision_pct: act.comision_caracol_pct != null ? act.comision_caracol_pct.toString() : prev.comision_pct,
          hora: act.horario || prev.hora,
        }))
      }
    }
  }

  const precioVenta = parseFloat(form.precio_ingreso) || 0
  const costo = parseFloat(form.costo_pago) || 0
  const comisionPct = parseFloat(form.comision_pct) || 0
  const montoComision = precioVenta * (comisionPct / 100)
  const ganancia = precioVenta - costo - montoComision

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setResult(null)
    const data: any = {
      ...form,
      precio_ingreso: precioVenta,
      costo_pago: costo,
      ganancia_mahana: ganancia,
      pax: parseInt(form.pax) || 1,
    }
    if (form.comision_pct) data.comision_pct = comisionPct
    try {
      const res = isEdit ? await updateTour(Number(id), data) : await createTour(data)
      if (res.success) {
        setResult({ type: 'success', message: isEdit ? 'Tour actualizado' : `Tour creado (ID: ${res.data?.id})` })
        if (!isEdit) setTimeout(() => navigate('/tours'), 1500)
      } else {
        setResult({ type: 'error', message: res.error?.message || 'Error' })
      }
    } catch { setResult({ type: 'error', message: 'Error de conexión' }) }
    finally { setSaving(false) }
  }

  const onChange = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }))

  if (loading) return <div className="flex items-center justify-center h-40"><Loader2 className="w-8 h-8 animate-spin text-turquoise-600" /></div>

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/tours')} className="p-2 rounded-lg hover:bg-gray-100"><ArrowLeft className="w-5 h-5 text-gray-600" /></button>
        <h1 className="text-2xl font-bold text-azul-900">{isEdit ? 'Editar Tour' : 'Nuevo Tour'}</h1>
      </div>

      {result && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg ${result.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {result.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {result.message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-6 space-y-5">
        {/* Section: Client Info */}
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Datos del Cliente</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cliente *</label>
              <input required value={form.cliente} onChange={e => onChange('cliente', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-turquoise-500" placeholder="Nombre completo" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp</label>
              <input value={form.whatsapp} onChange={e => onChange('whatsapp', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-turquoise-500" placeholder="+507..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={form.email_cliente} onChange={e => onChange('email_cliente', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-turquoise-500" placeholder="cliente@email.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hotel / Alojamiento</label>
              <input value={form.hotel} onChange={e => onChange('hotel', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-turquoise-500" placeholder="Ej: PH Playa Caracol T2-3B" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nacionalidad</label>
              <input value={form.nacionalidad} onChange={e => onChange('nacionalidad', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-turquoise-500" placeholder="Ej: Panamá" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Idioma</label>
              <select value={form.idioma} onChange={e => onChange('idioma', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-turquoise-500 bg-white">
                <option value="">Seleccionar</option>
                <option value="Español">Español</option>
                <option value="English">English</option>
                <option value="Français">Français</option>
                <option value="Otro">Otro</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1"># Personas</label>
              <input type="number" min="1" max="50" value={form.pax} onChange={e => onChange('pax', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-turquoise-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Edades</label>
              <input value={form.edades} onChange={e => onChange('edades', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-turquoise-500" placeholder="25, 30, 8" />
            </div>
          </div>
        </div>

        {/* Section: Tour Info */}
        <div className="border-t border-gray-100 pt-5">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Detalles del Tour</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Actividad *</label>
              <select required value={form.actividad} onChange={e => handleActividadChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-turquoise-500 bg-white">
                <option value="">Seleccionar...</option>
                {actividades.map(a => <option key={a.id} value={a.nombre}>{a.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha *</label>
              <input required type="date" value={form.fecha} onChange={e => onChange('fecha', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-turquoise-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hora</label>
              <input type="time" value={form.hora} onChange={e => onChange('hora', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-turquoise-500" />
            </div>
          </div>
        </div>

        {/* Section: Operations */}
        <div className="border-t border-gray-100 pt-5">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Operaciones</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vendedor</label>
              <select value={form.vendedor} onChange={e => onChange('vendedor', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-turquoise-500 bg-white">
                {VENDEDORES.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Responsable</label>
              <input value={form.responsable} onChange={e => onChange('responsable', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-turquoise-500" placeholder="Nombre del responsable" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
              <select value={form.estatus} onChange={e => onChange('estatus', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-turquoise-500 bg-white">
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Section: Pricing */}
        <div className="border-t border-gray-100 pt-5">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Financiero</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Precio Venta $</label>
              <input type="number" step="0.01" value={form.precio_ingreso} onChange={e => onChange('precio_ingreso', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-turquoise-500" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Costo $</label>
              <input type="number" step="0.01" value={form.costo_pago} onChange={e => onChange('costo_pago', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-turquoise-500" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Comisión %</label>
              <input type="number" step="0.1" value={form.comision_pct} onChange={e => onChange('comision_pct', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-turquoise-500" placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ganancia</label>
              <div className={`px-3 py-2 border rounded-lg font-semibold ${ganancia >= 0 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                ${ganancia.toFixed(2)}
              </div>
              {comisionPct > 0 && (
                <p className="text-[10px] text-gray-400 mt-0.5">= Venta - Costo - {comisionPct}%</p>
              )}
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="border-t border-gray-100 pt-5">
          <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
          <textarea rows={3} value={form.notas} onChange={e => onChange('notas', e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-turquoise-500 resize-none" placeholder="Punto de encuentro, alergias, restricciones, detalles importantes..." />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={() => navigate('/tours')} className="px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="px-6 py-2 bg-turquoise-600 text-white rounded-lg font-medium hover:bg-turquoise-700 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isEdit ? 'Guardar Cambios' : 'Crear Tour'}
          </button>
        </div>
      </form>
    </div>
  )
}
