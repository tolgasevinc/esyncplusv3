import { ChevronUp, ChevronDown } from 'lucide-react'
import { DecimalInput } from './DecimalInput'
import { cn } from '@/lib/utils'

interface DecimalInputWithSpinnerProps {
  value: number
  onChange: (value: number) => void
  step?: number
  min?: number
  max?: number
  maxDecimals?: number
  className?: string
  placeholder?: string
}

/** Ondalık giriş + sağda yukarı/aşağı spinner */
export function DecimalInputWithSpinner({
  value,
  onChange,
  step = 1,
  min,
  max,
  maxDecimals = 4,
  className,
  placeholder,
}: DecimalInputWithSpinnerProps) {
  const clamp = (v: number) => {
    if (min !== undefined && v < min) return min
    if (max !== undefined && v > max) return max
    return v
  }
  const roundedStep = (v: number) => Number(v.toFixed(maxDecimals))

  return (
    <div
      className={cn(
        'flex h-8 rounded-md border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0',
        className
      )}
    >
      <DecimalInput
        value={value}
        onChange={(n) => onChange(clamp(n))}
        maxDecimals={maxDecimals}
        placeholder={placeholder}
        className="flex-1 min-w-0 h-full border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent text-right"
      />
      <div className="flex flex-col w-7 shrink-0 bg-muted/60 border-l border-input">
        <button
          type="button"
          tabIndex={-1}
          className="flex-1 flex items-center justify-center min-h-0 text-muted-foreground hover:bg-muted/80 active:bg-muted transition-colors"
          onClick={() => onChange(clamp(roundedStep(value + step)))}
        >
          <ChevronUp className="h-3 w-3" strokeWidth={2.5} />
        </button>
        <button
          type="button"
          tabIndex={-1}
          className="flex-1 flex items-center justify-center min-h-0 text-muted-foreground hover:bg-muted/80 active:bg-muted transition-colors"
          onClick={() => onChange(clamp(roundedStep(value - step)))}
        >
          <ChevronDown className="h-3 w-3" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  )
}
