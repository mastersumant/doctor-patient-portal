/** Cross with a green "status" dot: care plus follow-through. */
export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--color-brand-600)" />
      <path d="M13 7h6v6h6v6h-6v6h-6v-6H7v-6h6z" fill="#fff" />
      <circle cx="24.5" cy="24.5" r="3.5" fill="var(--color-ok-600)" stroke="var(--color-brand-600)" strokeWidth="1.5" />
    </svg>
  )
}
