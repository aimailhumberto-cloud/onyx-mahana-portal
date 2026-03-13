import { useState, useCallback } from 'react'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface UseApiResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  execute: (options?: {
    method?: HttpMethod
    body?: Record<string, unknown>
    params?: Record<string, string | number>
  }) => Promise<void>
}

export function useApi<T>(url: string): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const execute = useCallback(async (options: {
    method?: HttpMethod
    body?: Record<string, unknown>
    params?: Record<string, string | number>
  } = {}) => {
    const { method = 'GET', body, params } = options
    setLoading(true)
    setError(null)

    try {
      const searchParams = params ? new URLSearchParams(params as Record<string, string>) : null
      const urlWithParams = searchParams ? `${url}?${searchParams.toString()}` : url

      const response = await fetch(urlWithParams, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        ...(body && { body: JSON.stringify(body) }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()
      setData(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [url])

  return { data, loading, error, execute }
}
