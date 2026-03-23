import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { login as apiLogin, getMe } from '../api/api'

export interface User {
  id: number
  email: string
  nombre: string
  rol: 'admin' | 'partner' | 'vendedor'
  vendedor: string | null
}

interface AuthContextType {
  user: User | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => void
  isAdmin: boolean
  isPartner: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('mahana_token'))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (token) {
      getMe(token)
        .then(res => {
          if (res.success) {
            setUser(res.data as User)
          } else {
            localStorage.removeItem('mahana_token')
            setToken(null)
          }
        })
        .catch(() => {
          localStorage.removeItem('mahana_token')
          setToken(null)
        })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [token])

  const loginFn = async (email: string, password: string) => {
    try {
      const res = await apiLogin(email, password)
      if (res.success && res.data) {
        const { token: newToken, user: userData } = res.data
        localStorage.setItem('mahana_token', newToken)
        setToken(newToken)
        setUser(userData as User)
        return { success: true }
      }
      return { success: false, error: res.error?.message || 'Error de autenticación' }
    } catch {
      return { success: false, error: 'Error de conexión' }
    }
  }

  const logout = () => {
    localStorage.removeItem('mahana_token')
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{
      user,
      token,
      loading,
      login: loginFn,
      logout,
      isAdmin: user?.rol === 'admin',
      isPartner: user?.rol === 'partner' || (user?.rol === 'vendedor' && !!user?.vendedor),
    }}>
      {children}
    </AuthContext.Provider>
  )
}
