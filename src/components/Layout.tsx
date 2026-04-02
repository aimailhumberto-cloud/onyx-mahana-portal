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
  Users,
  DollarSign,
  Ticket,
  Star,
  ChevronRight
} from 'lucide-react'
import { useState } from 'react'

const navigation = [
  { name: 'Inicio', href: '/', icon: Home },
  { name: 'Tours', href: '/tours', icon: Calendar },
  { name: 'Estadías', href: '/estadias', icon: Building2 },
  { name: 'Calendario', href: '/calendario', icon: CalendarDays },
  { name: 'Facturación', href: '/facturacion', icon: DollarSign, adminOnly: true },
  { name: 'Tickets', href: '/tickets', icon: Ticket, adminOnly: true },
  { name: 'Satisfacción', href: '/satisfaccion', icon: Star, adminOnly: true },
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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-50 to-turquoise-50/20">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden animate-overlayIn"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 z-50 h-full w-64 
        bg-gradient-to-b from-azul-900 via-azul-900 to-azul-950 text-white
        shadow-sidebar
        transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
      `}>
        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="relative">
              <img src="/mahana-logo.jpg" alt="Mahana Tours" className="w-11 h-11 rounded-xl object-cover ring-2 ring-turquoise-400/30 shadow-lg" />
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-azul-900"></div>
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight block leading-tight">Mahana</span>
              <span className="text-[10px] text-turquoise-400/80 font-medium tracking-wider uppercase">Tours · Panamá</span>
            </div>
          </div>
          <button className="lg:hidden p-1 rounded-lg hover:bg-white/10 transition-colors" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="px-3 py-4 space-y-0.5 sidebar-scroll overflow-y-auto max-h-[calc(100vh-170px)]">
          <p className="px-4 py-2 text-[9px] font-bold text-gray-500 uppercase tracking-[0.15em]">Navegación</p>
          {visibleNav.slice(0, 4).map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              end={item.href === '/'}
              className={({ isActive }) => `
                flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 group
                ${isActive 
                  ? 'bg-gradient-to-r from-turquoise-600 to-turquoise-500 text-white shadow-lg shadow-turquoise-600/25' 
                  : 'text-gray-400 hover:bg-white/[0.06] hover:text-white'
                }
              `}
              onClick={() => setSidebarOpen(false)}
            >
              <item.icon className="w-[18px] h-[18px]" />
              <span className="font-medium text-sm">{item.name}</span>
              <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-0 group-hover:opacity-50 transition-opacity" />
            </NavLink>
          ))}

          {isAdmin && (
            <>
              <p className="px-4 pt-4 pb-2 text-[9px] font-bold text-gray-500 uppercase tracking-[0.15em]">Administración</p>
              {visibleNav.slice(4).map((item) => (
                <NavLink
                  key={item.name}
                  to={item.href}
                  className={({ isActive }) => `
                    flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 group
                    ${isActive 
                      ? 'bg-gradient-to-r from-turquoise-600 to-turquoise-500 text-white shadow-lg shadow-turquoise-600/25' 
                      : 'text-gray-400 hover:bg-white/[0.06] hover:text-white'
                    }
                  `}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon className="w-[18px] h-[18px]" />
                  <span className="font-medium text-sm">{item.name}</span>
                  <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-0 group-hover:opacity-50 transition-opacity" />
                </NavLink>
              ))}
            </>
          )}
        </nav>

        {/* User + Logout */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/[0.06] bg-azul-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-turquoise-400 to-turquoise-600 flex items-center justify-center shadow-lg shadow-turquoise-500/20 ring-2 ring-turquoise-400/20">
              <span className="font-bold text-sm">{user?.nombre?.charAt(0) || 'M'}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate text-sm leading-tight">{user?.nombre || 'Mahana Tours'}</p>
              <p className="text-[10px] text-turquoise-400/70 font-medium">
                {user?.rol === 'admin' ? '● Administrador' : user?.rol === 'vendedor' ? '● Vendedor' : '● Partner'}
              </p>
            </div>
            <button 
              onClick={logout}
              className="p-2 rounded-xl text-gray-500 hover:text-red-400 hover:bg-red-400/10 transition-all duration-200"
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
        <header className="sticky top-0 z-30 glass border-b border-gray-200/50 px-4 lg:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              className="lg:hidden p-2 rounded-xl hover:bg-gray-100 transition-colors"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5 text-gray-600" />
            </button>
            
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-turquoise-500 animate-pulse"></div>
              <h1 className="text-sm font-semibold text-azul-800">Portal de Reservas</h1>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-[10px] font-semibold text-turquoise-700 bg-turquoise-50 border border-turquoise-200/50 px-2.5 py-1 rounded-lg uppercase tracking-wider">
              {user?.rol === 'admin' ? 'Admin' : 'Vendedor'}
            </span>
            <div className="sm:hidden">
              <img src="/mahana-logo.jpg" alt="Mahana" className="w-8 h-8 rounded-lg object-cover ring-1 ring-gray-200" />
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6 animate-fadeIn">
          <Outlet />
        </main>
      </div>
    </div>
  )
}