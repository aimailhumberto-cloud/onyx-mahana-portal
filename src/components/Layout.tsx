import { Outlet, NavLink } from 'react-router-dom'
import { 
  Home, 
  Calendar, 
  Building2, 
  Settings, 
  Menu,
  Anchor
} from 'lucide-react'
import { useState } from 'react'

const navigation = [
  { name: 'Inicio', href: '/', icon: Home },
  { name: 'Tours Mahana', href: '/tours', icon: Calendar },
  { name: 'CRM Habitaciones', href: '/crm', icon: Building2 },
  { name: 'Administración', href: '/admin', icon: Settings },
]

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
        <div className="flex items-center gap-3 px-6 py-5 border-b border-white/10">
          <Anchor className="w-8 h-8 text-turquoise-500" />
          <span className="text-xl font-bold">Mahana Tours</span>
        </div>

        {/* Navigation */}
        <nav className="px-3 py-4 space-y-1">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              className={({ isActive }) => `
                flex items-center gap-3 px-4 py-3 rounded-lg transition-colors
                ${isActive 
                  ? 'bg-turquoise-600 text-white' 
                  : 'text-gray-300 hover:bg-white/10 hover:text-white'
                }
              `}
              onClick={() => setSidebarOpen(false)}
            >
              <item.icon className="w-5 h-5" />
              <span>{item.name}</span>
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-turquoise-600 flex items-center justify-center">
              <span className="font-semibold">HB</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">Admin</p>
              <p className="text-sm text-gray-400 truncate">admin@mahana.com</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:ml-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <button 
            className="lg:hidden p-2 rounded-lg hover:bg-gray-100"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-6 h-6 text-gray-600" />
          </button>
          
          <h1 className="text-lg font-semibold text-azul-900">Portal de Reservas</h1>
          
          <div className="w-10" /> {/* Spacer */}
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}