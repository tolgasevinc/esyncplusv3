import { toast as sonnerToast } from 'sonner'
import { useState } from 'react'
import { CheckCircle, XCircle, AlertTriangle, Copy, Check, X } from 'lucide-react'

/** Olumlu işlem - yeşil */
export function toastSuccess(title: string, description?: string) {
  sonnerToast.success(title, {
    description,
    icon: <CheckCircle className="h-5 w-5 text-green-600" />,
  })
}

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
        <Check className="pointer-events-none h-4 w-4 text-green-600" aria-hidden />
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

/** Uyarı - turuncu; otomatik kaybolmaz ve kopyalanabilir */
export function toastWarning(title: string, description?: string | Error | unknown) {
  const desc = toToastDescription(description)
  const fullText = desc ? `${title}\n\n${desc}` : title

  sonnerToast.custom(
    (toastId) => (
      <div
        className="flex w-full max-w-[420px] items-start gap-3 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <AlertTriangle className="pointer-events-none h-5 w-5 shrink-0 text-orange-500" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-semibold leading-snug">{title}</p>
          {desc ? (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{desc}</p>
          ) : null}
        </div>
        <div className="flex items-start gap-1">
          <CopyToastButton text={fullText} label="Uyarı metnini kopyala" />
          <CloseToastButton toastId={toastId} />
        </div>
      </div>
    ),
    { duration: Infinity, dismissible: false }
  )
}

/** Başarısız işlem - kırmızı; başlık + açıklama panoya kopyalanır */
export function toastError(title: string, description?: string | Error | unknown) {
  const desc = toToastDescription(description)
  const fullText = desc ? `${title}\n\n${desc}` : title

  sonnerToast.custom(
    (toastId) => (
      <div
        className="flex w-full max-w-[420px] items-start gap-3 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <XCircle className="pointer-events-none h-5 w-5 shrink-0 text-red-600" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-semibold leading-snug">{title}</p>
          {desc ? (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{desc}</p>
          ) : null}
        </div>
        <div className="flex items-start gap-1">
          <CopyToastButton text={fullText} label="Hata metnini kopyala" />
          <CloseToastButton toastId={toastId} />
        </div>
      </div>
    ),
    { duration: Infinity, dismissible: false }
  )
}
