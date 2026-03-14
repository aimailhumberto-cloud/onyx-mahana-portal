import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './components/Dashboard'
import ToursList from './components/ToursList'
import TourForm from './components/TourForm'
import EstadiasList from './components/EstadiasList'
import EstadiaForm from './components/EstadiaForm'
import AdminPanel from './components/AdminPanel'
import { ErrorBoundary } from './components/ErrorBoundary'

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="tours" element={<ToursList />} />
            <Route path="tours/nuevo" element={<TourForm />} />
            <Route path="tours/:id/editar" element={<TourForm />} />
            <Route path="estadias" element={<EstadiasList />} />
            <Route path="estadias/nuevo" element={<EstadiaForm />} />
            <Route path="estadias/:id/editar" element={<EstadiaForm />} />
            <Route path="admin" element={<AdminPanel />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App