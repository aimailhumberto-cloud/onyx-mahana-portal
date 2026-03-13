// Status colors shared across components
// Matches status values from API (Spanish)

export const STATUS_COLORS: Record<string, string> = {
  // Tours status (Spanish)
  'pagado': 'bg-green-100 text-green-700 border-green-200',
  'reservado': 'bg-turquoise-100 text-turquoise-700 border-turquoise-200',
  'consulta': 'bg-arena-100 text-arena-700 border-arena-200',
  'cerrado': 'bg-gray-100 text-gray-700 border-gray-200',
  'cancelado': 'bg-red-100 text-red-700 border-red-200',
  
  // CRM status (with emoji)
  '📥 solicitada': 'bg-gray-100 text-gray-700 border-gray-200',
  '✅ confirmada': 'bg-turquoise-100 text-turquoise-700 border-turquoise-200',
  '❌ cancelada': 'bg-red-100 text-red-700 border-red-200',
  
  // Legacy English status (fallback)
  'confirmada': 'bg-turquoise-100 text-turquoise-700 border-turquoise-200',
  'pendiente': 'bg-arena-100 text-arena-700 border-arena-200',
  'pagada': 'bg-green-100 text-green-700 border-green-200',
}

// Get status color with fallback
export function getStatusColor(status: string | undefined): string {
  if (!status) return 'bg-gray-100 text-gray-700 border-gray-200'
  const normalized = status.toLowerCase().trim()
  return STATUS_COLORS[normalized] || 'bg-gray-100 text-gray-700 border-gray-200'
}

// Activity categories for filtering
export const ACTIVITY_CATEGORIES = [
  { id: 'all', name: 'Todos' },
  { id: 'surf', name: 'Surf' },
  { id: 'tours', name: 'Tours' },
  { id: 'kite', name: 'Kite/Wing' },
  { id: 'otros', name: 'Otros' },
] as const

// Format currency
export function formatCurrency(value: number | string | undefined): string {
  if (value === undefined || value === null || value === '') return '$0'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '$0'
  return `$${num.toLocaleString()}`
}

// Format date
export function formatDate(date: string | undefined): string {
  if (!date) return 'Sin fecha'
  try {
    const d = new Date(date)
    if (isNaN(d.getTime())) return 'Sin fecha'
    return d.toLocaleDateString('es-PA', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    })
  } catch {
    return 'Sin fecha'
  }
}

// Normalize status for comparison
export function normalizeStatus(status: string | undefined): string {
  if (!status) return ''
  return status.toLowerCase().trim()
}