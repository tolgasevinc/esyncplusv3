import { useState, useEffect, useRef, useCallback } from 'react'
import { Users } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { API_URL } from '@/lib/api'

const DIA_ICON_KEY = 'images/icons/1771670345789-yqkiwdl30bh.png'

export interface SimilarRecord {
  source: string
  id: number
  title: string
}

interface CustomerTitleInputProps {
  value: string
  onChange: (value: string) => void
  onSelect?: (record: SimilarRecord) => void
  placeholder?: string
  id?: string
  required?: boolean
  disabled?: boolean
  /** Düzenleme modunda mevcut müşteri id - kendisi listede çıkmasın */
  excludeCustomerId?: number | null
}

const DEBOUNCE_MS = 350

export function CustomerTitleInput({
  value,
  onChange,
  onSelect,
  placeholder = 'Firma adı veya şahıs adı',
  id,
  required,
  disabled,
  excludeCustomerId,
}: CustomerTitleInputProps) {
  const [similar, setSimilar] = useState<SimilarRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [focused, setFocused] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchSimilar = useCallback(async (q: string) => {
    if (!q || q.trim().length < 2) {
      setSimilar([])
      return
    }
    setLoading(true)
    try {
      const res = await fetch(
        `${API_URL}/api/customers/similar?q=${encodeURIComponent(q.trim())}&limit=12`
      )
      const json = await res.json()
      let data: SimilarRecord[] = json.data || []
      if (excludeCustomerId && excludeCustomerId > 0) {
        data = data.filter(
          (r: SimilarRecord) => !(r.source === 'customers' && r.id === excludeCustomerId)
        )
      }
      setSimilar(data)
      setShowDropdown(data.length > 0)
      setHighlightedIndex(0)
    } catch {
      setSimilar([])
    } finally {
      setLoading(false)
    }
  }, [excludeCustomerId])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value.trim() || value.trim().length < 2) {
      setSimilar([])
      setShowDropdown(false)
      return
    }
    debounceRef.current = setTimeout(() => {
      fetchSimilar(value)
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [value, fetchSimilar])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (record: SimilarRecord) => {
    onChange(record.title)
    setSimilar([])
    setShowDropdown(false)
    setHighlightedIndex(-1)
    onSelect?.(record)
  }

  const handleBlur = () => {
    setFocused(false)
    setTimeout(() => setShowDropdown(false), 150)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || similar.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((i) => {
        const next = i < similar.length - 1 ? i + 1 : 0
        itemRefs.current[next]?.scrollIntoView({ block: 'nearest' })
        return next
      })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((i) => {
        const next = i > 0 ? i - 1 : similar.length - 1
        itemRefs.current[next]?.scrollIntoView({ block: 'nearest' })
        return next
      })
    } else if (e.key === 'Enter' && highlightedIndex >= 0 && similar[highlightedIndex]) {
      e.preventDefault()
      handleSelect(similar[highlightedIndex])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setShowDropdown(false)
      setHighlightedIndex(-1)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoComplete="off"
      />
      {loading && value.trim().length >= 2 && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          Aranıyor...
        </span>
      )}
      {showDropdown && similar.length > 0 && focused && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-60 overflow-auto">
          <div className="p-1.5 text-xs text-muted-foreground border-b">
            Benzer kayıtlar — seçerek isim getirebilirsiniz
          </div>
          {similar.map((r, idx) => (
            <button
              key={`${r.source}-${r.id}`}
              ref={(el) => { itemRefs.current[idx] = el }}
              type="button"
              className={`w-full text-left px-3 py-2 text-sm rounded-sm flex items-center justify-between gap-2 ${idx === highlightedIndex ? 'bg-accent' : 'hover:bg-accent/50'}`}
              onClick={() => handleSelect(r)}
              onMouseEnter={() => setHighlightedIndex(idx)}
            >
              <span className="truncate">{r.title}</span>
              <span className="shrink-0 flex items-center gap-1.5 text-xs text-muted-foreground">
                {r.source === 'customers' ? (
                  <>
                    <Users className="h-3.5 w-3.5" />
                    Müşteri
                  </>
                ) : (
                  <>
                    <img
                      src={`${API_URL}/storage/serve?key=${encodeURIComponent(DIA_ICON_KEY)}`}
                      alt="Dia"
                      className="h-3.5 w-3.5 object-contain"
                    />
                    Dia Cari
                  </>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
