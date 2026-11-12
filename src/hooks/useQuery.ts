import { useCallback, useEffect, useRef, useState } from 'react'
import { useServices } from '@/context/ServicesContext'
import { useAuthState } from '@/auth/AuthContext'
import type { Services } from '@/services'
import { errorMessage, NotFoundError } from '@/services/errors'

export interface QueryResult<T> {
  data: T | undefined
  error: string | null
  notFound: boolean
  /** True only for the first load; later refreshes keep showing current data. */
  loading: boolean
  refreshing: boolean
  reload: () => Promise<void>
}

/**
 * Runs a service call and re-runs it when its dependencies change or when any
 * service reports a write (so lists stay current after edits anywhere).
 */
export function useQuery<T>(fn: (s: Services) => Promise<T>, deps: unknown[]): QueryResult<T> {
  const services = useServices()
  const { identity } = useAuthState()
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const seq = useRef(0)

  const run = useCallback(
    async (initial: boolean) => {
      const mine = ++seq.current
      if (initial) setLoading(true)
      else setRefreshing(true)
      try {
        const result = await fnRef.current(services)
        if (mine !== seq.current) return
        setData(result)
        setError(null)
        setNotFound(false)
      } catch (err) {
        if (mine !== seq.current) return
        setError(errorMessage(err))
        setNotFound(err instanceof NotFoundError)
      } finally {
        if (mine === seq.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [services],
  )

  useEffect(() => {
    void run(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, identity?.userId, ...deps])

  useEffect(() => services.bus.subscribe(() => void run(false)), [services, run])

  const reload = useCallback(() => run(false), [run])
  return { data, error, notFound, loading, refreshing, reload }
}

export function useDebounced<T>(value: T, delay = 250): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}
