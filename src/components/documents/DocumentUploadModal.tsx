import { zodResolver } from '@hookform/resolvers/zod'
import { Paperclip } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { ALLOWED_UPLOAD_TYPES, DOCUMENT_TYPES, MAX_UPLOAD_BYTES } from '@/domain/constants'
import { useFeedback } from '@/context/FeedbackContext'
import { useServices } from '@/context/ServicesContext'
import { useQuery } from '@/hooks/useQuery'
import { documentSchema, type DocumentInput } from '@/validations/schemas'
import { formatDateTime, todayIso } from '@/utils/dates'
import { formatBytes } from '@/utils/format'
import { applyServerErrors } from '@/utils/forms'
import { ValidationError } from '@/services/errors'

export function DocumentUploadModal({ open, onClose, patientId }: { open: boolean; onClose: () => void; patientId: string }) {
  const services = useServices()
  const feedback = useFeedback()
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const { data: visits = [] } = useQuery((s) => s.visits.listForPatient(patientId), [patientId])

  const {
    register,
    handleSubmit,
    setError,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<DocumentInput>({
    resolver: zodResolver(documentSchema),
    defaultValues: { patientId, visitId: '', name: '', type: 'Blood Test Report', description: '', uploadDate: todayIso() },
  })

  const close = () => {
    reset()
    setFile(null)
    setFileError(null)
    onClose()
  }

  const submit = handleSubmit(async (values) => {
    if (!file) {
      setFileError('Choose a file to upload')
      return
    }
    try {
      await services.documents.upload(values, file)
      feedback.success('Document added')
      close()
    } catch (err) {
      if (err instanceof ValidationError && err.fieldErrors.file) {
        setFileError(err.fieldErrors.file)
      } else if (!applyServerErrors(err, setError)) feedback.error(err)
    }
  })

  return (
    <Modal
      open={open}
      onClose={close}
      title="Add a report or document"
      description={`PDF, JPEG, PNG or WebP up to ${formatBytes(MAX_UPLOAD_BYTES)}. Files stay on this device.`}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button onClick={submit} loading={isSubmitting} icon={Paperclip}>
            Add document
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <Field label="File" required error={fileError ?? undefined} className="sm:col-span-2">
          {(id, d) => (
            <input
              id={id}
              aria-describedby={d}
              type="file"
              accept={Object.keys(ALLOWED_UPLOAD_TYPES).join(',')}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                setFileError(null)
                if (f && f.size > MAX_UPLOAD_BYTES) {
                  setFileError(`Files must be ${formatBytes(MAX_UPLOAD_BYTES)} or smaller`)
                  setFile(null)
                  return
                }
                if (f && !ALLOWED_UPLOAD_TYPES[f.type]) {
                  setFileError('Upload a PDF, JPEG, PNG or WebP file')
                  setFile(null)
                  return
                }
                setFile(f)
                if (f) setValue('name', f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '), { shouldValidate: true })
              }}
              className="block w-full text-sm text-ink-soft file:mr-3 file:rounded-[var(--radius-control)] file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
            />
          )}
        </Field>
        <Field label="Document name" required error={errors.name?.message} className="sm:col-span-2">
          {(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.name} {...register('name')} />}
        </Field>
        <Field label="Type" required error={errors.type?.message}>
          {(id) => <Select id={id} options={DOCUMENT_TYPES} {...register('type')} />}
        </Field>
        <Field label="Report date" required error={errors.uploadDate?.message}>
          {(id, d) => <Input id={id} aria-describedby={d} type="date" invalid={!!errors.uploadDate} {...register('uploadDate')} />}
        </Field>
        <Field label="Related visit" hint="Optional" className="sm:col-span-2">
          {(id, d) => (
            <Select
              id={id}
              aria-describedby={d}
              placeholder="Not linked to a visit"
              options={visits.map((v) => ({ value: v.visitId, label: `${formatDateTime(v.visitDateTime)}: ${v.chiefComplaint}` }))}
              {...register('visitId')}
            />
          )}
        </Field>
        <Field label="Description" error={errors.description?.message} className="sm:col-span-2">
          {(id) => <Textarea id={id} rows={2} {...register('description')} />}
        </Field>
      </form>
    </Modal>
  )
}
