/**
 * Chart wrappers on Recharts with one shared visual system:
 * single-series charts use slot 1 (clinic blue); multi-series use the validated
 * order blue / orange / teal (checked with the dataviz palette validator on #fff).
 * Grids and axes stay recessive; every chart also renders an sr-only data table.
 */
import type { ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'

export const SERIES = ['#2f6dbf', '#eb6834', '#13979a'] as const
const GRID = '#e6ecf1'
const AXIS = '#64768a'
const SURFACE = '#ffffff'

const axisProps = {
  stroke: AXIS,
  tickLine: false,
  axisLine: false,
  fontSize: 12,
  tick: { fill: AXIS },
} as const

function ChartTooltip({ active, payload, label, unit }: TooltipContentProps<number, string> & { unit?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-[13px] shadow-pop">
      <p className="mb-1 font-semibold text-ink">{label}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-2 text-ink-soft">
          <span className="size-2.5 rounded-sm" style={{ background: p.color }} aria-hidden />
          {payload.length > 1 ? <span>{p.name}</span> : null}
          <span className="tabular ml-auto pl-3 font-semibold text-ink">
            {p.value}
            {unit ? ` ${unit}` : ''}
          </span>
        </p>
      ))}
    </div>
  )
}

function SrTable({ caption, headers, rows }: { caption: string; headers: string[]; rows: Array<Array<string | number>> }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ChartFrame({ height, children, empty }: { height: number; children: ReactNode; empty?: boolean }) {
  if (empty) {
    return (
      <div className="grid place-items-center rounded-lg bg-sunken/60 text-sm text-muted" style={{ height }}>
        No data for this period yet
      </div>
    )
  }
  return (
    <div style={{ height }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  )
}

/** One series over ordered categories (months, days). */
export function ColumnChart({
  data,
  caption,
  valueLabel = 'Count',
  height = 220,
}: {
  data: Array<{ label: string; count: number }>
  caption: string
  valueLabel?: string
  height?: number
}) {
  const empty = data.every((d) => d.count === 0)
  return (
    <figure>
      <ChartFrame height={height} empty={empty}>
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -18 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={8} />
          <YAxis allowDecimals={false} {...axisProps} width={44} />
          <Tooltip cursor={{ fill: '#eef3f7' }} content={(p) => <ChartTooltip {...(p as TooltipContentProps<number, string>)} />} />
          <Bar dataKey="count" name={valueLabel} fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
        </BarChart>
      </ChartFrame>
      <SrTable caption={caption} headers={['Period', valueLabel]} rows={data.map((d) => [d.label, d.count])} />
    </figure>
  )
}

/** Stacked columns for up to three named series. */
export function StackedColumnChart<K extends string>({
  data,
  keys,
  caption,
  height = 240,
}: {
  data: Array<{ label: string } & Record<K, number>>
  keys: readonly K[]
  caption: string
  height?: number
}) {
  const empty = data.every((d) => keys.every((k) => (d[k] as number) === 0))
  return (
    <figure>
      <ChartFrame height={height} empty={empty}>
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -18 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis allowDecimals={false} {...axisProps} width={44} />
          <Tooltip cursor={{ fill: '#eef3f7' }} content={(p) => <ChartTooltip {...(p as TooltipContentProps<number, string>)} />} />
          <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12.5, color: AXIS, paddingTop: 6 }} />
          {keys.map((k, i) => (
            <Bar
              key={k}
              dataKey={k}
              name={k}
              stackId="s"
              fill={SERIES[i % SERIES.length]}
              stroke={SURFACE}
              strokeWidth={2}
              radius={i === keys.length - 1 ? [4, 4, 0, 0] : 0}
              maxBarSize={40}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ChartFrame>
      <SrTable caption={caption} headers={['Period', ...keys]} rows={data.map((d) => [d.label, ...keys.map((k) => d[k] as number)])} />
    </figure>
  )
}

/** Ranked list with inline bars: readable on phones, no legend needed. */
export function RankedBars({ data, caption, unit }: { data: Array<{ label: string; count: number }>; caption: string; unit?: string }) {
  const max = Math.max(1, ...data.map((d) => d.count))
  if (data.length === 0) return <div className="grid h-40 place-items-center rounded-lg bg-sunken/60 text-sm text-muted">No data for this period yet</div>
  return (
    <figure>
      <ul className="space-y-3" aria-hidden>
        {data.map((d) => (
          <li key={d.label} title={`${d.label}: ${d.count}${unit ? ' ' + unit : ''}`}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[13.5px]">
              <span className="truncate text-ink-soft">{d.label}</span>
              <span className="tabular font-semibold text-ink">{d.count}</span>
            </div>
            <div className="h-2 rounded-full bg-sunken">
              <div className="h-2 rounded-full" style={{ width: `${(d.count / max) * 100}%`, background: SERIES[0] }} />
            </div>
          </li>
        ))}
      </ul>
      <SrTable caption={caption} headers={['Item', 'Count']} rows={data.map((d) => [d.label, d.count])} />
    </figure>
  )
}

/** Small line chart for one measure (or two of the same unit, e.g. systolic/diastolic). */
export function TrendLines({
  data,
  lines,
  caption,
  unit,
  height = 160,
}: {
  data: Array<Record<string, string | number | null>>
  lines: Array<{ key: string; name: string }>
  caption: string
  unit?: string
  height?: number
}) {
  const empty = data.every((d) => lines.every((l) => d[l.key] == null))
  // A tidy whole-number domain with a little headroom keeps tick labels short and unclipped.
  const values = data.flatMap((d) => lines.map((l) => d[l.key])).filter((v): v is number => typeof v === 'number')
  const lo = values.length ? Math.min(...values) : 0
  const hi = values.length ? Math.max(...values) : 1
  const rawStep = Math.max(1, (hi - lo) / 3)
  const mag = 10 ** Math.floor(Math.log10(rawStep))
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= rawStep) ?? 10 * mag
  const domain: [number, number] = [Math.floor(lo / step) * step - (lo % step === 0 ? step : 0), Math.ceil(hi / step) * step + (hi % step === 0 ? step : 0)]
  const ticks: number[] = []
  for (let t = domain[0]; t <= domain[1] + 1e-9; t += step) ticks.push(Math.round(t * 100) / 100)
  return (
    <figure>
      <ChartFrame height={height} empty={empty}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" {...axisProps} interval={data.length <= 6 ? 0 : 'preserveStartEnd'} minTickGap={12} padding={{ left: 12, right: 12 }} />
          <YAxis {...axisProps} width={40} domain={domain} ticks={ticks} />
          <Tooltip cursor={{ stroke: AXIS, strokeDasharray: '3 3' }} content={(p) => <ChartTooltip {...(p as TooltipContentProps<number, string>)} unit={unit} />} />
          {lines.length > 1 ? <Legend iconType="plainline" iconSize={14} wrapperStyle={{ fontSize: 12.5, color: AXIS }} /> : null}
          {lines.map((l, i) => (
            <Line
              key={l.key}
              type="monotone"
              dataKey={l.key}
              name={l.name}
              stroke={SERIES[i]}
              strokeWidth={2}
              dot={{ r: 4, strokeWidth: 2, stroke: SURFACE, fill: SERIES[i] }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: SURFACE }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ChartFrame>
      <SrTable caption={caption} headers={['Visit', ...lines.map((l) => l.name)]} rows={data.map((d) => [String(d.label), ...lines.map((l) => (d[l.key] ?? '—') as string | number)])} />
    </figure>
  )
}
