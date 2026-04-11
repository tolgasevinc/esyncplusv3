import React, { useMemo, useState, forwardRef } from 'react'
import { Input } from '@/components/ui/input'
import { parseDecimal } from '@/lib/utils'

interface DecimalInputProps extends Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'> {
  value: number
  onChange: (value: number) => void
  /** Ondalık basamak sayısı (varsayılan 4) */
  maxDecimals?: number
  /** Odak dışıyken gösterim: en az bu kadar ondalık (örn. 2 → 123,00) */
  minDecimals?: number
}

/**
 * Ondalık giriş (tr-TR: virgül). Odaktayken metin olduğu gibi tutulur; her tuşta sayıya çevirip
 * locale ile yeniden formatlamaz — imleç kayması ve "nokta sonrasına atlama" olmaz.
 */
export const DecimalInput = forwardRef<HTMLInputElement, DecimalInputProps>(function DecimalInput(
  { value, onChange, maxDecimals = 4, minDecimals, onBlur: onBlurProp, onFocus: onFocusProp, ...props },
  ref
) {
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState('')

  const nfEdit = useMemo(
    () =>
      new Intl.NumberFormat('tr-TR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: maxDecimals,
        useGrouping: false,
      }),
    [maxDecimals]
  )

  const formatBlurred = () => {
    if (value === 0 && minDecimals == null) return ''
    const fractionOpts =
      minDecimals != null
        ? { minimumFractionDigits: minDecimals, maximumFractionDigits: minDecimals }
        : { minimumFractionDigits: 0, maximumFractionDigits: maxDecimals }
    return value.toLocaleString('tr-TR', fractionOpts)
  }

  const display = focused ? draft : formatBlurred()

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setFocused(true)
    setDraft(value === 0 ? '' : nfEdit.format(value))
    onFocusProp?.(e)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setDraft(v)
    const trimmed = v.trim()

    if (trimmed === '') {
      onChange(0)
      return
    }

    if (/[,.]$/.test(trimmed)) {
      return
    }

    const parsed = parseDecimal(trimmed.replace(/\s/g, ''))
    onChange(parsed)
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const parsed = parseDecimal(draft.trim().replace(/\s/g, ''))
    onChange(parsed)
    setFocused(false)
    setDraft('')
    onBlurProp?.(e)
  }

  return (
    <Input
      ref={ref}
      type="text"
      inputMode="decimal"
      value={display}
      onFocus={handleFocus}
      onChange={handleChange}
      onBlur={handleBlur}
      {...props}
    />
  )
})
