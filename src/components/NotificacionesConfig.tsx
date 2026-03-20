import { useState, useEffect } from 'react'
import { Save, Loader2, CheckCircle, AlertCircle, Mail, MessageCircle, Send, Bell, Shield } from 'lucide-react'
import { getNotificationConfig, updateNotificationConfig } from '../api/api'

interface ConfigItem {
  valor: string
  descripcion: string
}

const SECTIONS = [
  {
    title: '📧 Email',
    icon: Mail,
    color: 'blue',
    fields: [
      { key: 'email_enabled', label: 'Emails habilitados', type: 'toggle' },
      { key: 'email_cc_default', label: 'CC automático', placeholder: 'ventas@toursmahana.com', hint: 'Se agrega como CC en cada email al cliente' },
      { key: 'email_team', label: 'Emails del equipo', placeholder: 'correo1@..., correo2@...', hint: 'Reciben el resumen diario (separar con coma)' },
      { key: 'email_caracol', label: 'Email Caracol', placeholder: 'reservas@playacaracol.com', hint: 'Recibe copia en estadías de sus propiedades' },
    ]
  },
  {
    title: '💬 WhatsApp',
    icon: MessageCircle,
    color: 'green',
    fields: [
      { key: 'whatsapp_enabled', label: 'WhatsApp habilitado', type: 'toggle' },
      { key: 'whatsapp_notify', label: 'Número equipo', placeholder: '50762906800', hint: 'Recibe alertas de nuevos tours/estadías' },
      { key: 'whatsapp_caracol', label: 'Número Caracol', placeholder: '50712345678', hint: 'Opcional — notificar a Caracol' },
    ]
  },
  {
    title: '🤖 Telegram',
    icon: Send,
    color: 'purple',
    fields: [
      { key: 'telegram_enabled', label: 'Telegram habilitado', type: 'toggle' },
      { key: 'telegram_chat_id', label: 'Chat ID', placeholder: '-5172175685', hint: 'ID del grupo o chat personal' },
    ]
  },
  {
    title: '📋 Contenido',
    icon: Shield,
    color: 'amber',
    fields: [
      { key: 'politica_cancelacion', label: 'Política de cancelación', type: 'textarea', placeholder: 'Las cancelaciones deben realizarse...', hint: 'Se incluye en emails de confirmación al cliente' },
    ]
  },
]

export default function NotificacionesConfig() {
  const [config, setConfig] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    setLoading(true)
    const res = await getNotificationConfig()
    if (res.success && res.data) {
      const flat: Record<string, string> = {}
      Object.entries(res.data).forEach(([key, item]) => {
        flat[key] = (item as ConfigItem).valor
      })
      setConfig(flat)
    }
    setLoading(false)
  }

  const handleChange = (key: string, value: string) => {
    setConfig(prev => ({ ...prev, [key]: value }))
    setDirty(true)
    setResult(null)
  }

  const handleToggle = (key: string) => {
    const current = config[key]
    handleChange(key, current === 'true' ? 'false' : 'true')
  }

  const handleSave = async () => {
    setSaving(true)
    setResult(null)
    try {
      const res = await updateNotificationConfig(config)
      if (res.success) {
        setResult({ type: 'success', message: 'Configuración guardada ✅' })
        setDirty(false)
      } else {
        setResult({ type: 'error', message: res.error?.message || 'Error al guardar' })
      }
    } catch {
      setResult({ type: 'error', message: 'Error de conexión' })
    }
    setSaving(false)
  }

  if (loading) return <div className="flex items-center justify-center h-40"><Loader2 className="w-8 h-8 animate-spin text-turquoise-600" /></div>

  const colorMap: Record<string, string> = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    purple: 'from-purple-500 to-purple-600',
    amber: 'from-amber-500 to-amber-600',
  }

  const borderMap: Record<string, string> = {
    blue: 'border-blue-200',
    green: 'border-green-200',
    purple: 'border-purple-200',
    amber: 'border-amber-200',
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-turquoise-500 to-turquoise-600 flex items-center justify-center shadow-md">
            <Bell className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-azul-900">Configuración de Notificaciones</h1>
            <p className="text-xs text-gray-400">Destinatarios, canales y contenido</p>
          </div>
        </div>
        <button onClick={handleSave} disabled={saving || !dirty}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all ${
            dirty ? 'bg-turquoise-600 text-white hover:bg-turquoise-700 shadow-md hover:shadow-lg' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar
        </button>
      </div>

      {result && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${
          result.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {result.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {result.message}
        </div>
      )}

      {/* Sections */}
      {SECTIONS.map(section => (
        <div key={section.title} className={`bg-white rounded-2xl shadow-sm border ${borderMap[section.color]} overflow-hidden`}>
          <div className={`bg-gradient-to-r ${colorMap[section.color]} px-5 py-3 flex items-center gap-2`}>
            <section.icon className="w-4 h-4 text-white" />
            <h2 className="text-white font-semibold text-sm">{section.title}</h2>
          </div>
          <div className="p-5 space-y-4">
            {section.fields.map(field => (
              <div key={field.key}>
                {field.type === 'toggle' ? (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">{field.label}</span>
                    <button onClick={() => handleToggle(field.key)}
                      className={`relative w-11 h-6 rounded-full transition-colors ${
                        config[field.key] === 'true' ? 'bg-turquoise-500' : 'bg-gray-300'
                      }`}>
                      <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                        config[field.key] === 'true' ? 'translate-x-5.5' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                ) : field.type === 'textarea' ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
                    <textarea rows={3} value={config[field.key] || ''} onChange={e => handleChange(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-turquoise-500 text-sm resize-none" />
                    {field.hint && <p className="text-[10px] text-gray-400 mt-1">{field.hint}</p>}
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
                    <input value={config[field.key] || ''} onChange={e => handleChange(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-turquoise-500 text-sm" />
                    {field.hint && <p className="text-[10px] text-gray-400 mt-1">{field.hint}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
