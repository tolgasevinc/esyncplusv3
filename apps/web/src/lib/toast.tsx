import { toast as sonnerToast } from 'sonner'
import { useState } from 'react'
import { CheckCircle, XCircle, AlertTriangle, Copy, Check, X } from 'lucide-react'

const toastSurface =
  'flex w-full max-w-[min(100vw-2rem,420px)] items-start gap-3 rounded-lg border bg-card p-4 text-card-foreground shadow-md ring-1 ring-black/5 dark:ring-white/10'

function toToastDescription(d: unknown): string | undefined {
  if (d === undefined || d === null) return undefined
  if (typeof d === 'string') return d
  if (d instanceof Error) return d.message
  return String(d)
}

function CopyToastButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={async (e) => {
        e.preventDefault()
        e.stopPropagation()
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 2000)
        } catch {
          /* ignore */
        }
      }}
      title={label}
      aria-label={label}
    >
      {copied ? (
        <Check className="pointer-events-none h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
      ) : (
        <Copy className="pointer-events-none h-4 w-4" aria-hidden />
      )}
    </button>
  )
}

function CloseToastButton({ toastId }: { toastId: string | number }) {
  return (
    <button
      type="button"
      className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        sonnerToast.dismiss(toastId)
      }}
      title="Kapat"
      aria-label="Kapat"
    >
      <X className="pointer-events-none h-4 w-4" aria-hidden />
    </button>
  )
}

type ToastTone = 'success' | 'warning' | 'error'

function ToastBody({
  tone,
  title,
  description,
  toastId,
  fullText,
}: {
  tone: ToastTone
  title: string
  description?: string
  /** Uyarı / hata: kapat ve kopyala */
  toastId?: string | number
  fullText: string
}) {
  const icon =
    tone === 'success' ? (
      <CheckCircle className="pointer-events-none h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
    ) : tone === 'warning' ? (
      <AlertTriangle className="pointer-events-none h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
    ) : (
      <XCircle className="pointer-events-none h-5 w-5 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
    )

  const border =
    tone === 'success'
      ? 'border-emerald-500/25'
      : tone === 'warning'
        ? 'border-amber-500/30'
        : 'border-red-500/25'

  const showActions = tone !== 'success' && toastId !== undefined

  return (
    <div
      className={`${toastSurface} ${border}`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {icon}
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-semibold leading-snug text-card-foreground">{title}</p>
        {description ? (
          <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap break-words">{description}</p>
        ) : null}
      </div>
      {showActions ? (
        <div className="flex items-start gap-1">
          <CopyToastButton
            text={fullText}
            label={tone === 'warning' ? 'Uyarı metnini kopyala' : 'Hata metnini kopyala'}
          />
          <CloseToastButton toastId={toastId} />
        </div>
      ) : null}
    </div>
  )
}

/** Olumlu işlem */
export function toastSuccess(title: string, description?: string) {
  const fullText = description ? `${title}\n\n${description}` : title
  sonnerToast.custom(
    () => <ToastBody tone="success" title={title} description={description} fullText={fullText} />,
    { duration: 4000 }
  )
}

/** Uyarı; otomatik kaybolmaz ve kopyalanabilir */
export function toastWarning(title: string, description?: string | Error | unknown) {
  const desc = toToastDescription(description)
  const fullText = desc ? `${title}\n\n${desc}` : title

  sonnerToast.custom(
    (toastId) => (
      <ToastBody tone="warning" title={title} description={desc} toastId={toastId} fullText={fullText} />
    ),
    { duration: Infinity, dismissible: false }
  )
}

/** Hata; başlık + açıklama panoya kopyalanır */
export function toastError(title: string, description?: string | Error | unknown) {
  const desc = toToastDescription(description)
  const fullText = desc ? `${title}\n\n${desc}` : title

  sonnerToast.custom(
    (toastId) => (
      <ToastBody tone="error" title={title} description={desc} toastId={toastId} fullText={fullText} />
    ),
    { duration: Infinity, dismissible: false }
  )
}
