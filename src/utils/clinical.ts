/** Body-mass index from kg and cm, rounded to one decimal. */
export function calculateBmi(weightKg: number | null, heightCm: number | null): number | null {
  if (!weightKg || !heightCm || heightCm <= 0) return null
  const m = heightCm / 100
  return Math.round((weightKg / (m * m)) * 10) / 10
}

export type BmiBand = { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' }

/** WHO adult bands. Not meaningful for children; callers decide when to show it. */
export function bmiBand(bmi: number | null): BmiBand {
  if (bmi == null) return { label: '—', tone: 'neutral' }
  if (bmi < 18.5) return { label: 'Underweight', tone: 'warn' }
  if (bmi < 25) return { label: 'Healthy range', tone: 'ok' }
  if (bmi < 30) return { label: 'Overweight', tone: 'warn' }
  return { label: 'Obese', tone: 'danger' }
}

export function formatBp(sys: number | null, dia: number | null): string {
  return sys && dia ? `${sys}/${dia}` : '—'
}

export function toNumberOrNull(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const trimmed = value.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

export function numberToInput(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value)
}
