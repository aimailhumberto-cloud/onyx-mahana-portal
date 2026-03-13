import axios from 'axios'

const API_URL = import.meta.env.VITE_GOOGLE_SCRIPT_URL || ''

export async function fetchReservations(): Promise<any[]> {
  if (!API_URL) {
    console.warn('API_URL not configured')
    return []
  }
  
  try {
    const response = await axios.get(API_URL, {
      params: { action: 'getReservations' }
    })
    return response.data
  } catch (error) {
    console.error('Error fetching reservations:', error)
    return []
  }
}

export async function createReservation(reservation: any): Promise<boolean> {
  if (!API_URL) {
    console.warn('API_URL not configured')
    return false
  }
  
  try {
    await axios.post(API_URL, { action: 'createReservation', data: reservation })
    return true
  } catch (error) {
    console.error('Error creating reservation:', error)
    return false
  }
}

export async function updateReservation(id: string, updates: any): Promise<boolean> {
  if (!API_URL) {
    console.warn('API_URL not configured')
    return false
  }
  
  try {
    await axios.post(API_URL, { action: 'updateReservation', id, updates })
    return true
  } catch (error) {
    console.error('Error updating reservation:', error)
    return false
  }
}