import { toast as sonnerToast } from 'sonner'
import { useState } from 'react'
import { CheckCircle, XCircle, AlertTriangle, Copy, Check } from 'lucide-react'

/** Olumlu işlem - yeşil */
export function toastSuccess(title: string, description?: string) {
  sonnerToast.success(title, {
    description,
    icon: <CheckCircle className="h-5 w-5 text-green-600" />,
  })
}

/** Uyarı - turuncu */
export function toastWarning(title: string, description?: string) {
  sonnerToast.warning(title, {
    description,
    icon: <AlertTriangle className="h-5 w-5 text-orange-500" />,
  })
}

function toErrorDescription(d: unknown): string | undefined {
  if (d === undefined || d === null) return undefined
  if (typeof d === 'string') return d
  if (d instanceof Error) return d.message
  return String(d)
}

function CopyErrorToastButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
      title="Metni kopyala"
      aria-label="Hata metnini kopyala"
    >
      {copied ? <Check className="h-4 w-4 text-green-600" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
    </button>
  )
}

/** Başarısız işlem - kırmızı; başlık + açıklama panoya kopyalanır */
export function toastError(title: string, description?: string | Error | unknown) {
  const desc = toErrorDescription(description)
  const fullText = desc ? `${title}\n\n${desc}` : title

  sonnerToast.custom(
    () => (
      <div className="flex w-full max-w-[420px] items-start gap-3 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg">
        <XCircle className="h-5 w-5 shrink-0 text-red-600" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-semibold leading-snug">{title}</p>
          {desc ? (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{desc}</p>
          ) : null}
        </div>
        <CopyErrorToastButton text={fullText} />
      </div>
    ),
    { duration: 6000 }
  )
}
