import { Stethoscope } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState, ErrorState, PageHeader, Panel, Spinner, StatusBadge } from '@/components/ui/Display'
import { Input, Select } from '@/components/ui/Field'
import { DataTable, Pagination, SearchInput, Toolbar } from '@/components/ui/Table'
import { VISIT_TYPES } from '@/domain/constants'
import type { VisitType } from '@/domain/types'
import { useDebounced, useQuery } from '@/hooks/useQuery'
import type { VisitListItem } from '@/services/visitService'
import { formatBp } from '@/utils/clinical'
import { formatDate, formatDateTime } from '@/utils/dates'

export function VisitsListPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const type = (params.get('type') as VisitType) || ''
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const page = Number(params.get('page') ?? 1)
  const search = useDebounced(q)

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }

  const { data, error, loading, reload } = useQuery((s) => s.visits.list({ search, visitType: type, from, to, page, pageSize: 12 }), [search, type, from, to, page])

  return (
    <>
      <PageHeader
        title="Visits"
        description="Every consultation recorded in your workspace, newest first."
        actions={
          <ButtonLink to="/visits/new" icon={Stethoscope}>
            Record visit
          </ButtonLink>
        }
      />
      <Panel padded={false}>
        <Toolbar>
          <SearchInput value={q} onChange={(v) => set('q', v)} placeholder="Patient, complaint or diagnosis" className="sm:w-80" label="Search visits" />
          <Select aria-label="Visit type" value={type} onChange={(e) => set('type', e.target.value)} options={VISIT_TYPES} placeholder="All visit types" className="sm:w-48" />
          <div className="flex items-center gap-2 sm:ml-auto">
            <Input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => set('from', e.target.value)} className="w-40" />
            <span className="text-sm text-muted">to</span>
            <Input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => set('to', e.target.value)} className="w-40" />
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
            <DataTable<VisitListItem>
              rows={data.items}
              rowKey={(v) => v.visitId}
              onRowClick={(v) => navigate(`/visits/${v.visitId}`)}
              empty={<EmptyState icon={Stethoscope} title={q || type || from || to ? 'No visits match these filters' : 'No visits recorded yet'} action={<ButtonLink size="sm" to="/visits/new">Record visit</ButtonLink>} />}
              columns={[
                { key: 'date', header: 'Date and time', render: (v) => <span className="whitespace-nowrap">{formatDateTime(v.visitDateTime)}</span> },
                { key: 'patient', header: 'Patient', render: (v) => <span className="font-semibold whitespace-nowrap text-ink">{v.patientName}</span> },
                { key: 'type', header: 'Type', hideBelow: 'sm', render: (v) => <StatusBadge status={v.visitType} /> },
                {
                  key: 'complaint',
                  header: 'Complaint and diagnosis',
                  hideBelow: 'md',
                  render: (v) => (
                    <div className="min-w-52">
                      <p className="text-ink">{v.chiefComplaint}</p>
                      <p className="line-clamp-1 text-[13px] text-muted">{v.diagnosisSummary || 'No diagnosis'}</p>
                    </div>
                  ),
                },
                { key: 'bp', header: 'BP', hideBelow: 'lg', render: (v) => <span className="tabular">{formatBp(v.bpSystolic, v.bpDiastolic)}</span> },
                { key: 'fu', header: 'Follow-up', hideBelow: 'lg', render: (v) => <span className="whitespace-nowrap">{formatDate(v.followUpDate)}</span> },
              ]}
            />
            <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPage={(p) => set('page', String(p))} noun="visits" />
          </>
        )}
      </Panel>
    </>
  )
}
