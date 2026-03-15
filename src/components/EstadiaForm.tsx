import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { createEstadia, getEstadiaById, updateEstadia, getPropiedades } from '../api/api'
import type { Propiedad } from '../api/api'

const STATES = ['Solicitada', 'Cotizada', 'Confirmada', 'Pagada', 'Perdida']

export default function EstadiaForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id

  const [form, setForm] = useState({
    cliente: '', whatsapp: '', email: '', propiedad: '', tipo: '',
    check_in: '', check_out: '', huespedes: '', habitaciones: '',
    precio_cotizado: '', precio_final: '', base_caracol: '', impuesto: '',
    cleaning_fee: '', comision_pct: '20',
    estado: 'Solicitada', responsable: '', notas: '', fuente: 'manual'
  })
  const [propiedades, setPropiedades] = useState<Propiedad[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(isEdit)
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    getPropiedades().then(r => { if (r.success) setPropiedades(r.data.filter(p => p.activa)) })
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
            base_caracol: e.base_caracol?.toString() || '', impuesto: e.impuesto?.toString() || '',
            cleaning_fee: e.cleaning_fee?.toString() || '',
            comision_pct: e.comision_pct?.toString() || '20', estado: e.estado || 'Solicitada',
            responsable: e.responsable || '', notas: e.notas || '', fuente: e.fuente || 'manual'
          })
        }
        setLoading(false)
      })
    }
  }, [id])

  // Get tax rate from catalog or fallback to 0
  const selectedProp = propiedades.find(p => p.nombre === form.propiedad)
  const taxPct = selectedProp?.impuesto_pct ?? 0

  // Financial calculations
  const precioCliente = parseFloat(form.precio_final) || 0
  const baseCaracol = parseFloat(form.base_caracol) || 0
  const impuestoAuto = baseCaracol * (taxPct / 100)
  const impuesto = form.impuesto !== '' ? (parseFloat(form.impuesto) || 0) : impuestoAuto
  const cleaningFee = parseFloat(form.cleaning_fee) || 0
  const ganancia = precioCliente - baseCaracol - impuesto - cleaningFee
  const comisionPct = precioCliente > 0 ? Math.round((ganancia / precioCliente) * 100) : 0

  // Auto-fill from catalog when property changes
  const handlePropertyChange = (prop: string) => {
    const catalog = propiedades.find(p => p.nombre === prop)
    const base = parseFloat(form.base_caracol) || 0
    const newTax = catalog?.impuesto_pct ?? 0
    setForm(prev => ({
      ...prev,
      propiedad: prop,
      impuesto: base > 0 ? (base * newTax / 100).toFixed(2) : prev.impuesto,
      cleaning_fee: catalog?.cleaning_fee != null && catalog.cleaning_fee > 0
        ? catalog.cleaning_fee.toString() : prev.cleaning_fee,
    }))
  }

  // Auto-recalc impuesto when base changes
  const handleBaseChange = (val: string) => {
    const base = parseFloat(val) || 0
    if (base > 0 && form.propiedad) {
      setForm(prev => ({ ...prev, base_caracol: val, impuesto: (base * taxPct / 100).toFixed(2) }))
    } else {
      onChange('base_caracol', val)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setResult(null)
    const data: any = {
      ...form,
      precio_final: precioCliente || undefined,
      base_caracol: baseCaracol || undefined,
      impuesto: impuesto || undefined,
      cleaning_fee: cleaningFee || undefined,
      comision_pct: comisionPct,
      monto_comision: ganancia > 0 ? ganancia : undefined
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
            <select required value={form.propiedad} onChange={e => handlePropertyChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white">
              <option value="">Seleccionar...</option>
              {propiedades.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
              <option value="Otro">Otro</option>
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

        {/* Financial Breakdown */}
        <div className="border-t border-gray-200 pt-4">
          <h3 className="text-sm font-semibold text-azul-900 mb-3">💰 Desglose Financiero</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Precio Cotizado</label>
              <input value={form.precio_cotizado} onChange={e => onChange('precio_cotizado', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="Por cotizar" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Precio al Cliente $</label>
              <input type="number" step="0.01" value={form.precio_final} onChange={e => onChange('precio_final', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Base Pagada $</label>
              <input type="number" step="0.01" value={form.base_caracol} onChange={e => handleBaseChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="0.00" />
              <p className="text-[10px] text-gray-400 mt-0.5">Lo pagado a la propiedad</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Impuesto $ <span className="text-[10px] text-gray-400">({taxPct}%)</span>
              </label>
              <input type="number" step="0.01" value={form.impuesto} onChange={e => onChange('impuesto', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="0.00" />
              {form.propiedad && <p className="text-[10px] text-gray-400 mt-0.5">{form.propiedad}: {taxPct}%</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cleaning Fee $</label>
              <input type="number" step="0.01" value={form.cleaning_fee} onChange={e => onChange('cleaning_fee', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="0.00" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Tu Ganancia</label>
              <div className={`px-3 py-2 border rounded-lg font-bold text-lg ${ganancia >= 0 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                ${ganancia.toFixed(2)}
                {comisionPct > 0 && <span className="text-xs font-normal ml-2">({comisionPct}% del precio)</span>}
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">= Precio - Base - Impuesto - Cleaning</p>
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
