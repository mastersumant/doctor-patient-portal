import { lazy, Suspense, useCallback, useMemo, useState, type ReactNode } from 'react'
import { env } from '@/config/env'
import { DEMO_DOCTORS } from '@/data/seed/seedData'
import type { SessionIdentity } from '@/services/context'
import { AuthContext, type AuthState } from './AuthContext'

const DEMO_KEY = 'clinicdesk.demoDoctor'

export function readDemo(): string | null {
  if (!env.demoMode) return null
  try {
    const id = sessionStorage.getItem(DEMO_KEY)
    return DEMO_DOCTORS.some((d) => d.doctorId === id) ? id : null
  } catch {
    return null
  }
}

export function demoIdentity(doctorId: string | null): SessionIdentity | null {
  const d = DEMO_DOCTORS.find((x) => x.doctorId === doctorId)
  return d ? { userId: d.doctorId, fullName: d.fullName, email: d.email, imageUrl: '' } : null
}

/** Demo selection lives in sessionStorage (per tab), purely as "which workspace am I viewing". */
export function useDemoSelection() {
  const [demoId, setDemoId] = useState<string | null>(readDemo)
  const enterDemo = useCallback((id: string) => {
    try {
      sessionStorage.setItem(DEMO_KEY, id)
    } catch {
      /* storage blocked: selection lasts for this page view */
    }
    setDemoId(id)
  }, [])
  const leaveDemo = useCallback(() => {
    try {
      sessionStorage.removeItem(DEMO_KEY)
    } catch {
      /* ignore */
    }
    setDemoId(null)
  }, [])
  return { demoId, enterDemo: env.demoMode ? enterDemo : null, leaveDemo }
}

function DemoOnlyAuth({ children }: { children: ReactNode }) {
  const { demoId, enterDemo, leaveDemo } = useDemoSelection()
  const value = useMemo<AuthState>(() => {
    const identity = demoIdentity(demoId)
    return {
      status: identity ? 'signed-in' : 'signed-out',
      mode: identity ? 'demo' : null,
      identity,
      enterDemo,
      signOut: async () => leaveDemo(),
      getToken: async () => null,
    }
  }, [demoId, enterDemo, leaveDemo])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * Uses Clerk when VITE_CLERK_PUBLISHABLE_KEY is set. Without it, only the clearly
 * labelled demo workspaces are available — there is no fake sign-in.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  if (!env.clerkEnabled) return <DemoOnlyAuth>{children}</DemoOnlyAuth>
  return (
    <Suspense fallback={null}>
      <ClerkAuth>{children}</ClerkAuth>
    </Suspense>
  )
}

// Clerk's SDK is only downloaded when a publishable key is configured.
const ClerkAuth = lazy(() => import('./ClerkAuth'))
