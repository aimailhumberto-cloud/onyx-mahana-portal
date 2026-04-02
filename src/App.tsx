import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import Dashboard from './components/Dashboard'
import ToursList from './components/ToursList'
import TourForm from './components/TourForm'
import EstadiasList from './components/EstadiasList'
import EstadiaForm from './components/EstadiaForm'
import CalendarView from './components/CalendarView'
import Productos from './components/Productos'
import AdminPanel from './components/AdminPanel'
import LoginPage from './components/LoginPage'
import PartnerLayout from './components/partner/PartnerLayout'
import PartnerDashboard from './components/partner/PartnerDashboard'
import PartnerTourRequest from './components/partner/PartnerTourRequest'
import PartnerReservations from './components/partner/PartnerReservations'
import PartnerFacturacion from './components/partner/PartnerFacturacion'
import DisponibilidadAdmin from './components/DisponibilidadAdmin'
import NotificacionesConfig from './components/NotificacionesConfig'
import UsuariosAdmin from './components/UsuariosAdmin'
import Facturacion from './components/Facturacion'
import BookingPage from './components/BookingPage'
import TicketsServicio from './components/TicketsServicio'
import SatisfaccionDashboard from './components/SatisfaccionDashboard'
import PartnerTickets from './components/partner/PartnerTickets'
import ReviewPage from './components/ReviewPage'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'
import { Loader2 } from 'lucide-react'

function AppRoutes() {
  const { user, loading, isAdmin, isPartner } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-azul-900 via-azul-800 to-turquoise-900">
        <div className="text-center animate-fadeIn">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-turquoise-400 to-turquoise-600 flex items-center justify-center mx-auto mb-4 shadow-glow-turquoise animate-float">
            <img src="/mahana-logo.jpg" alt="" className="w-12 h-12 rounded-xl object-cover" onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none'
            }} />
          </div>
          <Loader2 className="w-5 h-5 animate-spin text-turquoise-400 mx-auto mb-2" />
          <p className="text-turquoise-300/70 text-sm font-medium">Cargando portal...</p>
        </div>
      </div>
    )
  }

  // Not authenticated → show login + public booking routes
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/booking/:slug" element={<BookingPage />} />
        <Route path="/resena/:codigo" element={<ReviewPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  // Partner routes
  if (isPartner) {
    return (
      <Routes>
        <Route path="/" element={<PartnerLayout />}>
          <Route index element={<PartnerDashboard />} />
          <Route path="solicitar" element={<PartnerTourRequest />} />
          <Route path="reservas" element={<PartnerReservations />} />
          <Route path="facturas" element={<PartnerFacturacion />} />
          <Route path="calidad" element={<PartnerTickets />} />
        </Route>
        <Route path="/resena/:codigo" element={<ReviewPage />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    )
  }

  // Admin + vendedor routes (vendedor has restricted access)
  const AdminOnly = ({ children }: { children: React.ReactNode }) => {
    if (!isAdmin) return <Navigate to="/" replace />
    return <>{children}</>
  }

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="tours" element={<ToursList />} />
        <Route path="tours/nuevo" element={<TourForm />} />
        <Route path="tours/:id/editar" element={<TourForm />} />
        <Route path="estadias" element={<EstadiasList />} />
        <Route path="estadias/nuevo" element={<EstadiaForm />} />
        <Route path="estadias/:id/editar" element={<EstadiaForm />} />
        <Route path="calendario" element={<CalendarView />} />
        <Route path="productos" element={<AdminOnly><Productos /></AdminOnly>} />
        <Route path="disponibilidad" element={<AdminOnly><DisponibilidadAdmin /></AdminOnly>} />
        <Route path="notificaciones" element={<AdminOnly><NotificacionesConfig /></AdminOnly>} />
        <Route path="usuarios" element={<AdminOnly><UsuariosAdmin /></AdminOnly>} />
        <Route path="facturacion" element={<AdminOnly><Facturacion /></AdminOnly>} />
        <Route path="tickets" element={<AdminOnly><TicketsServicio /></AdminOnly>} />
        <Route path="satisfaccion" element={<AdminOnly><SatisfaccionDashboard /></AdminOnly>} />
        <Route path="admin" element={<AdminOnly><AdminPanel /></AdminOnly>} />
      </Route>
      <Route path="/booking/:slug" element={<BookingPage />} />
      <Route path="/resena/:codigo" element={<ReviewPage />} />
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <AppRoutes />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App