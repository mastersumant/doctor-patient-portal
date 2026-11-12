import { ClerkProvider, useAuth, useUser } from '@clerk/react'
import { useMemo, type ReactNode } from 'react'
import { env } from '@/config/env'
import type { SessionIdentity } from '@/services/context'
import { AuthContext, type AuthState } from './AuthContext'
import { demoIdentity, useDemoSelection } from './AuthProvider'

function ClerkBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, signOut, getToken } = useAuth()
  const { user } = useUser()
  const { demoId, enterDemo, leaveDemo } = useDemoSelection()

  const value = useMemo<AuthState>(() => {
    const noToken = async () => null
    if (!isLoaded) return { status: 'loading', mode: null, identity: null, enterDemo, signOut: async () => undefined, getToken: noToken }
    if (isSignedIn && user) {
      const identity: SessionIdentity = {
        userId: user.id,
        fullName: user.fullName || user.username || user.primaryEmailAddress?.emailAddress || 'Doctor',
        email: user.primaryEmailAddress?.emailAddress ?? '',
        imageUrl: user.imageUrl ?? '',
      }
      return { status: 'signed-in', mode: 'clerk', identity, enterDemo: null, signOut: () => signOut(), getToken: () => getToken() }
    }
    const demo = demoIdentity(demoId)
    if (demo) return { status: 'signed-in', mode: 'demo', identity: demo, enterDemo, signOut: async () => leaveDemo(), getToken: noToken }
    return { status: 'signed-out', mode: null, identity: null, enterDemo, signOut: async () => undefined, getToken: noToken }
  }, [isLoaded, isSignedIn, user, signOut, getToken, demoId, enterDemo, leaveDemo])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * Clerk-backed auth. The identity (and therefore the doctor ID used to scope every
 * query) comes from Clerk's verified session, never from anything the user types.
 */
export default function ClerkAuth({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider publishableKey={env.clerkPublishableKey} afterSignOutUrl="/">
      <ClerkBridge>{children}</ClerkBridge>
    </ClerkProvider>
  )
}
