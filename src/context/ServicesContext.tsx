import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { env } from '@/config/env'
import { createRepositoriesWithFallback } from '@/data/repositories/factory'
import { ensureDemoData } from '@/data/seed/seedData'
import { createServices, type Services } from '@/services'
import type { SessionIdentity } from '@/services/context'
import type { Doctor } from '@/domain/types'
import { errorMessage } from '@/services/errors'
import { useAuthState } from '@/auth/AuthContext'

interface ServicesState {
  services: Services
  /** True when the browser blocked IndexedDB and data only lives for this tab. */
  ephemeral: boolean
}

interface WorkspaceState {
  doctor: Doctor | null
  doctorError: string | null
  refreshDoctor: () => Promise<void>
}

const ServicesCtx = createContext<ServicesState | null>(null)
const WorkspaceCtx = createContext<WorkspaceState | null>(null)

/**
 * Opens storage once, seeds the demo workspaces when demo mode is enabled, and
 * binds services to the authenticated identity. Services read the identity
 * through a ref, so the doctor ID always comes from the auth session.
 */
export function ServicesProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const { identity } = useAuthState()
  const identityRef = useRef<SessionIdentity | null>(identity)
  identityRef.current = identity

  const [state, setState] = useState<ServicesState | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { repos, fellBack } = await createRepositoriesWithFallback(env.storageType)
        if (env.demoMode) await ensureDemoData(repos)
        const services = createServices(repos, { getIdentity: () => identityRef.current })
        if (!cancelled) setState({ services, ephemeral: fellBack || repos.storageType === 'MEMORY' })
      } catch (err) {
        if (!cancelled) setBootError(errorMessage(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (bootError) {
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        <div className="max-w-md">
          <h1 className="text-lg font-semibold">The app could not open its data store</h1>
          <p className="mt-2 text-muted">{bootError}</p>
        </div>
      </div>
    )
  }
  if (!state) return <>{fallback}</>
  return <ServicesCtx.Provider value={state}>{children}</ServicesCtx.Provider>
}

export function useServicesState(): ServicesState {
  const ctx = useContext(ServicesCtx)
  if (!ctx) throw new Error('useServices must be used inside <ServicesProvider>')
  return ctx
}

export function useServices(): Services {
  return useServicesState().services
}

/** Loads (or creates on first sign-in) the signed-in doctor's profile. */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const services = useServices()
  const { identity } = useAuthState()
  const [doctor, setDoctor] = useState<Doctor | null>(null)
  const [doctorError, setDoctorError] = useState<string | null>(null)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)

  const refreshDoctor = useCallback(async () => {
    if (!identity) {
      setDoctor(null)
      setLoadedFor(null)
      return
    }
    try {
      setDoctor(await services.doctor.ensureProfile())
      setDoctorError(null)
    } catch (err) {
      setDoctorError(errorMessage(err))
    } finally {
      setLoadedFor(identity.userId)
    }
  }, [identity, services])

  useEffect(() => {
    void refreshDoctor()
  }, [refreshDoctor])

  useEffect(() => services.bus.subscribe((e) => (e.includes('doctor') || e.includes('*') ? void refreshDoctor() : undefined)), [services, refreshDoctor])

  const value = useMemo(() => ({ doctor, doctorError, refreshDoctor }), [doctor, doctorError, refreshDoctor])
  if (identity && loadedFor !== identity.userId) return null
  return <WorkspaceCtx.Provider value={value}>{children}</WorkspaceCtx.Provider>
}

export function useWorkspace(): WorkspaceState {
  const ctx = useContext(WorkspaceCtx)
  if (!ctx) throw new Error('useWorkspace must be used inside <WorkspaceProvider>')
  return ctx
}
