import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { createEstadia, getEstadiaById, updateEstadia } from '../api/api'

const STATES = ['Solicitada', 'Cotizada', 'Confirmada', 'Pagada', 'Cancelada']
const PROPERTIES = ['Radisson', 'Caracol Residences', 'Otro']

export default function EstadiaForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id

  const [form, setForm] = useState({
    cliente: '', whatsapp: '', email: '', propiedad: '', tipo: '',
    check_in: '', check_out: '', huespedes: '', habitaciones: '',
    precio_cotizado: '', precio_final: '', comision_pct: '20',
    estado: 'Solicitada', responsable: '', notas: '', fuente: 'manual'
  })
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(isEdit)
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    if (isEdit) {
      setLoading(true)
      getEstadiaById(Number(id)).then(r => {
        if (r.success && r.data) {
          const e = r.data
          setForm({
            cliente: e.cliente || '', whatsapp: e.whatsapp || '', email: e.email || '',
            propiedad: e.propiedad || '', tipo: e.tipo || '', check_in: e.check_in || '',
            check_out: e.check_out || '', huespedes: e.huespedes || '', habitaciones: e.habitaciones || '',
            precio_cotizado: e.precio_cotizado || '', precio_final: e.precio_final?.toString() || '',
            comision_pct: e.comision_pct?.toString() || '20', estado: e.estado || 'Solicitada',
            responsable: e.responsable || '', notas: e.notas || '', fuente: e.fuente || 'manual'
          })
        }
        setLoading(false)
      })
    }
  }, [id])

  const precioFinal = parseFloat(form.precio_final) || 0
  const comisionPct = parseFloat(form.comision_pct) || 20
  const montoComision = precioFinal * (comisionPct / 100)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setResult(null)
    const data: any = {
      ...form,
      precio_final: precioFinal || undefined,
      comision_pct: comisionPct,
      monto_comision: precioFinal ? montoComision : undefined
    }
    try {
      const res = isEdit ? await updateEstadia(Number(id), data) : await createEstadia(data)
      if (res.success) {
        setResult({ type: 'success', message: isEdit ? 'Estadía actualizada' : `Estadía creada (ID: ${res.data?.id})` })
        if (!isEdit) setTimeout(() => navigate('/estadias'), 1500)
      } else {
        setResult({ type: 'error', message: res.error?.message || 'Error' })
      }
    } catch { setResult({ type: 'error', message: 'Error de conexión' }) }
    finally { setSaving(false) }
  }

  const onChange = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }))

  if (loading) return <div className="flex items-center justify-center h-40"><Loader2 className="w-8 h-8 animate-spin text-purple-600" /></div>

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/estadias')} className="p-2 rounded-lg hover:bg-gray-100"><ArrowLeft className="w-5 h-5 text-gray-600" /></button>
        <h1 className="text-2xl font-bold text-azul-900">{isEdit ? 'Editar Estadía' : 'Nueva Estadía'}</h1>
      </div>

      {result && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg ${result.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {result.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {result.message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-6 space-y-5">
        {/* Client Info */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cliente *</label>
            <input required value={form.cliente} onChange={e => onChange('cliente', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="Nombre" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp</label>
            <input value={form.whatsapp} onChange={e => onChange('whatsapp', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="+507..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={form.email} onChange={e => onChange('email', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="email@..." />
          </div>
        </div>

        {/* Property */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Propiedad *</label>
            <select required value={form.propiedad} onChange={e => onChange('propiedad', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white">
              <option value="">Seleccionar...</option>
              {PROPERTIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
            <input value={form.tipo} onChange={e => onChange('tipo', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="Habitación, Apartamento..." />
          </div>
        </div>

        {/* Dates + Guests */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Check-in *</label>
            <input required type="date" value={form.check_in} onChange={e => onChange('check_in', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Check-out</label>
            <input type="date" value={form.check_out} onChange={e => onChange('check_out', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Huéspedes</label>
            <input value={form.huespedes} onChange={e => onChange('huespedes', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Habitaciones</label>
            <input value={form.habitaciones} onChange={e => onChange('habitaciones', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="1" />
          </div>
        </div>

        {/* Pricing + Commission */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Precio Cotizado</label>
            <input value={form.precio_cotizado} onChange={e => onChange('precio_cotizado', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="Por cotizar" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Precio Final $</label>
            <input type="number" step="0.01" value={form.precio_final} onChange={e => onChange('precio_final', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="0.00" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Comisión %</label>
            <input type="number" step="0.1" value={form.comision_pct} onChange={e => onChange('comision_pct', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tu Comisión</label>
            <div className="px-3 py-2 border rounded-lg font-semibold bg-purple-50 text-purple-700 border-purple-200">
              ${montoComision.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Status + Responsible */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
            <select value={form.estado} onChange={e => onChange('estado', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white">
              {STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Responsable</label>
            <input value={form.responsable} onChange={e => onChange('responsable', e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="Nombre del encargado" />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
          <textarea rows={3} value={form.notas} onChange={e => onChange('notas', e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" placeholder="Notas adicionales..." />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={() => navigate('/estadias')} className="px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="px-6 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isEdit ? 'Guardar Cambios' : 'Crear Estadía'}
          </button>
        </div>
      </form>
    </div>
  )
}
