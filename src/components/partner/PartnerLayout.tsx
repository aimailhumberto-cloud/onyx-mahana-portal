import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { Home, PlusCircle, List, LogOut, Menu, X, FileText, Ticket } from 'lucide-react'
import { useState } from 'react'

const partnerNav = [
  { name: 'Inicio', href: '/', icon: Home },
  { name: 'Solicitar Tour', href: '/solicitar', icon: PlusCircle },
  { name: 'Mis Reservas', href: '/reservas', icon: List },
  { name: 'Mis Facturas', href: '/facturas', icon: FileText },
  { name: 'Calidad', href: '/calidad', icon: Ticket },
]

export default function PartnerLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 z-50 h-full w-64 bg-gradient-to-b from-blue-900 to-blue-950 text-white
        transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
      `}>
        {/* Partner branding */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <img src="/caracol-logo.png" alt="Playa Caracol" className="w-12 h-12 rounded-lg object-contain bg-white p-0.5 border border-white/20 shadow-sm" onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none'
              }} />
              <img src="/mahana-logo.jpg" alt="Mahana Tours" className="w-9 h-9 rounded-lg object-contain bg-white p-0.5 border border-white/20 shadow-sm" onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none'
              }} />
            </div>
            <div>
              <span className="text-lg font-bold block leading-tight">Playa Caracol</span>
              <span className="text-[10px] text-blue-300 tracking-wider uppercase">Powered by Mahana</span>
            </div>
          </div>
          <button className="lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Nav */}
        <nav className="px-3 py-4 space-y-1">
          {partnerNav.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              end={item.href === '/'}
              className={({ isActive }) => `
                flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200
                ${isActive
                  ? 'bg-turquoise-600 text-white shadow-lg shadow-turquoise-600/30'
                  : 'text-gray-300 hover:bg-white/10 hover:text-white'
                }
              `}
              onClick={() => setSidebarOpen(false)}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.name}</span>
            </NavLink>
          ))}
        </nav>

        {/* User + Logout */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
              <span className="font-bold text-sm">🏖️</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate text-sm">{user?.nombre || 'Partner'}</p>
              <p className="text-xs text-blue-300">Portal Partner</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="lg:ml-64">
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <button className="lg:hidden p-2 rounded-lg hover:bg-gray-100" onClick={() => setSidebarOpen(true)}>
            <Menu className="w-6 h-6 text-gray-600" />
          </button>
          <h1 className="text-lg font-semibold text-blue-900">Portal de Reservas</h1>
          <span className="text-xs text-blue-500 bg-blue-50 px-2 py-1 rounded-full">Partner</span>
        </header>

        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
