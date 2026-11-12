import { TrendLines } from '@/components/charts/Charts'
import type { VitalsPoint } from '@/services/visitService'
import { formatDate } from '@/utils/dates'

/** Small multiples so each measure keeps its own scale (never a dual axis). */
export function VitalsTrends({ points }: { points: VitalsPoint[] }) {
  if (points.length < 2) {
    return <p className="rounded-lg bg-sunken/60 px-4 py-6 text-center text-sm text-muted">Trends appear once the patient has two or more visits with vitals.</p>
  }
  const data = points.map((p) => ({ ...p, label: formatDate(p.date, 'd MMM yy') }))
  const hasBp = points.some((p) => p.bpSystolic != null)
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {hasBp ? (
        <div>
          <h3 className="mb-2 text-[13.5px] font-semibold text-ink-soft">Blood pressure (mmHg)</h3>
          <TrendLines
            data={data}
            unit="mmHg"
            caption="Blood pressure by visit"
            lines={[
              { key: 'bpSystolic', name: 'Systolic' },
              { key: 'bpDiastolic', name: 'Diastolic' },
            ]}
          />
        </div>
      ) : null}
      <div>
        <h3 className="mb-2 text-[13.5px] font-semibold text-ink-soft">Heart rate (bpm)</h3>
        <TrendLines data={data} unit="bpm" caption="Heart rate by visit" lines={[{ key: 'heartRate', name: 'Heart rate' }]} />
      </div>
      <div>
        <h3 className="mb-2 text-[13.5px] font-semibold text-ink-soft">Weight (kg)</h3>
        <TrendLines data={data} unit="kg" caption="Weight by visit" lines={[{ key: 'weightKg', name: 'Weight' }]} />
      </div>
      <div>
        <h3 className="mb-2 text-[13.5px] font-semibold text-ink-soft">Temperature (°F)</h3>
        <TrendLines data={data} unit="°F" caption="Temperature by visit" lines={[{ key: 'temperatureF', name: 'Temperature' }]} />
      </div>
    </div>
  )
}
