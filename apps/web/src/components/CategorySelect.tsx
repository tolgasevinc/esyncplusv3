import { useState, useMemo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface CategoryItem {
  id: number
  name: string
  code: string
  group_id?: number | null
  category_id?: number | null
  sort_order?: number
  color?: string
}

export interface CategorySelectProps {
  value: number | ''
  onChange: (id: number | '') => void
  categories: CategoryItem[]
  placeholder?: string
  id?: string
  className?: string
  /** Popover + kademeli badge formatı (modal içinde tıklanabilir) */
  variant?: 'default' | 'badge'
}

export interface CategoryPathItem {
  name: string
  code: string
}

export interface HierarchyItem {
  id: number
  label: string
  path: CategoryPathItem[]
  level: 'group' | 'category' | 'subcategory'
  selectable: boolean
  color?: string
}

export function buildHierarchy(categories: CategoryItem[]): HierarchyItem[] {
  const result: HierarchyItem[] = []
  const groups = categories.filter(
    (c) => (!c.group_id || c.group_id === 0) && (!c.category_id || c.category_id === 0)
  )
  const cats = categories.filter((c) => !c.category_id || c.category_id === 0)
  const subCats = categories.filter((c) => c.category_id && c.category_id > 0)

  const byGroup = new Map<number, CategoryItem[]>()
  cats.forEach((c) => {
    const gid = c.group_id ?? 0
    if (gid > 0) {
      if (!byGroup.has(gid)) byGroup.set(gid, [])
      byGroup.get(gid)!.push(c)
    }
  })

  const byParent = new Map<number, CategoryItem[]>()
  subCats.forEach((c) => {
    const pid = c.category_id!
    if (!byParent.has(pid)) byParent.set(pid, [])
    byParent.get(pid)!.push(c)
  })

  groups.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name)).forEach((group) => {
    result.push({
      id: group.id,
      label: `${group.name} [${group.code}]`,
      path: [{ name: group.name, code: group.code }],
      level: 'group',
      selectable: false,
      color: group.color,
    })
    const groupCats = byGroup.get(group.id) || []
    groupCats.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
    groupCats.forEach((cat) => {
      const subs = byParent.get(cat.id) || []
      subs.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
      if (subs.length === 0) {
        result.push({
          id: cat.id,
          label: `${group.name} [${group.code}] > ${cat.name} [${cat.code}]`,
          path: [
            { name: group.name, code: group.code },
            { name: cat.name, code: cat.code },
          ],
          level: 'category',
          selectable: true,
          color: cat.color,
        })
      } else {
        subs.forEach((sub) => {
          result.push({
            id: sub.id,
            label: `${group.name} [${group.code}] > ${cat.name} [${cat.code}] > ${sub.name} [${sub.code}]`,
            path: [
              { name: group.name, code: group.code },
              { name: cat.name, code: cat.code },
              { name: sub.name, code: sub.code },
            ],
            level: 'subcategory',
            selectable: true,
            color: sub.color,
          })
        })
      }
    })
  })

  const noGroupCats = cats.filter(
    (c) => c.group_id == null && !groups.some((g) => g.id === c.id)
  )
  noGroupCats.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
  noGroupCats.forEach((cat) => {
    const subs = byParent.get(cat.id) || []
    subs.sort((a, b) => a.name.localeCompare(b.name))
    if (subs.length === 0) {
      result.push({
        id: cat.id,
        label: `${cat.name} [${cat.code}]`,
        path: [{ name: cat.name, code: cat.code }],
        level: 'category',
        selectable: true,
        color: cat.color,
      })
    } else {
      subs.forEach((sub) => {
        result.push({
          id: sub.id,
          label: `${cat.name} [${cat.code}] > ${sub.name} [${sub.code}]`,
          path: [
            { name: cat.name, code: cat.code },
            { name: sub.name, code: sub.code },
          ],
          level: 'subcategory',
          selectable: true,
          color: sub.color,
        })
      })
    }
  })

  return result
}

/** buildHierarchy ile aynı, ancak gruplar da seçilebilir (Paraşüt eşleştirme için) */
export function buildHierarchyWithSelectableGroups(categories: CategoryItem[]): HierarchyItem[] {
  return buildHierarchy(categories).map((h) =>
    h.level === 'group' ? { ...h, selectable: true } : h
  )
}

/**
 * Seçili kategori için kökten yaprağa tam yol (grup + category_id üzerinden üstler).
 * `buildHierarchy` yalnızca 3 seviye üretir; ürün kaydı daha derin `category_id` zincirinde olabilir.
 */
