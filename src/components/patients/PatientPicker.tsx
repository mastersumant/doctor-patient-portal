import { useEffect, useState } from 'react'
import { Autocomplete } from '@/components/ui/Autocomplete'
import { useServices } from '@/context/ServicesContext'
import type { PatientOption } from '@/services/patientService'

/** Search-as-you-type patient selector. Stores the patient ID, shows the name. */
export function PatientPicker({
  id,
  value,
  onChange,
  invalid,
  disabled,
  describedBy,
}: {
  id?: string
  value: string
  onChange: (patientId: string, option: PatientOption | null) => void
  invalid?: boolean
  disabled?: boolean
  describedBy?: string
}) {
  const services = useServices()
  const [text, setText] = useState('')

  useEffect(() => {
    let cancelled = false
    if (!value) return
    services.patients
      .get(value)
      .then((p) => !cancelled && setText(`${p.fullName} (${p.patientId})`))
      .catch(() => !cancelled && setText(''))
    return () => {
      cancelled = true
    }
  }, [value, services])

  return (
    <Autocomplete<PatientOption>
      id={id}
      value={text}
      disabled={disabled}
      invalid={invalid}
      describedBy={describedBy}
      placeholder="Search by name, ID or mobile"
      onChange={(t) => {
        setText(t)
        if (value) onChange('', null)
      }}
      onPick={(p) => {
        setText(`${p.fullName} (${p.patientId})`)
        onChange(p.patientId, p)
      }}
      fetchItems={(term) => services.patients.search(term, 8)}
      itemKey={(p) => p.patientId}
      emptyText="No patients match. Register the patient first."
      renderItem={(p) => (
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold text-ink">{p.fullName}</span>
          <span className="tabular text-[12.5px] text-muted">
            {p.patientId}, {p.age} y, {p.mobile}
          </span>
        </div>
      )}
    />
  )
}
