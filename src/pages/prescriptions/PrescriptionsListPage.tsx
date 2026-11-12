import { ClipboardList, ClipboardPlus } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState, ErrorState, PageHeader, Panel, Spinner, StatusBadge } from '@/components/ui/Display'
import { Input } from '@/components/ui/Field'
import { DataTable, Pagination, SearchInput, Segmented, Toolbar } from '@/components/ui/Table'
import { useDebounced, useQuery } from '@/hooks/useQuery'
import type { PrescriptionListItem } from '@/services/prescriptionService'
import { formatDate } from '@/utils/dates'

export function PrescriptionsListPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const view = (params.get('view') as 'current' | 'all') || 'current'
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
    (s) => s.prescriptions.list({ search, from, to, includeSuperseded: view === 'all', page, pageSize: 12 }),
    [search, from, to, view, page],
  )

  return (
    <>
      <PageHeader
        title="Prescriptions"
        description="Issued prescriptions are never overwritten. Revising one issues a new version and keeps the original."
        actions={
          <ButtonLink to="/prescriptions/new" icon={ClipboardPlus}>
            New prescription
          </ButtonLink>
        }
      />
      <Panel padded={false}>
        <Toolbar>
          <SearchInput value={q} onChange={(v) => set('q', v)} placeholder="Rx number, patient or diagnosis" className="sm:w-80" label="Search prescriptions" />
          <Segmented<'current' | 'all'>
            label="Versions"
            value={view}
            onChange={(v) => set('view', v === 'current' ? '' : v)}
            options={[
              { value: 'current', label: 'Current versions' },
              { value: 'all', label: 'Include superseded' },
            ]}
          />
          <div className="flex items-center gap-2 sm:ml-auto">
            <Input type="date" aria-label="From date" value={from} onChange={(e) => set('from', e.target.value)} className="w-40" />
            <span className="text-sm text-muted">to</span>
            <Input type="date" aria-label="To date" value={to} onChange={(e) => set('to', e.target.value)} className="w-40" />
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
            <DataTable<PrescriptionListItem>
              rows={data.items}
              rowKey={(r) => r.prescriptionId}
              onRowClick={(r) => navigate(`/prescriptions/${r.prescriptionId}`)}
              empty={<EmptyState icon={ClipboardList} title={q || from || to ? 'No prescriptions match' : 'No prescriptions yet'} action={<ButtonLink size="sm" to="/prescriptions/new">New prescription</ButtonLink>} />}
              columns={[
                {
                  key: 'rx',
                  header: 'Rx number',
                  render: (r) => (
                    <span className="tabular font-semibold whitespace-nowrap text-ink">
                      {r.rxNumber}
                      {r.version > 1 ? <span className="ml-1.5 text-[12px] font-normal text-muted">v{r.version}</span> : null}
                    </span>
                  ),
                },
                { key: 'date', header: 'Date', render: (r) => <span className="whitespace-nowrap">{formatDate(r.prescriptionDate)}</span> },
                { key: 'patient', header: 'Patient', render: (r) => <span className="font-semibold whitespace-nowrap text-ink">{r.snapshot.patientName}</span> },
                { key: 'meds', header: 'Medicines', hideBelow: 'md', render: (r) => <span className="line-clamp-2 min-w-48 text-[13.5px] text-ink-soft">{r.medicineNames}</span> },
                { key: 'dx', header: 'Diagnosis', hideBelow: 'lg', render: (r) => <span className="line-clamp-1 text-[13.5px] text-muted">{r.diagnosis || '—'}</span> },
                { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              ]}
            />
            <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPage={(p) => set('page', String(p))} noun="prescriptions" />
          </>
        )}
      </Panel>
    </>
  )
}
