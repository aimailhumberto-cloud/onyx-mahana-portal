import { Outlet, NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { 
  Home, 
  Calendar, 
  Building2, 
  CalendarDays,
  Package,
  Settings, 
  Menu,
  X,
  LogOut,
  Clock,
  Bell,
  Users
} from 'lucide-react'
import { useState } from 'react'

const navigation = [
  { name: 'Inicio', href: '/', icon: Home },
  { name: 'Tours', href: '/tours', icon: Calendar },
  { name: 'Estadías', href: '/estadias', icon: Building2 },
  { name: 'Calendario', href: '/calendario', icon: CalendarDays },
  { name: 'Productos', href: '/productos', icon: Package, adminOnly: true },
  { name: 'Disponibilidad', href: '/disponibilidad', icon: Clock, adminOnly: true },
  { name: 'Notificaciones', href: '/notificaciones', icon: Bell, adminOnly: true },
  { name: 'Usuarios', href: '/usuarios', icon: Users, adminOnly: true },
  { name: 'Admin', href: '/admin', icon: Settings, adminOnly: true },
]

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user, logout } = useAuth()

  const isAdmin = user?.rol === 'admin'
  const visibleNav = navigation.filter(n => !n.adminOnly || isAdmin)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 z-50 h-full w-64 bg-azul-900 text-white
        transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
      `}>
        {/* Logo */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <img src="/mahana-logo.jpg" alt="Mahana Tours" className="w-10 h-10 rounded-lg object-cover" />
            <span className="text-xl font-bold">Mahana</span>
          </div>
          <button className="lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="px-3 py-4 space-y-1">
          {visibleNav.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              end={item.href === '/'}
              className={({ isActive }) => `
                flex items-center gap-3 px-4 py-3 rounded-lg transition-colors
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
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-turquoise-500 to-turquoise-700 flex items-center justify-center">
              <span className="font-bold text-sm">{user?.nombre?.charAt(0) || 'M'}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate text-sm">{user?.nombre || 'Mahana Tours'}</p>
              <p className="text-xs text-gray-400">{user?.rol === 'admin' ? 'Administrador' : user?.rol === 'vendedor' ? 'Vendedor' : 'Partner'}</p>
            </div>
            <button 
              onClick={logout}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:ml-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <button 
            className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-6 h-6 text-gray-600" />
          </button>
          
          <h1 className="text-lg font-semibold text-azul-900">Portal de Reservas</h1>
          
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">Admin</span>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}