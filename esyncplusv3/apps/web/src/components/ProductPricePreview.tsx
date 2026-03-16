import { useState, useEffect, useRef, useCallback } from 'react'
import { Copy } from 'lucide-react'
import { API_URL } from '@/lib/api'
import { formatPrice } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toastSuccess } from '@/lib/toast'
import { applyCalculation, findRuleForBrand, type CalculationRule } from '@/lib/calculations'

interface PriceRow {
  label: string
  price: number
  currencyId: number | null
  currencySymbol: string
  currencyCode: string
  /** Hesaplamadan türetildi (store'da yok) */
  isCalculated?: boolean
}

interface ProductPricePreviewProps {
  productId: number
  displayPrice: string
  priceTypes: { id: number; name: string }[]
  currencies: { id: number; name: string; code?: string; symbol?: string }[]
  exchangeRates: Record<string, number>
  calculationRules?: CalculationRule[]
}

function toTL(price: number, currencyCode: string, rates: Record<string, number>): number | null {
  const code = (currencyCode || '').toUpperCase()
  if (code === 'TRY' || code === 'TL' || code === '') return price
  const rate = rates[code]
  if (rate == null || rate <= 0) return null
  return price * rate
}

export function ProductPricePreview({
  productId,
  displayPrice,
  priceTypes,
  currencies,
  exchangeRates,
  calculationRules = [],
}: ProductPricePreviewProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<PriceRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fetchRef = useRef<AbortController | null>(null)

  const fetchProduct = useCallback(async () => {
    if (fetchRef.current) fetchRef.current.abort()
    fetchRef.current = new AbortController()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/products/${productId}`, {
        signal: fetchRef.current.signal,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Yüklenemedi')
      const product = json as {
        price?: number
        currency_id?: number | null
        brand_id?: number | null
        prices?: { price_type_id: number; price?: number; currency_id?: number | null }[]
      }
      const curById = Object.fromEntries(currencies.map((c) => [c.id, c]))
      const result: PriceRow[] = []

      const basePrice = Number(product.price) ?? 0
      const baseCurId = product.currency_id ?? null
      const baseCur = baseCurId ? curById[baseCurId] : null
      result.push({
        label: 'Genel Fiyat',
        price: basePrice,
        currencyId: baseCurId,
        currencySymbol: baseCur?.symbol ?? '',
        currencyCode: baseCur?.code ?? '',
      })

      const pricesMap = new Map(
        (product.prices ?? []).map((p) => [
          p.price_type_id,
          {
            price: p.price ?? 0,
            currencyId: p.currency_id ?? null,
          },
        ])
      )
      for (const pt of priceTypes) {
        const data = pricesMap.get(pt.id)
        if (data) {
          const cur = data.currencyId ? curById[data.currencyId] : null
          result.push({
            label: pt.name,
            price: data.price,
            currencyId: data.currencyId,
            currencySymbol: cur?.symbol ?? '',
            currencyCode: cur?.code ?? '',
          })
        } else {
          const rule = findRuleForBrand(
            calculationRules.filter((r) => r.source === 'price'),
            String(pt.id),
            product.brand_id ?? null
          )
          if (rule?.operations?.length) {
            const computed = applyCalculation(basePrice, rule.operations)
            const ruleCurId = rule.result_currency_id != null && rule.result_currency_id > 0 ? rule.result_currency_id : baseCurId
            const cur = ruleCurId ? curById[ruleCurId] : baseCur
            result.push({
              label: pt.name,
              price: computed,
              currencyId: ruleCurId,
              currencySymbol: cur?.symbol ?? '',
              currencyCode: cur?.code ?? '',
              isCalculated: true,
            })
          }
        }
      }
      setRows(result)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'Yüklenemedi')
        setRows([])
      }
    } finally {
      setLoading(false)
      fetchRef.current = null
    }
  }, [productId, currencies, priceTypes, calculationRules])

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setOpen(true)
      fetchProduct()
    }, 250)
  }

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setOpen(false)
      timeoutRef.current = null
    }, 200)
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (fetchRef.current) fetchRef.current.abort()
    }
  }, [])

  const content = (
    <div className="min-w-[340px] p-0">
      <div className="text-xs font-medium text-muted-foreground mb-2">Fiyat seçenekleri</div>
      {loading ? (
        <div className="text-sm text-muted-foreground py-2">Yükleniyor...</div>
      ) : error ? (
        <div className="text-sm text-destructive py-2">{error}</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground py-2">Fiyat bilgisi yok</div>
      ) : (
        <>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4 gap-y-2 text-sm items-center whitespace-nowrap">
          <div className="text-xs text-muted-foreground font-medium">Fiyat tipi</div>
          <div className="text-xs text-muted-foreground font-medium text-right">Döviz</div>
          <div className="text-xs text-muted-foreground font-medium text-right">TL</div>
          {rows.map((r, idx) => {
            const tlVal = toTL(r.price, r.currencyCode, exchangeRates)
            const numericStr = String(r.price)
            const tlValStr = tlVal != null ? String(tlVal) : ''
            const copyNumeric = (val: string) => {
              navigator.clipboard.writeText(val)
              toastSuccess('Kopyalandı', val)
            }
            const isTr = !r.currencyCode || r.currencyCode === 'TRY' || r.currencyCode === 'TL'
            const tlDisplay = tlVal != null ? formatPrice(tlVal) : '—'
            return (
              <div key={`${r.label}-${idx}`} className="contents">
                <span className="text-muted-foreground">{r.label}{r.isCalculated ? ' *' : ''}</span>
                <div className="flex items-center justify-end gap-0.5">
                  {isTr ? (
                    <span className="text-muted-foreground/70">—</span>
                  ) : (
                    <>
                      <span className="tabular-nums">{formatPrice(r.price)} {r.currencySymbol || ''}</span>
                      <button
                        type="button"
                        title={`Fiyatı kopyala (${numericStr})`}
                        onClick={(e) => { e.stopPropagation(); copyNumeric(numericStr) }}
                        className="p-1 rounded hover:bg-muted"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>
                <div className="flex items-center justify-end gap-0.5">
                  {tlVal != null ? (
                    <>
                      <span className="tabular-nums text-red-600 font-medium">{tlDisplay} ₺</span>
                      <button
                        type="button"
                        title={`TL kopyala (${tlValStr})`}
                        onClick={(e) => { e.stopPropagation(); copyNumeric(tlValStr) }}
                        className="p-1 rounded hover:bg-muted text-red-600"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        {rows.some((r) => r.isCalculated) && (
          <p className="text-[10px] text-muted-foreground mt-2">* Hesaplamadan türetildi</p>
        )}
        </>
      )}
    </div>
  )

  return (
    <Tooltip open={open} onOpenChange={setOpen} delayDuration={0}>
      <TooltipTrigger asChild>
        <span
          className="cursor-help underline decoration-dotted decoration-muted-foreground/50 inline-block"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onClick={(e) => e.stopPropagation()}
        >
          {displayPrice}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        align="end"
        sideOffset={6}
        className="max-w-[420px]"
        onMouseEnter={() => {
          if (timeoutRef.current) clearTimeout(timeoutRef.current)
          timeoutRef.current = null
        }}
        onMouseLeave={handleMouseLeave}
      >
        {content}
      </TooltipContent>
    </Tooltip>
  )
}
