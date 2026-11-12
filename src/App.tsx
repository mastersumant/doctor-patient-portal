import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, HashRouter, MemoryRouter, Route, Routes } from 'react-router'
import { AuthProvider } from '@/auth/AuthProvider'
import { ProtectedRoute } from '@/auth/ProtectedRoute'
import { SignInPage } from '@/auth/SignInPage'
import { PageLoader } from '@/components/ui/Display'
import { env } from '@/config/env'
import { FeedbackProvider } from '@/context/FeedbackContext'
import { ServicesProvider, WorkspaceProvider } from '@/context/ServicesContext'
import { AppLayout } from '@/layouts/AppLayout'
import { OnboardingPage } from '@/pages/OnboardingPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

// Screens load on demand so the first paint only needs the shell.
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const PatientsListPage = lazy(() => import('@/pages/patients/PatientsListPage').then((m) => ({ default: m.PatientsListPage })))
const PatientFormPage = lazy(() => import('@/pages/patients/PatientFormPage').then((m) => ({ default: m.PatientFormPage })))
const PatientProfilePage = lazy(() => import('@/pages/patients/PatientProfilePage').then((m) => ({ default: m.PatientProfilePage })))
const VisitsListPage = lazy(() => import('@/pages/visits/VisitsListPage').then((m) => ({ default: m.VisitsListPage })))
const VisitFormPage = lazy(() => import('@/pages/visits/VisitFormPage').then((m) => ({ default: m.VisitFormPage })))
const VisitDetailPage = lazy(() => import('@/pages/visits/VisitDetailPage').then((m) => ({ default: m.VisitDetailPage })))
const PrescriptionsListPage = lazy(() => import('@/pages/prescriptions/PrescriptionsListPage').then((m) => ({ default: m.PrescriptionsListPage })))
const PrescriptionFormPage = lazy(() => import('@/pages/prescriptions/PrescriptionFormPage').then((m) => ({ default: m.PrescriptionFormPage })))
const MedicinesPage = lazy(() => import('@/pages/medicines/MedicinesPage').then((m) => ({ default: m.MedicinesPage })))
const FollowUpsPage = lazy(() => import('@/pages/followups/FollowUpsPage').then((m) => ({ default: m.FollowUpsPage })))
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })))
// Default-exported screens.
const PrescriptionViewPage = lazy(() => import('@/pages/prescriptions/PrescriptionViewPage'))
const AppointmentsPage = lazy(() => import('@/pages/appointments/AppointmentsPage'))
const ReportsPage = lazy(() => import('@/pages/reports/ReportsPage'))

function Router({ children }: { children: ReactNode }) {
  if (env.routerMode === 'hash') return <HashRouter>{children}</HashRouter>
  if (env.routerMode === 'memory') return <MemoryRouter>{children}</MemoryRouter>
  return <BrowserRouter>{children}</BrowserRouter>
}

export default function App() {
  return (
    <AuthProvider>
      <ServicesProvider fallback={<PageLoader />}>
        <WorkspaceProvider>
          <FeedbackProvider>
            <Router>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/sign-in" element={<SignInPage />} />
                  <Route element={<ProtectedRoute />}>
                    <Route path="/onboarding" element={<OnboardingPage />} />
                    <Route element={<AppLayout />}>
                      <Route index element={<DashboardPage />} />
                      <Route path="patients" element={<PatientsListPage />} />
                      <Route path="patients/new" element={<PatientFormPage />} />
                      <Route path="patients/:patientId" element={<PatientProfilePage />} />
                      <Route path="patients/:patientId/edit" element={<PatientFormPage />} />
                      <Route path="visits" element={<VisitsListPage />} />
                      <Route path="visits/new" element={<VisitFormPage />} />
                      <Route path="visits/:visitId" element={<VisitDetailPage />} />
                      <Route path="visits/:visitId/edit" element={<VisitFormPage />} />
                      <Route path="prescriptions" element={<PrescriptionsListPage />} />
                      <Route path="prescriptions/new" element={<PrescriptionFormPage />} />
                      <Route path="prescriptions/:prescriptionId" element={<PrescriptionViewPage />} />
                      <Route path="prescriptions/:prescriptionId/revise" element={<PrescriptionFormPage />} />
                      <Route path="medicines" element={<MedicinesPage />} />
                      <Route path="appointments" element={<AppointmentsPage />} />
                      <Route path="follow-ups" element={<FollowUpsPage />} />
                      <Route path="reports" element={<ReportsPage />} />
                      <Route path="settings" element={<SettingsPage />} />
                      <Route path="*" element={<NotFoundPage />} />
                    </Route>
                  </Route>
                </Routes>
              </Suspense>
            </Router>
          </FeedbackProvider>
        </WorkspaceProvider>
      </ServicesProvider>
    </AuthProvider>
  )
}
