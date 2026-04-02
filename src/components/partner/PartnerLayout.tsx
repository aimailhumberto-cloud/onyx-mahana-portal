import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { Home, PlusCircle, List, LogOut, Menu, X, FileText, Ticket, ChevronRight } from 'lucide-react'
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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-50 to-blue-50/20">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden animate-overlayIn" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 z-50 h-full w-64 
        bg-gradient-to-b from-blue-900 via-blue-900 to-blue-950 text-white
        shadow-sidebar
        transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
      `}>
        {/* Partner branding */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <img src="/caracol-logo.png" alt="Playa Caracol" className="w-11 h-11 rounded-xl object-contain bg-white/90 p-0.5 ring-2 ring-blue-400/20 shadow-lg" onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none'
              }} />
              <img src="/mahana-logo.jpg" alt="Mahana Tours" className="w-8 h-8 rounded-lg object-contain bg-white/90 p-0.5 ring-1 ring-white/20 shadow-md" onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none'
              }} />
            </div>
            <div>
              <span className="text-base font-bold block leading-tight">Playa Caracol</span>
              <span className="text-[10px] text-blue-300/80 tracking-wider uppercase font-medium">Powered by Mahana</span>
            </div>
          </div>
          <button className="lg:hidden p-1 rounded-lg hover:bg-white/10 transition-colors" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Nav */}
        <nav className="px-3 py-4 space-y-0.5 sidebar-scroll">
          <p className="px-4 py-2 text-[9px] font-bold text-blue-400/40 uppercase tracking-[0.15em]">Portal Partner</p>
          {partnerNav.map((item) => (
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
        </nav>

        {/* User + Logout */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/[0.06] bg-blue-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20 ring-2 ring-blue-400/20">
              <span className="font-bold text-sm">🏖️</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate text-sm leading-tight">{user?.nombre || 'Partner'}</p>
              <p className="text-[10px] text-blue-300/70 font-medium">● Portal Partner</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 rounded-xl text-gray-500 hover:text-red-400 hover:bg-red-400/10 transition-all duration-200"
              title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="lg:ml-64">
        <header className="sticky top-0 z-30 glass border-b border-gray-200/50 px-4 lg:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button className="lg:hidden p-2 rounded-xl hover:bg-gray-100 transition-colors" onClick={() => setSidebarOpen(true)}>
              <Menu className="w-5 h-5 text-gray-600" />
            </button>
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
              <h1 className="text-sm font-semibold text-blue-900">Portal de Reservas</h1>
            </div>
          </div>
          <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200/50 px-2.5 py-1 rounded-lg uppercase tracking-wider">Partner</span>
        </header>

        <main className="p-4 lg:p-6 animate-fadeIn">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
