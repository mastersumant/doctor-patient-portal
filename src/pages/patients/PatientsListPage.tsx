import { Archive, ArchiveRestore, CalendarPlus, ClipboardPlus, Eye, Pencil, UserPlus, Users } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router'
import { ButtonLink, IconButton } from '@/components/ui/Button'
import { Avatar, Badge, EmptyState, ErrorState, PageHeader, Panel, Spinner, StatusBadge } from '@/components/ui/Display'
import { Select } from '@/components/ui/Field'
import { DataTable, Pagination, SearchInput, Segmented, Toolbar } from '@/components/ui/Table'
import { GENDERS } from '@/domain/constants'
import type { Gender, PatientListItem } from '@/domain/types'
import { useFeedback } from '@/context/FeedbackContext'
import { useServices } from '@/context/ServicesContext'
import { useDebounced, useQuery } from '@/hooks/useQuery'
import { formatDate, relativeDay, todayIso } from '@/utils/dates'

type StatusFilter = 'all' | 'Active' | 'Inactive' | 'archived'
type Sort = 'newest' | 'name' | 'oldest' | 'id'

export function PatientsListPage() {
  const services = useServices()
  const feedback = useFeedback()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const status = (params.get('status') as StatusFilter) || 'all'
  const gender = (params.get('gender') as Gender) || ''
  const sort = (params.get('sort') as Sort) || 'newest'
  const page = Number(params.get('page') ?? 1)
  const search = useDebounced(q)

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }

  const { data, error, loading, reload } = useQuery(
    (s) =>
      s.patients.list({
        search,
        status: status === 'Active' || status === 'Inactive' ? status : '',
        archived: status === 'archived',
        gender,
        sort,
        page,
        pageSize: 10,
      }),
    [search, status, gender, sort, page],
  )

  const archive = async (p: PatientListItem) => {
    const ok = await feedback.confirm({
      title: `Archive ${p.fullName}?`,
      message: 'The patient disappears from lists and pickers. Their visits, prescriptions and documents are kept, and you can restore them from the Archived filter.',
      confirmLabel: 'Archive patient',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await services.patients.archive(p.patientId)
      feedback.success(`${p.fullName} archived`)
    } catch (err) {
      feedback.error(err)
    }
  }

  const restore = async (p: PatientListItem) => {
    try {
      await services.patients.restore(p.patientId)
      feedback.success(`${p.fullName} restored`)
    } catch (err) {
      feedback.error(err)
    }
  }

  const today = todayIso()

  return (
    <>
      <PageHeader
        title="Patients"
        description="Everyone registered in your workspace. Search by name, patient ID or mobile number."
        actions={
          <ButtonLink to="/patients/new" icon={UserPlus}>
            Add patient
          </ButtonLink>
        }
      />
      <Panel padded={false}>
        <Toolbar>
          <SearchInput value={q} onChange={(v) => set('q', v)} placeholder="Name, patient ID or mobile" className="sm:w-80" label="Search patients" />
          <Segmented<StatusFilter>
            label="Status"
            value={status}
            onChange={(v) => set('status', v === 'all' ? '' : v)}
            options={[
              { value: 'all', label: 'All' },
              { value: 'Active', label: 'Active' },
              { value: 'Inactive', label: 'Inactive' },
              { value: 'archived', label: 'Archived' },
            ]}
          />
          <div className="flex gap-2 sm:ml-auto">
            <Select aria-label="Gender" value={gender} onChange={(e) => set('gender', e.target.value)} options={GENDERS} placeholder="Any gender" className="w-36" />
            <Select
              aria-label="Sort by"
              value={sort}
              onChange={(e) => set('sort', e.target.value === 'newest' ? '' : e.target.value)}
              className="w-44"
              options={[
                { value: 'newest', label: 'Newest first' },
                { value: 'oldest', label: 'Oldest first' },
                { value: 'name', label: 'Name A–Z' },
                { value: 'id', label: 'Patient ID' },
              ]}
            />
          </div>
        </Toolbar>

        {error ? (
          <div className="p-5">
            <ErrorState message={error} onRetry={reload} />
          </div>
        ) : loading || !data ? (
          <Spinner />
        ) : (
          <>
            <DataTable<PatientListItem>
              rows={data.items}
              rowKey={(p) => p.patientId}
              onRowClick={(p) => navigate(`/patients/${p.patientId}`)}
              empty={
                <EmptyState
                  icon={Users}
                  title={q || status !== 'all' || gender ? 'No patients match these filters' : 'No patients yet'}
                  description={q ? 'Check the spelling, or search by mobile number or patient ID instead.' : 'Register your first patient to start recording visits.'}
                  action={!q ? <ButtonLink to="/patients/new" icon={UserPlus} size="sm">Add patient</ButtonLink> : undefined}
                />
              }
              columns={[
                { key: 'id', header: 'Patient ID', hideBelow: 'md', render: (p) => <span className="tabular text-[13px] text-ink-soft">{p.patientId}</span> },
                {
                  key: 'name',
                  header: 'Patient',
                  render: (p) => (
                    <div className="flex min-w-44 items-center gap-3">
                      <Avatar name={p.fullName} size={32} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink">{p.fullName}</p>
                        <p className="tabular text-[12.5px] text-muted md:hidden">{p.patientId}</p>
                      </div>
                    </div>
                  ),
                },
                { key: 'age', header: 'Age', render: (p) => <span className="tabular">{p.age}</span> },
                { key: 'gender', header: 'Gender', hideBelow: 'sm', render: (p) => p.gender },
                { key: 'mobile', header: 'Mobile', hideBelow: 'lg', render: (p) => <span className="tabular whitespace-nowrap">{p.mobile}</span> },
                { key: 'last', header: 'Last visit', hideBelow: 'md', render: (p) => <span className="whitespace-nowrap">{formatDate(p.lastVisit)}</span> },
                {
                  key: 'next',
                  header: 'Next follow-up',
                  hideBelow: 'lg',
                  render: (p) =>
                    p.nextFollowUp ? (
                      p.nextFollowUp < today ? (
                        <Badge tone="danger">{relativeDay(p.nextFollowUp).replace('days ago', 'd overdue')}</Badge>
                      ) : (
                        <span className="whitespace-nowrap">{formatDate(p.nextFollowUp)}</span>
                      )
                    ) : (
                      <span className="text-muted">—</span>
                    ),
                },
                { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.deletedAt ? 'Archived' : p.status} /> },
                {
                  key: 'actions',
                  header: <span className="sr-only">Actions</span>,
                  align: 'right',
                  render: (p) => (
                    <div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <IconButton icon={Eye} label={`View ${p.fullName}`} onClick={() => navigate(`/patients/${p.patientId}`)} />
                      {p.deletedAt ? (
                        <IconButton icon={ArchiveRestore} label={`Restore ${p.fullName}`} onClick={() => restore(p)} />
                      ) : (
                        <>
                          <IconButton icon={Pencil} label={`Edit ${p.fullName}`} onClick={() => navigate(`/patients/${p.patientId}/edit`)} />
                          <IconButton icon={CalendarPlus} label={`Book appointment for ${p.fullName}`} className="hidden sm:inline-grid" onClick={() => navigate(`/appointments?new=1&patientId=${p.patientId}`)} />
                          <IconButton icon={ClipboardPlus} label={`New prescription for ${p.fullName}`} className="hidden sm:inline-grid" onClick={() => navigate(`/prescriptions/new?patientId=${p.patientId}`)} />
                          <IconButton icon={Archive} tone="danger" label={`Archive ${p.fullName}`} onClick={() => archive(p)} />
                        </>
                      )}
                    </div>
                  ),
                },
              ]}
            />
            <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPage={(p) => set('page', String(p))} noun="patients" />
          </>
        )}
      </Panel>
    </>
  )
}
