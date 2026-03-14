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
    cliente: '', whatsapp: '', fecha: '', hora: '', actividad: '', responsable: '',
    vendedor: 'Mahana Tours', estatus: 'Consulta', precio_ingreso: '', costo_pago: '',
    comision_pct: '', notas: '', gestionado_por: '', fuente: 'manual'
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
            cliente: t.cliente || '', whatsapp: t.whatsapp || '', fecha: t.fecha || '', hora: t.hora || '',
            actividad: t.actividad || '', responsable: t.responsable || '', vendedor: t.vendedor || 'Mahana Tours',
            estatus: t.estatus || 'Consulta', precio_ingreso: t.precio_ingreso?.toString() || '',
            costo_pago: t.costo_pago?.toString() || '', comision_pct: t.comision_pct?.toString() || '',
            notas: t.notas || '', gestionado_por: t.gestionado_por || '', fuente: t.fuente || 'manual'
          })
        }
        setLoading(false)
      })
    }
  }, [id])

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
      ganancia_mahana: ganancia
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
        {/* Client Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cliente *</label>
            <input required value={form.cliente} onChange={e => onChange('cliente', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-turquoise-500" placeholder="Nombre del cliente" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp</label>
            <input value={form.whatsapp} onChange={e => onChange('whatsapp', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-turquoise-500" placeholder="+507..." />
          </div>
        </div>

        {/* Activity + Date */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Actividad *</label>
            <select required value={form.actividad} onChange={e => onChange('actividad', e.target.value)}
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

        {/* Vendedor (dropdown) + Responsable (free text) + Status */}
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

        {/* Pricing: Precio de Venta + Costo + % Comisión + Ganancia */}
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

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
          <textarea rows={3} value={form.notas} onChange={e => onChange('notas', e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-turquoise-500 resize-none" placeholder="Notas adicionales..." />
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
