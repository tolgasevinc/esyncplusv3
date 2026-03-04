import { cn } from '@/lib/utils'

interface LoaderProps {
  className?: string
}

export function Loader({ className }: LoaderProps) {
  return (
    <div className={cn('loader-bounce', className)} role="status" aria-label="Yükleniyor" />
  )
}
