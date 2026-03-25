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
import { ErrorBoundary } from './components/ErrorBoundary'
import { Loader2 } from 'lucide-react'

function AppRoutes() {
  const { user, loading, isAdmin, isPartner } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-turquoise-600 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Cargando...</p>
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
        </Route>
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
        <Route path="admin" element={<AdminOnly><AdminPanel /></AdminOnly>} />
      </Route>
      <Route path="/booking/:slug" element={<BookingPage />} />
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
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App