export function getCategoryPath(categories: CategoryItem[], categoryId: number | ''): CategoryPathItem[] {
  if (!categoryId) return []
  const id = typeof categoryId === 'number' ? categoryId : parseInt(String(categoryId), 10)
  if (Number.isNaN(id) || id <= 0) return []

  const byId = new Map<number, CategoryItem>()
  for (const c of categories) {
    byId.set(c.id, c)
  }

  const leaf = byId.get(id)
  if (!leaf) return []

  const chain: CategoryItem[] = []
  let cur: CategoryItem | undefined = leaf
  const seen = new Set<number>()
  while (cur) {
    if (seen.has(cur.id)) break
    seen.add(cur.id)
    chain.unshift(cur)
    const pid: number | null | undefined = cur.category_id
    cur = pid && pid > 0 ? byId.get(pid) : undefined
  }

  const first = chain[0]
  if (first?.group_id && first.group_id > 0) {
    const grp = byId.get(first.group_id)
    if (grp && grp.id !== first.id) {
      chain.unshift(grp)
    }
  }

  return chain.map((c) => ({
    name: c.name,
    code: (c.code ?? '').trim(),
  }))
}

/** Liste / özet: her kademede ad + kod */
export function formatCategoryPathDisplay(path: CategoryPathItem[]): string {
  return path
    .map((p) => (p.code ? `${p.name} [${p.code}]` : p.name))
    .join(' › ')
}

/**
 * Ürün listesi kategori sütunu: grup + ana kategori yalnızca kod rozetleri; yanında alt kategori(ler)in adı.
 * `path.length >= 2` iken ilk iki kademe kod badge; `path.slice(2)` adları ` › ` ile.
 */
export function splitCategoryPathForListColumn(path: CategoryPathItem[]): {
  groupCode: string | null
  categoryCode: string | null
  subLabel: string | null
  tooltip: string
} | null {
  if (path.length === 0) return null
  const tooltip = formatCategoryPathDisplay(path)
  if (path.length === 1) {
    return {
      groupCode: null,
      categoryCode: null,
      subLabel: path[0].name,
      tooltip,
    }
  }
  const groupCode = (path[0].code ?? '').trim() || null
  const categoryCode = (path[1].code ?? '').trim() || null
  const subLabel =
    path.length > 2
      ? path
          .slice(2)
          .map((p) => p.name)
          .filter(Boolean)
          .join(' › ')
      : null
  return { groupCode, categoryCode, subLabel, tooltip }
}

/** Path'i kademeli badge olarak render et */
function PathBadges({ path, color }: { path: CategoryPathItem[]; color?: string }) {
  const levelStyles = [
    'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200',
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200',
    'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200',
  ]
  return (
    <div className="flex flex-wrap items-center gap-1">
      {path.map((p, i) => {
        const isLast = i === path.length - 1
        const styleClass = isLast && color ? '' : levelStyles[Math.min(i, 2)]
        return (
          <span key={i} className="inline-flex items-center gap-1">
            <span
              className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium', styleClass)}
              style={isLast && color ? { backgroundColor: color, color: '#fff' } : undefined}
            >
              {p.name} {p.code ? `[${p.code}]` : ''}
            </span>
            {i < path.length - 1 && <span className="text-muted-foreground text-xs">›</span>}
          </span>
        )
      })}
    </div>
  )
}

