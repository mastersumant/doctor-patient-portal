import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { errorMessage } from '@/services/errors'

type ToastTone = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  tone: ToastTone
  message: string
}

interface ConfirmOptions {
  title: string
  message: ReactNode
  confirmLabel: string
  tone?: 'danger' | 'primary'
}

interface FeedbackApi {
  toast: (message: string, tone?: ToastTone) => void
  success: (message: string) => void
  error: (err: unknown) => void
  confirm: (opts: ConfirmOptions) => Promise<boolean>
}

const FeedbackCtx = createContext<FeedbackApi | null>(null)

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [pending, setPending] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((v: boolean) => void) | null>(null)
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const toast = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = nextId.current++
      setToasts((t) => [...t.slice(-3), { id, tone, message }])
      setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 3500)
    },
    [dismiss],
  )

  const confirm = useCallback((opts: ConfirmOptions) => {
    setPending(opts)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const close = (result: boolean) => {
    resolver.current?.(result)
    resolver.current = null
    setPending(null)
  }

  const api = useMemo<FeedbackApi>(
    () => ({
      toast,
      success: (m) => toast(m, 'success'),
      error: (err) => toast(errorMessage(err), 'error'),
      confirm,
    }),
    [toast, confirm],
  )

  const icon = { success: CheckCircle2, error: CircleAlert, info: Info }
  const tones = {
    success: 'border-ok-100 text-ok-700 [&_svg]:text-ok-600',
    error: 'border-danger-100 text-danger-700 [&_svg]:text-danger-600',
    info: 'border-brand-100 text-ink [&_svg]:text-brand-600',
  }

  return (
    <FeedbackCtx.Provider value={api}>
      {children}
      <div className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6" aria-live="polite">
        {toasts.map((t) => {
          const Icon = icon[t.tone]
          return (
            <div
              key={t.id}
              role={t.tone === 'error' ? 'alert' : 'status'}
              className={`animate-toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[var(--radius-control)] border bg-surface px-4 py-3 shadow-pop ${tones[t.tone]}`}
            >
              <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p className="flex-1 text-sm leading-snug">{t.message}</p>
              <button onClick={() => dismiss(t.id)} className="text-muted hover:text-ink" aria-label="Dismiss notification">
                <X className="size-4" />
              </button>
            </div>
          )
        })}
      </div>
      <Modal open={!!pending} onClose={() => close(false)} title={pending?.title ?? ''} size="sm">
        <div className="text-sm text-ink-soft">{pending?.message}</div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => close(false)}>
            Keep it
          </Button>
          <Button variant={pending?.tone === 'danger' ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
            {pending?.confirmLabel}
          </Button>
        </div>
      </Modal>
    </FeedbackCtx.Provider>
  )
}

export function useFeedback(): FeedbackApi {
  const ctx = useContext(FeedbackCtx)
  if (!ctx) throw new Error('useFeedback must be used inside <FeedbackProvider>')
  return ctx
}
