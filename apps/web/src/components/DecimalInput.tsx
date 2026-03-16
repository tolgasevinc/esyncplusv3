import React, { useState, useEffect, forwardRef } from 'react'
import { Input } from '@/components/ui/input'
import { parseDecimal } from '@/lib/utils'

interface DecimalInputProps extends Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'> {
  value: number
  onChange: (value: number) => void
  /** Ondalık basamak sayısı (varsayılan 4) */
  maxDecimals?: number
  /** Virgülden sonra her zaman gösterilecek minimum hane (örn. fiyat için 2 → 123,00) */
  minDecimals?: number
}

/** Virgül veya nokta ile ondalık girişi destekler. "1," yazarken virgül korunur. */
export const DecimalInput = forwardRef<HTMLInputElement, DecimalInputProps>(function DecimalInput(
  { value, onChange, maxDecimals = 4, minDecimals, onBlur: onBlurProp, ...props },
  ref
) {
  const [local, setLocal] = useState<string | null>(null)

  useEffect(() => {
    setLocal(null)
  }, [value])

  const fractionOpts =
    minDecimals != null
      ? { minimumFractionDigits: minDecimals, maximumFractionDigits: minDecimals }
      : { minimumFractionDigits: 0, maximumFractionDigits: maxDecimals }

  const display =
    local !== null
      ? local
      : value === 0 && minDecimals == null
        ? ''
        : value.toLocaleString('tr-TR', fractionOpts)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    const trimmed = v.trim()

    if (trimmed === '') {
      setLocal(null)
      onChange(0)
      return
    }

    if (/[,.]$/.test(trimmed)) {
      setLocal(trimmed)
      return
    }

    const parsed = parseDecimal(trimmed)
    setLocal(null)
    onChange(parsed)
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (local !== null) {
      const parsed = parseDecimal(local)
      onChange(parsed)
      setLocal(null)
    }
    onBlurProp?.(e)
  }

  return (
    <Input
      ref={ref}
      type="text"
      inputMode="decimal"
      value={display}
      onChange={handleChange}
      onBlur={handleBlur}
      {...props}
    />
  )
})
