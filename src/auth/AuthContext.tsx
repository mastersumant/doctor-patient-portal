import { createContext, useContext } from 'react'
import type { SessionIdentity } from '@/services/context'

export type AuthStatus = 'loading' | 'signed-out' | 'signed-in'

export interface AuthState {
  status: AuthStatus
  /** How the current identity was established. */
  mode: 'clerk' | 'demo' | null
  identity: SessionIdentity | null
  signOut: () => Promise<void>
  /** Demo mode only: enter one of the synthetic doctor workspaces. */
  enterDemo: ((doctorId: string) => void) | null
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuthState(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthState must be used inside <AuthProvider>')
  return ctx
}
