import { Check, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export type IdeasoftTransferReportStep = {
  id: string
  label: string
  ok: boolean
  detail?: string
}

export function IdeasoftTransferReportDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  steps: IdeasoftTransferReportStep[] | null
}) {
  const { open, onOpenChange, title = 'Ideasoft aktarım özeti', steps } = props
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <ul className="max-h-[min(60vh,24rem)] space-y-3 overflow-y-auto py-1">
          {(steps ?? []).map((s) => (
            <li key={s.id} className="flex gap-3 text-sm">
              <span className="mt-0.5 shrink-0" aria-hidden>
                {s.ok ? (
                  <Check className="h-5 w-5 text-emerald-600 dark:text-emerald-500" />
                ) : (
                  <X className="h-5 w-5 text-destructive" />
                )}
              </span>
              <div className="min-w-0">
                <div className="font-medium leading-snug">{s.label}</div>
                {s.detail ? (
                  <div className="mt-0.5 text-xs leading-snug text-muted-foreground">{s.detail}</div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Kapat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
