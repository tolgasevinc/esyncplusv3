import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const HEX_REGEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
  '#f43f5e', '#64748b', '#94a3b8', '#cbd5e1',
]

export interface ColorPresetPickerProps {
  value: string
  onChange: (color: string) => void
  id?: string
  label?: string
  className?: string
}

export function ColorPresetPicker({
  value,
  onChange,
  id,
  label = 'Renk',
  className,
}: ColorPresetPickerProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {label && <Label>{label}</Label>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange('')}
          className={cn(
            'w-8 h-8 rounded-md border-2 transition-all hover:scale-110 flex items-center justify-center text-muted-foreground text-xs',
            !value ? 'border-foreground ring-2 ring-offset-2 ring-foreground/30' : 'border-muted hover:border-muted-foreground/50'
          )}
          title="Renk yok"
        >
          —
        </button>
        {PRESET_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            className={cn(
              'w-8 h-8 rounded-md border-2 transition-all hover:scale-110',
              value === color ? 'border-foreground ring-2 ring-offset-2 ring-foreground/30' : 'border-transparent hover:border-muted-foreground/50'
            )}
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
        {value && !PRESET_COLORS.includes(value) && (
          <button
            type="button"
            onClick={() => onChange(value)}
            className="w-8 h-8 rounded-md border-2 border-foreground ring-2 ring-offset-2 ring-foreground/30"
            style={{ backgroundColor: value }}
            title={value}
          />
        )}
      </div>
      <div className="flex gap-2 items-center">
        <input
          type="color"
          value={HEX_REGEX.test(value) ? value : '#6366f1'}
          onChange={(e) => onChange(e.target.value)}
          className="w-9 h-9 rounded border cursor-pointer p-0 bg-transparent"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className="w-24 font-mono text-sm"
        />
      </div>
    </div>
  )
}
