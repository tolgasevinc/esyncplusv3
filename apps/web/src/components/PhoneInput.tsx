import { Input } from '@/components/ui/input'
import { formatPhoneInput } from '@/lib/utils'

interface PhoneInputProps extends Omit<React.ComponentProps<typeof Input>, 'onChange' | 'value'> {
  value: string
  onChange: (value: string) => void
}

/** Türkiye telefon formatında giriş (XXX XXX XX XX, 10 rakam) */
export function PhoneInput({ value, onChange, ...props }: PhoneInputProps) {
  return (
    <Input
      {...props}
      value={value}
      onChange={(e) => onChange(formatPhoneInput(e.target.value))}
      inputMode="numeric"
      autoComplete="tel"
      maxLength={13}
    />
  )
}