export function CategorySelect({
  value,
  onChange,
  categories,
  placeholder = 'Ara veya seçin...',
  id: inputId,
  className,
  variant = 'default',
}: CategorySelectProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const hierarchy = useMemo(() => buildHierarchy(categories), [categories])

  const filtered = useMemo(() => {
    if (!query.trim()) return hierarchy
    const q = query.toLowerCase()
    return hierarchy.filter(
      (h) =>
        h.label.toLowerCase().includes(q) ||
        h.path.some((p) => p.name.toLowerCase().includes(q) || (p.code && p.code.toLowerCase().includes(q)))
    )
  }, [hierarchy, query])

  const selectableFiltered = useMemo(
    () => filtered.filter((h) => h.selectable),
    [filtered]
  )

  const selectedItem = useMemo(
    () => hierarchy.find((h) => h.id === value),
    [hierarchy, value]
  )

  const displayValue = open ? query : selectedItem ? selectedItem.label : ''

  if (variant === 'badge') {
    return (
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>
          <Button
            id={inputId}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn('h-10 w-full justify-between font-normal', className)}
          >
            {selectedItem ? (
              <PathBadges path={selectedItem.path} color={selectedItem.color} />
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[320px] max-w-[520px] p-0" align="start">
          <div className="p-2 border-b">
            <Input
              placeholder="Ara..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9"
              autoComplete="off"
            />
          </div>
          <div className="max-h-[280px] overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => {
                onChange('')
                setOpen(false)
                setQuery('')
              }}
              className={cn(
                'w-full text-left px-3 py-2 text-sm hover:bg-accent',
                !value && 'bg-accent'
              )}
            >
              <span className="text-muted-foreground">{placeholder}</span>
            </button>
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                {hierarchy.length === 0 ? 'Kategori bulunamadı.' : 'Sonuç bulunamadı'}
              </div>
            ) : (
              filtered.map((item) =>
                item.selectable ? (
                  <button
                    key={`${item.level}-${item.id}`}
                    type="button"
                    onClick={() => {
                      onChange(item.id)
                      setOpen(false)
                      setQuery('')
                    }}
                    className={cn(
                      'w-full text-left px-3 py-2.5 text-sm flex items-center gap-2 hover:bg-accent',
                      value === item.id && 'bg-accent'
                    )}
                  >
                    <PathBadges path={item.path} color={item.color} />
                  </button>
                ) : (
                  <div
                    key={`${item.level}-${item.id}`}
                    className="px-3 py-2 text-sm font-medium text-blue-700 dark:text-blue-300"
                  >
                    <PathBadges path={item.path} />
                  </div>
                )
              )
            )}
          </div>
        </PopoverContent>
      </Popover>
    )
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  useEffect(() => {
    setFocusedIndex(-1)
  }, [query, filtered])

  useEffect(() => {
    if (open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const minWidth = 520
      const maxW = typeof window !== 'undefined' ? Math.min(window.innerWidth * 0.9, 600) : 600
      const width = Math.min(Math.max(rect.width, minWidth), maxW)
      setDropdownRect({ top: rect.bottom + 4, left: rect.left, width })
    } else {
      setDropdownRect(null)
    }
  }, [open])

  useEffect(() => {
    if (focusedIndex >= 0 && listRef.current) {
      const el = listRef.current.children[focusedIndex] as HTMLElement
      el?.scrollIntoView({ block: 'nearest' })
    }
  }, [focusedIndex])

  const handleSelect = (item: HierarchyItem) => {
    if (!item.selectable) return
    onChange(item.id)
    setQuery('')
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ') {
        setOpen(true)
        setQuery('')
        e.preventDefault()
      }
      return
    }
    if (e.key === 'Escape') {
      setOpen(false)
      setQuery(selectedItem ? selectedItem.label : '')
      e.preventDefault()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIndex((i) =>
        i < selectableFiltered.length - 1 ? i + 1 : 0
      )
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIndex((i) =>
        i > 0 ? i - 1 : selectableFiltered.length - 1
      )
      return
    }
    if (e.key === 'Enter' && focusedIndex >= 0 && selectableFiltered[focusedIndex]) {
      e.preventDefault()
      handleSelect(selectableFiltered[focusedIndex])
      return
    }
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative flex items-center w-full">
        {selectedItem?.color && !open && (
          <span
            className="absolute left-3 z-10 shrink-0 w-3.5 h-3.5 rounded border pointer-events-none"
            style={{ backgroundColor: selectedItem.color }}
          />
        )}
        <Input
          id={inputId}
          type="text"
          value={displayValue}
          className={cn('h-10 flex-1', selectedItem?.color && !open && 'pl-9')}
          onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
      />
      </div>
      {open &&
        dropdownRect &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={listRef}
            className="fixed z-[100] rounded-md border bg-popover py-1 shadow-lg"
            style={{
              top: dropdownRect.top,
              left: dropdownRect.left,
              width: dropdownRect.width,
              minWidth: 520,
              maxHeight: 320,
              overflowY: 'auto',
            }}
          >
          <button
            type="button"
            onClick={() => {
              onChange('')
              setOpen(false)
              setQuery('')
            }}
            className={cn(
              'w-full text-left px-3 py-2 text-sm',
              !value && 'bg-accent'
            )}
          >
            <span className="text-muted-foreground">{placeholder}</span>
          </button>
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground text-center">
              {hierarchy.length === 0
                ? 'Kategori bulunamadı.'
                : 'Sonuç bulunamadı'}
            </div>
          ) : (
            filtered.map((item) => {
              const selIdx = selectableFiltered.indexOf(item)
              const isFocused = selIdx >= 0 && selIdx === focusedIndex
              const indentClass = {
                group: 'pl-2',
                category: 'pl-6',
                subcategory: 'pl-10',
              }[item.level]
              const rowClass = cn(
                'w-full text-left px-3 py-2.5 text-sm flex items-center gap-2.5',
                indentClass,
                item.level === 'group' && 'bg-blue-100 dark:bg-blue-950/50 font-medium',
                item.level === 'category' && 'bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100',
                item.level === 'subcategory' && 'bg-amber-50 dark:bg-amber-950/20 hover:bg-amber-100',
                item.selectable && 'cursor-pointer',
                !item.selectable && 'cursor-default',
                value === item.id && item.selectable && 'bg-accent',
                isFocused && 'bg-accent'
              )
              return item.selectable ? (
                <button
                  key={`${item.level}-${item.id}`}
                  type="button"
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setFocusedIndex(selIdx)}
                  className={rowClass}
                >
                  {item.color ? (
                    <span
                      className="shrink-0 w-3.5 h-3.5 rounded border"
                      style={{ backgroundColor: item.color }}
                    />
                  ) : (
                    <span
                      className={cn(
                        item.level === 'category' && 'w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0',
                        item.level === 'subcategory' && 'w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0'
                      )}
                    />
                  )}
                  <span className="break-words whitespace-normal">{item.label}</span>
                </button>
              ) : (
                <div key={`${item.level}-${item.id}`} className={rowClass}>
                  {item.color ? (
                    <span
                      className="shrink-0 w-3.5 h-3.5 rounded border"
                      style={{ backgroundColor: item.color }}
                    />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                  )}
                  <span className="text-blue-700 dark:text-blue-300 break-words whitespace-normal">{item.label}</span>
                </div>
              )
            })
          )}
          </div>,
          document.body
        )}
    </div>
  )
}
