import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Pill, Plus, Power, PowerOff, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useSearchParams } from 'react-router'
import { Button, IconButton } from '@/components/ui/Button'
import { EmptyState, ErrorState, PageHeader, Panel, Spinner, StatusBadge } from '@/components/ui/Display'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { DataTable, Pagination, SearchInput, Segmented, Toolbar } from '@/components/ui/Table'
import { DOSAGE_FORMS, MEDICINE_CATEGORIES, MEDICINE_STATUSES, ROUTES } from '@/domain/constants'
import type { Medicine } from '@/domain/types'
import { useFeedback } from '@/context/FeedbackContext'
import { useServices } from '@/context/ServicesContext'
import { useDebounced, useQuery } from '@/hooks/useQuery'
import { applyServerErrors } from '@/utils/forms'
import { medicineSchema, type MedicineInput } from '@/validations/schemas'

const EMPTY: MedicineInput = {
  name: '',
  genericName: '',
  brandName: '',
  manufacturer: '',
  composition: '',
  strength: '',
  dosageForm: 'Tablet',
  route: 'Oral',
  category: '',
  description: '',
  status: 'Active',
}

export function MedicinesPage() {
  const services = useServices()
  const feedback = useFeedback()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const status = (params.get('status') as 'Active' | 'Inactive' | '') || ''
  const category = params.get('category') ?? ''
  const page = Number(params.get('page') ?? 1)
  const search = useDebounced(q)
  const [editing, setEditing] = useState<Medicine | 'new' | null>(null)

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }

  const { data, error, loading, reload } = useQuery((s) => s.medicines.list({ search, status, category, page, pageSize: 12 }), [search, status, category, page])
  const { data: categories = [] } = useQuery((s) => s.medicines.categories(), [])

  const toggle = async (m: Medicine) => {
    const next = m.status === 'Active' ? 'Inactive' : 'Active'
    try {
      await services.medicines.setStatus(m.medicineId, next)
      feedback.success(next === 'Inactive' ? `${m.name} deactivated; it no longer appears when prescribing` : `${m.name} reactivated`)
    } catch (err) {
      feedback.error(err)
    }
  }

  const remove = async (m: Medicine) => {
    const ok = await feedback.confirm({
      title: `Delete ${m.name} ${m.strength}?`,
      message: 'Only medicines that have never been prescribed can be deleted. Prescribed medicines can be deactivated instead.',
      confirmLabel: 'Delete medicine',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await services.medicines.delete(m.medicineId)
      feedback.success(`${m.name} deleted`)
    } catch (err) {
      feedback.error(err)
    }
  }

  return (
    <>
      <PageHeader
        title="Medicines"
        description="Your catalog for writing prescriptions quickly. You can still prescribe medicines that aren’t listed here."
        actions={
          <Button icon={Plus} onClick={() => setEditing('new')}>
            Add medicine
          </Button>
        }
      />
      <Panel padded={false}>
        <Toolbar>
          <SearchInput value={q} onChange={(v) => set('q', v)} placeholder="Name, generic, brand or composition" className="sm:w-80" label="Search medicines" />
          <Segmented<'' | 'Active' | 'Inactive'>
            label="Status"
            value={status}
            onChange={(v) => set('status', v)}
            options={[
              { value: '', label: 'All' },
              { value: 'Active', label: 'Active' },
              { value: 'Inactive', label: 'Inactive' },
            ]}
          />
          <Select aria-label="Category" value={category} onChange={(e) => set('category', e.target.value)} options={categories} placeholder="All categories" className="sm:ml-auto sm:w-56" />
        </Toolbar>
        {error ? (
          <div className="p-5">
            <ErrorState message={error} onRetry={reload} />
          </div>
        ) : loading || !data ? (
          <Spinner />
        ) : (
          <>
            <DataTable<Medicine>
              rows={data.items}
              rowKey={(m) => m.medicineId}
              onRowClick={(m) => setEditing(m)}
              empty={<EmptyState icon={Pill} title={q || status || category ? 'No medicines match' : 'Your catalog is empty'} description="Add the medicines you prescribe most often." action={<Button size="sm" icon={Plus} onClick={() => setEditing('new')}>Add medicine</Button>} />}
              columns={[
                {
                  key: 'name',
                  header: 'Medicine',
                  render: (m) => (
                    <div className="min-w-44">
                      <p className="font-semibold text-ink">
                        {m.name} <span className="font-normal text-ink-soft">{m.strength}</span>
                      </p>
                      <p className="text-[13px] text-muted">{m.genericName}</p>
                    </div>
                  ),
                },
                { key: 'brand', header: 'Brand', hideBelow: 'lg', render: (m) => <span className="text-[13.5px]">{m.brandName || '—'}</span> },
                { key: 'form', header: 'Form', hideBelow: 'sm', render: (m) => m.dosageForm },
                { key: 'route', header: 'Route', hideBelow: 'md', render: (m) => m.route },
                { key: 'cat', header: 'Category', hideBelow: 'lg', render: (m) => <span className="text-[13.5px] text-muted">{m.category || '—'}</span> },
                { key: 'status', header: 'Status', render: (m) => <StatusBadge status={m.status} /> },
                {
                  key: 'actions',
                  header: <span className="sr-only">Actions</span>,
                  align: 'right',
                  render: (m) => (
                    <div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <IconButton icon={Pencil} label={`Edit ${m.name}`} onClick={() => setEditing(m)} />
                      <IconButton icon={m.status === 'Active' ? PowerOff : Power} label={m.status === 'Active' ? `Deactivate ${m.name}` : `Reactivate ${m.name}`} onClick={() => toggle(m)} />
                      <IconButton icon={Trash2} tone="danger" label={`Delete ${m.name}`} onClick={() => remove(m)} />
                    </div>
                  ),
                },
              ]}
            />
            <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPage={(p) => set('page', String(p))} noun="medicines" />
          </>
        )}
      </Panel>
      {editing ? <MedicineModal medicine={editing === 'new' ? null : editing} onClose={() => setEditing(null)} categories={categories} /> : null}
    </>
  )
}

