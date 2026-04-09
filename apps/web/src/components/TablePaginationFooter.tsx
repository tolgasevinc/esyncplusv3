import { useEffect, useCallback } from 'react'
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

export type PageSizeValue = 10 | 25 | 50 | 100 | 'fit' | number

const ROW_HEIGHT_PX = 48
const TABLE_HEADER_PX = 52
const CONTENT_PADDING_PX = 48
const SAFETY_MARGIN_PX = 16
const EXTRA_ROW_SAFETY = 3
const MIN_CONTAINER_HEIGHT_FOR_CALC = 150

function calcFitLimit(containerHeight: number): number {
  if (containerHeight < MIN_CONTAINER_HEIGHT_FOR_CALC) return 10
  const available = containerHeight - CONTENT_PADDING_PX - TABLE_HEADER_PX - SAFETY_MARGIN_PX - EXTRA_ROW_SAFETY * ROW_HEIGHT_PX
  const rows = Math.max(1, Math.floor(available / ROW_HEIGHT_PX))
  return Math.min(100, Math.max(5, rows))
}

interface TablePaginationFooterProps {
  total: number
  page: number
  pageSize: number | 'fit'
  /** Sayfa başı kayıt (pageSize='fit' iken hesaplanan değer) */
  fitLimit?: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: PageSizeValue) => void
  onFitLimitChange?: (limit: number) => void
  tableContainerRef?: React.RefObject<HTMLDivElement | null>
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
  fitLimit = 10,
  onPageChange,
  onPageSizeChange,
  onFitLimitChange,
  tableContainerRef,
  hasFilter,
}: TablePaginationFooterProps) {
  const recalcFit = useCallback(() => {
    if (!tableContainerRef?.current || !onFitLimitChange) return
    const h = tableContainerRef.current.clientHeight
    onFitLimitChange(calcFitLimit(h))
  }, [tableContainerRef, onFitLimitChange])

  useEffect(() => {
    if (pageSize !== 'fit' || !tableContainerRef || !onFitLimitChange) return

    let cancelled = false
    let ro: ResizeObserver | null = null
    let retries = 0
    const MAX_RETRIES = 10

    const run = () => {
      if (cancelled) return
      const el = tableContainerRef?.current
      if (!el) {
        if (retries++ < MAX_RETRIES) requestAnimationFrame(run)
        return
      }
      recalcFit()
      ro = new ResizeObserver(recalcFit)
      ro.observe(el)
    }

    requestAnimationFrame(run)

    return () => {
      cancelled = true
      ro?.disconnect()
    }
  }, [pageSize, tableContainerRef, onFitLimitChange, recalcFit])

  const handlePageSizeClick = (value: PageSizeValue) => {
    if (value === 'fit' && tableContainerRef?.current && onFitLimitChange) {
      const h = tableContainerRef.current.clientHeight
      const fitLimit = calcFitLimit(h)
      onFitLimitChange(fitLimit)
    }
    onPageSizeChange(value)
  }

  const effectiveLimit = pageSize === 'fit' ? fitLimit : pageSize
  const totalPages = Math.max(1, Math.ceil(total / effectiveLimit))
  const start = total === 0 ? 0 : (page - 1) * effectiveLimit + 1
  const end = total === 0 ? 0 : Math.min(page * effectiveLimit, total)
  const rangeText = total === 0 ? '0' : start === end ? `${start}` : `${start}-${end}`

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-sm font-semibold tabular-nums text-red-600 dark:text-red-400 shrink-0">
          Toplam: {total}
        </span>
        <span className="text-sm">
          Kayıt: <span className="font-semibold text-foreground">{rangeText}</span>
          {hasFilter && <span className="text-muted-foreground"> (filtrelenmiş)</span>}
        </span>
        <span className="text-sm">
          Sayfa <span className="font-semibold text-foreground">{page}</span>
          <span className="text-muted-foreground">/{totalPages}</span>
        </span>
        <div className="flex items-center gap-1">
          {PAGE_SIZE_OPTIONS.map((opt) => (
            <Button
              key={String(opt.value)}
              variant={pageSize === opt.value ? 'secondary' : 'outline'}
              size="sm"
              className={`h-7 px-2 text-xs ${pageSize === opt.value ? 'ring-2 ring-primary font-semibold' : ''}`}
              onClick={() => handlePageSizeClick(opt.value)}
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
              className={`h-8 w-8 ${page === n ? 'ring-2 ring-primary font-semibold' : ''}`}
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
