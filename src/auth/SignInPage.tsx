import { lazy, Suspense } from 'react'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { Navigate } from 'react-router'
import { BrandMark } from '@/components/BrandMark'
import { Avatar, Spinner } from '@/components/ui/Display'
import { env } from '@/config/env'
import { DEMO_DOCTORS } from '@/data/seed/seedData'
import { useAuthState } from './AuthContext'

const ClerkSignIn = lazy(() => import('@clerk/react').then((m) => ({ default: () => <m.SignIn routing="hash" fallbackRedirectUrl="/" signUpFallbackRedirectUrl="/" /> })))

export function SignInPage() {
  const { status, enterDemo } = useAuthState()
  if (status === 'signed-in') return <Navigate to="/" replace />

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-brand-800 px-12 py-12 text-white lg:flex lg:flex-col">
        <div className="flex items-center gap-2.5">
          <BrandMark size={34} />
          <span className="text-lg font-bold">{env.appName}</span>
        </div>
        <div className="mt-auto max-w-md">
          <p className="text-[32px] leading-[1.15] font-bold tracking-[-0.015em]">Every patient’s story, from first visit to next follow-up.</p>
          <p className="mt-4 text-[15px] leading-relaxed text-brand-100">
            Record visits and vitals, issue prescriptions that keep their history, and see who is due back, all in one private workspace per doctor.
          </p>
        </div>
        <div className="mt-12 grid max-w-md grid-cols-3 gap-4 border-t border-white/15 pt-6 text-[13px] text-brand-100">
          <div>
            <p className="text-white">Private by doctor</p>
            <p className="mt-0.5">Each workspace sees only its own patients.</p>
          </div>
          <div>
            <p className="text-white">Versioned Rx</p>
            <p className="mt-0.5">Edits issue a new version; originals stay.</p>
          </div>
          <div>
            <p className="text-white">Excel in and out</p>
            <p className="mt-0.5">Export or import the whole workspace.</p>
          </div>
        </div>
        <svg className="pointer-events-none absolute -top-24 -right-24 opacity-[0.07]" width="420" height="420" viewBox="0 0 32 32" aria-hidden>
          <path d="M13 3h6v10h10v6H19v10h-6V19H3v-6h10z" fill="#fff" />
        </svg>
      </aside>

      <main className="flex flex-col items-center justify-center px-5 py-10 sm:px-10">
        <div className="mb-8 flex items-center gap-2.5 lg:hidden">
          <BrandMark size={32} />
          <span className="text-lg font-bold">{env.appName}</span>
        </div>

        <div className="w-full max-w-[420px]">
          {env.clerkEnabled ? (
            <div className="flex flex-col items-center">
              <h1 className="mb-1 text-center text-2xl font-bold">Sign in to your clinic</h1>
              <p className="mb-6 text-center text-[15px] text-muted">Continue with Google, Facebook or your email.</p>
              <Suspense fallback={<Spinner label="Loading sign-in" />}>
                <ClerkSignIn />
              </Suspense>
            </div>
          ) : (
            <div className="rounded-[var(--radius-panel)] border border-line bg-surface p-5 shadow-panel">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">
                  <KeyRound className="size-4" aria-hidden />
                </span>
                <div>
                  <h1 className="text-[17px] font-semibold">Sign-in isn’t set up yet</h1>
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    Google, Facebook and email sign-in turn on once a Clerk publishable key is added as <code className="rounded bg-sunken px-1 text-[13px]">VITE_CLERK_PUBLISHABLE_KEY</code>. The setup guide walks through it.
                  </p>
                </div>
              </div>
            </div>
          )}

          {enterDemo ? (
            <section className="mt-8" aria-labelledby="demo-heading">
              <h2 id="demo-heading" className="text-[15px] font-semibold">
                {env.clerkEnabled ? 'Or explore a demo workspace' : 'Explore a demo workspace'}
              </h2>
              <p className="mt-1 text-sm text-muted">Synthetic patients and records only. This is not a sign-in.</p>
              <ul className="mt-4 space-y-2.5">
                {DEMO_DOCTORS.map((d) => (
                  <li key={d.doctorId}>
                    <button
                      onClick={() => enterDemo(d.doctorId)}
                      className="flex w-full items-center gap-3 rounded-[var(--radius-panel)] border border-line bg-surface px-4 py-3.5 text-left shadow-panel transition-colors hover:border-brand-200 hover:bg-brand-50/50"
                    >
                      <Avatar name={d.fullName} size={40} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-ink">{d.fullName}</span>
                        <span className="block text-[13px] text-muted">
                          {d.specialization}, {d.clinicName}
                        </span>
                      </span>
                      <span className="text-[13px] font-semibold whitespace-nowrap text-brand-600">Open workspace</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : !env.clerkEnabled ? (
            <p className="mt-6 text-sm text-muted">Demo mode is turned off (VITE_ENABLE_DEMO_MODE=false), so there is nothing to open until Clerk is configured.</p>
          ) : null}

          <p className="mt-10 flex items-center justify-center gap-1.5 text-center text-[12.5px] text-muted">
            <ShieldCheck className="size-3.5" aria-hidden /> Prototype: use synthetic data only, never real patient information.
          </p>
        </div>
      </main>
    </div>
  )
}