function MedicineModal({ medicine, onClose, categories }: { medicine: Medicine | null; onClose: () => void; categories: string[] }) {
  const services = useServices()
  const feedback = useFeedback()
  const allCategories = [...new Set([...MEDICINE_CATEGORIES, ...categories])]
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<MedicineInput>({
    resolver: zodResolver(medicineSchema),
    defaultValues: medicine
      ? {
          name: medicine.name,
          genericName: medicine.genericName,
          brandName: medicine.brandName,
          manufacturer: medicine.manufacturer,
          composition: medicine.composition,
          strength: medicine.strength,
          dosageForm: medicine.dosageForm,
          route: medicine.route,
          category: medicine.category,
          description: medicine.description,
          status: medicine.status,
        }
      : EMPTY,
  })

  const submit = handleSubmit(async (values) => {
    try {
      if (medicine) await services.medicines.update(medicine.medicineId, values)
      else await services.medicines.create(values)
      feedback.success(medicine ? 'Medicine updated' : `${values.name} added to your catalog`)
      onClose()
    } catch (err) {
      if (!applyServerErrors(err, setError)) feedback.error(err)
    }
  })

  return (
    <Modal
      open
      onClose={onClose}
      title={medicine ? `Edit ${medicine.name}` : 'Add a medicine'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={isSubmitting}>
            {medicine ? 'Save changes' : 'Add medicine'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <Field label="Medicine name" required error={errors.name?.message}>
          {(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.name} {...register('name')} />}
        </Field>
        <Field label="Strength" error={errors.strength?.message}>
          {(id) => <Input id={id} placeholder="500 mg" {...register('strength')} />}
        </Field>
        <Field label="Generic name" error={errors.genericName?.message}>
          {(id) => <Input id={id} {...register('genericName')} />}
        </Field>
        <Field label="Brand name" error={errors.brandName?.message}>
          {(id) => <Input id={id} {...register('brandName')} />}
        </Field>
        <Field label="Dosage form">
          {(id) => <Select id={id} options={DOSAGE_FORMS} {...register('dosageForm')} />}
        </Field>
        <Field label="Route">
          {(id) => <Select id={id} options={ROUTES} {...register('route')} />}
        </Field>
        <Field label="Category">
          {(id) => <Select id={id} options={allCategories} placeholder="Uncategorised" {...register('category')} />}
        </Field>
        <Field label="Manufacturer">
          {(id) => <Input id={id} {...register('manufacturer')} />}
        </Field>
        <Field label="Composition" className="sm:col-span-2">
          {(id) => <Input id={id} placeholder="Active ingredients and amounts" {...register('composition')} />}
        </Field>
        <Field label="Description" className="sm:col-span-2">
          {(id) => <Textarea id={id} rows={2} {...register('description')} />}
        </Field>
        <Field label="Status" hint="Inactive medicines are hidden when prescribing but stay on past prescriptions.">
          {(id, d) => <Select id={id} aria-describedby={d} options={MEDICINE_STATUSES} {...register('status')} />}
        </Field>
      </form>
    </Modal>
  )
}
