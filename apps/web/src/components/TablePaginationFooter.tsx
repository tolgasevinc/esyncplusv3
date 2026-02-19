import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const PAGE_SIZE_OPTIONS = [
  { value: 'fit', label: 'Sığdır' },
  { value: 10, label: '10' },
  { value: 25, label: '25' },
  { value: 50, label: '50' },
  { value: 100, label: '100' },
] as const

export type PageSizeValue = 10 | 25 | 50 | 100 | 'fit'

interface TablePaginationFooterProps {
  total: number
  page: number
  pageSize: number | 'fit'
  onPageChange: (page: number) => void
  onPageSizeChange: (size: PageSizeValue) => void
  hasFilter?: boolean
}

function getPageNumbers(current: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }
  const result: (number | 'ellipsis')[] = []
  if (current <= 4) {
    result.push(1, 2, 3, 4, 5, 'ellipsis', totalPages)
  } else if (current >= totalPages - 3) {
    result.push(1, 'ellipsis', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages)
  } else {
    result.push(1, 'ellipsis', current - 1, current, current + 1, 'ellipsis', totalPages)
  }
  return result
}

export function TablePaginationFooter({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  hasFilter,
}: TablePaginationFooterProps) {
  const limit = pageSize === 'fit' ? 9999 : pageSize
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const showing = total === 0 ? 0 : Math.min(limit, Math.max(0, total - (page - 1) * limit))

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <span className="text-sm">
          Kayıt: {showing}/{total}
          {hasFilter && ' (filtrelenmiş)'}
        </span>
        <span className="text-sm text-muted-foreground">
          Sayfa {page}/{totalPages}
        </span>
        <div className="flex items-center gap-1">
          {PAGE_SIZE_OPTIONS.map((opt) => (
            <Button
              key={String(opt.value)}
              variant={pageSize === opt.value ? 'secondary' : 'outline'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onPageSizeChange(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-block">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page <= 1}
                onClick={() => onPageChange(1)}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>İlk sayfa</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-block">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page <= 1}
                onClick={() => onPageChange(Math.max(1, page - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Önceki sayfa</TooltipContent>
        </Tooltip>
        {getPageNumbers(page, totalPages).map((n, i) =>
          n === 'ellipsis' ? (
            <span key={`e-${i}`} className="px-1 text-muted-foreground">
              ..
            </span>
          ) : (
            <Button
              key={n}
              variant={page === n ? 'secondary' : 'outline'}
              size="icon"
              className="h-8 w-8"
              onClick={() => onPageChange(n)}
            >
              {n}
            </Button>
          )
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-block">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page >= totalPages}
                onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Sonraki sayfa</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-block">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page >= totalPages}
                onClick={() => onPageChange(totalPages)}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Son sayfa</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
