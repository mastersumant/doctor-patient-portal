import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuthState } from '@/auth/AuthContext'
import { DoctorProfileForm } from '@/components/doctor/DoctorProfileForm'
import { PageLoader, Panel } from '@/components/ui/Display'
import { BrandMark } from '@/components/BrandMark'
import { useFeedback } from '@/context/FeedbackContext'
import { useServices, useWorkspace } from '@/context/ServicesContext'
import { env } from '@/config/env'

export function OnboardingPage() {
  const services = useServices()
  const { doctor, refreshDoctor } = useWorkspace()
  const { mode } = useAuthState()
  const feedback = useFeedback()
  const navigate = useNavigate()
  const [withSamples, setWithSamples] = useState(true)

  if (!doctor) return <PageLoader />

  return (
    <div className="min-h-screen px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center gap-2.5">
          <BrandMark />
          <span className="text-lg font-bold">{env.appName}</span>
        </div>
        <h1 className="text-2xl font-bold sm:text-[26px]">Set up your clinic profile</h1>
        <p className="mt-1 max-w-2xl text-muted">
          Welcome, {doctor.fullName}. These details appear on prescriptions and reports. You can change them later in Settings.
        </p>
        <Panel className="mt-6">
          <DoctorProfileForm
            doctor={doctor}
            emailLocked={mode === 'clerk' && !!doctor.email}
            submitLabel="Save and open my workspace"
            extra={
              <label className="mt-2 flex items-start gap-3 rounded-[var(--radius-control)] bg-sunken px-4 py-3 text-sm">
                <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-brand-600)]" checked={withSamples} onChange={(e) => setWithSamples(e.target.checked)} />
                <span>
                  <span className="block font-semibold text-ink">Add sample patients so I can explore</span>
                  <span className="text-muted">12 fictional patients with visits, prescriptions and appointments. Clear them any time from Settings.</span>
                </span>
              </label>
            }
            onSubmit={async (values) => {
              await services.doctor.updateProfile(values)
              if (withSamples && (await services.data.isEmpty())) await services.data.loadSampleData()
              await refreshDoctor()
              feedback.success('Profile saved')
              navigate('/', { replace: true })
            }}
          />
        </Panel>
      </div>
    </div>
  )
}
