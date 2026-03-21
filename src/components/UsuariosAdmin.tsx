import { useState, useEffect } from 'react'
import { Users, Plus, Edit2, Trash2, Save, X, Loader2, CheckCircle, AlertCircle, ToggleLeft, ToggleRight, Shield, Building2 } from 'lucide-react'
import { getUsuarios, createUsuario, updateUsuario, toggleUsuario, deleteUsuario } from '../api/api'
import type { Usuario } from '../api/api'

interface UserForm {
  email: string
  password: string
  nombre: string
  rol: 'admin' | 'partner' | 'vendedor'
  vendedor: string
}

const emptyForm: UserForm = { email: '', password: '', nombre: '', rol: 'partner', vendedor: '' }

export default function UsuariosAdmin() {
  const [users, setUsers] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<UserForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => { loadUsers() }, [])

  const loadUsers = async () => {
    setLoading(true)
    const res = await getUsuarios()
    if (res.success && Array.isArray(res.data)) setUsers(res.data)
    setLoading(false)
  }

  const handleNew = () => {
    setForm(emptyForm)
    setEditingId(null)
    setShowForm(true)
    setResult(null)
  }

  const handleEdit = (user: Usuario) => {
    setForm({ email: user.email, password: '', nombre: user.nombre, rol: user.rol, vendedor: user.vendedor || '' })
    setEditingId(user.id)
    setShowForm(true)
    setResult(null)
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  const handleSave = async () => {
    setSaving(true)
    setResult(null)
    try {
      if (editingId) {
        const data: any = { email: form.email, nombre: form.nombre, rol: form.rol, vendedor: form.vendedor || undefined }
        if (form.password) data.password = form.password
        const res = await updateUsuario(editingId, data)
        if (res.success) {
          setResult({ type: 'success', message: 'Usuario actualizado ✅' })
          handleCancel()
          loadUsers()
        } else {
          setResult({ type: 'error', message: res.error?.message || 'Error al actualizar' })
        }
      } else {
        if (!form.password) {
          setResult({ type: 'error', message: 'La contraseña es requerida para nuevos usuarios' })
          setSaving(false)
          return
        }
        const res = await createUsuario({ ...form, vendedor: form.vendedor || undefined })
        if (res.success) {
          setResult({ type: 'success', message: 'Usuario creado ✅' })
          handleCancel()
          loadUsers()
        } else {
          setResult({ type: 'error', message: res.error?.message || 'Error al crear' })
        }
      }
    } catch {
      setResult({ type: 'error', message: 'Error de conexión' })
    }
    setSaving(false)
  }

  const handleToggle = async (id: number) => {
    const res = await toggleUsuario(id)
    if (res.success) loadUsers()
  }

  const handleDelete = async (user: Usuario) => {
    if (!confirm(`¿Eliminar a ${user.nombre} (${user.email})?`)) return
    const res = await deleteUsuario(user.id)
    if (res.success) {
      loadUsers()
      setResult({ type: 'success', message: `${user.nombre} eliminado` })
    } else {
      setResult({ type: 'error', message: res.error?.message || 'Error al eliminar' })
    }
  }

  if (loading) return <div className="flex items-center justify-center h-40"><Loader2 className="w-8 h-8 animate-spin text-turquoise-600" /></div>

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-azul-800 to-azul-900 flex items-center justify-center shadow-md">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-azul-900">Gestión de Usuarios</h1>
            <p className="text-xs text-gray-400">{users.length} usuarios registrados</p>
          </div>
        </div>
        <button onClick={handleNew}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm bg-turquoise-600 text-white hover:bg-turquoise-700 shadow-md transition-all">
          <Plus className="w-4 h-4" /> Nuevo Usuario
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

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-2xl shadow-md border border-turquoise-200 p-5">
          <h2 className="font-semibold text-azul-900 mb-4">{editingId ? 'Editar Usuario' : 'Nuevo Usuario'}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
              <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })}
                placeholder="Nombre completo" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-turquoise-500 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="correo@ejemplo.com" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-turquoise-500 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contraseña {editingId && <span className="text-gray-400 font-normal">(dejar vacío para no cambiar)</span>}
              </label>
              <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                placeholder={editingId ? '••••••••' : 'Mínimo 6 caracteres'} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-turquoise-500 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
              <select value={form.rol} onChange={e => setForm({ ...form, rol: e.target.value as 'admin' | 'partner' | 'vendedor' })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-turquoise-500 text-sm">
                <option value="admin">Administrador (Mahana)</option>
                <option value="vendedor">Vendedor (Mahana)</option>
                <option value="partner">Partner (Caracol / Hotel)</option>
              </select>
            </div>
            {form.rol === 'partner' && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Vendedor / Empresa</label>
                <input value={form.vendedor} onChange={e => setForm({ ...form, vendedor: e.target.value })}
                  placeholder="Ej: Playa Caracol, Radisson, ..." className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-turquoise-500 text-sm" />
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={handleCancel} className="flex items-center gap-1 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
              <X className="w-4 h-4" /> Cancelar
            </button>
            <button onClick={handleSave} disabled={saving || !form.email || !form.nombre}
              className="flex items-center gap-1 px-5 py-2 text-sm bg-turquoise-600 text-white rounded-lg hover:bg-turquoise-700 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editingId ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gradient-to-r from-azul-900 to-azul-800 text-white text-left">
              <th className="px-5 py-3 font-medium">Usuario</th>
              <th className="px-5 py-3 font-medium">Email</th>
              <th className="px-5 py-3 font-medium">Rol</th>
              <th className="px-5 py-3 font-medium">Vendedor</th>
              <th className="px-5 py-3 font-medium text-center">Estado</th>
              <th className="px-5 py-3 font-medium text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${!user.activo ? 'opacity-50' : ''}`}>
                <td className="px-5 py-3 font-medium text-azul-900">{user.nombre}</td>
                <td className="px-5 py-3 text-gray-600">{user.email}</td>
                <td className="px-5 py-3">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                    user.rol === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-turquoise-100 text-turquoise-700'
                  }`}>
                    {user.rol === 'admin' ? <Shield className="w-3 h-3" /> : <Building2 className="w-3 h-3" />}
                    {user.rol === 'admin' ? 'Admin' : 'Partner'}
                  </span>
                </td>
                <td className="px-5 py-3 text-gray-600">{user.vendedor || '—'}</td>
                <td className="px-5 py-3 text-center">
                  <button onClick={() => handleToggle(user.id)} title={user.activo ? 'Desactivar' : 'Activar'}
                    className="hover:scale-110 transition-transform">
                    {user.activo ? <ToggleRight className="w-6 h-6 text-green-500" /> : <ToggleLeft className="w-6 h-6 text-gray-400" />}
                  </button>
                </td>
                <td className="px-5 py-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={() => handleEdit(user)} className="p-1.5 hover:bg-turquoise-50 rounded-lg text-turquoise-600" title="Editar">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(user)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500" title="Eliminar">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
