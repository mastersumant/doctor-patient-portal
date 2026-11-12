import { Navigate, Outlet, useLocation } from 'react-router'
import { PageLoader } from '@/components/ui/Display'
import { useWorkspace } from '@/context/ServicesContext'
import { useAuthState } from './AuthContext'

/** Requires a signed-in identity; sends first-time doctors to profile setup. */
export function ProtectedRoute() {
  const { status } = useAuthState()
  const { doctor, doctorError } = useWorkspace()
  const location = useLocation()

  if (status === 'loading') return <PageLoader />
  if (status === 'signed-out') return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />
  if (doctorError) {
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        <div>
          <p className="font-semibold">Your profile couldn’t be loaded</p>
          <p className="mt-1 text-sm text-muted">{doctorError}</p>
        </div>
      </div>
    )
  }
  if (!doctor) return <PageLoader />
  if (!doctor.onboardingComplete && location.pathname !== '/onboarding') return <Navigate to="/onboarding" replace />
  return <Outlet />
}
