export type ReservationStatus = 'Pagado' | 'Reservado' | 'Consulta' | 'Cerrado'

export interface Reservation {
  id: string
  clientName: string
  date: string
  time: string
  responsible: string
  seller: string
  activity: string
  price: number
  cost: number
  commission: number
  status: ReservationStatus
  notes?: string
  managedBy?: string
  createdAt: string
}

export interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'manager' | 'viewer'
  avatar?: string
}

export interface Category {
  id: string
  name: string
  type: 'tour' | 'crm'
}

export interface KPI {
  label: string
  value: number | string
  change?: number
  trend?: 'up' | 'down' | 'neutral'
}

export interface Partner {
  id: string
  name: string
  type: 'hotel' | 'tour' | 'restaurant'
  commission: number
}