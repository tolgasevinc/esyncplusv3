import { useState, useMemo, useRef, useEffect } from 'react'
import { Input } from '@/components/ui/input'
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
}

interface HierarchyItem {
  id: number
  label: string
  path: { name: string; code: string }[]
  level: 'group' | 'category' | 'subcategory'
  selectable: boolean
  color?: string
}

function buildHierarchy(categories: CategoryItem[]): HierarchyItem[] {
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

/** Seçili kategori için path döndürür (kod oluşturucu için) */
export function getCategoryPath(categories: CategoryItem[], categoryId: number | ''): CategoryPathItem[] {
  if (!categoryId) return []
  const hierarchy = buildHierarchy(categories)
  const item = hierarchy.find((h) => h.id === categoryId)
  return item?.path ?? []
}

export function CategorySelect({
  value,
  onChange,
  categories,
  placeholder = 'Ara veya seçin...',
  id: inputId,
  className,
}: CategorySelectProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
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
      {open && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 w-full rounded-md border bg-popover py-1 shadow-lg"
          style={{ maxHeight: 260, overflowY: 'auto' }}
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
            filtered.map((item, idx) => {
              const selIdx = selectableFiltered.indexOf(item)
              const isFocused = selIdx >= 0 && selIdx === focusedIndex
              const rowClass = cn(
                'w-full text-left px-3 py-2 text-sm flex items-center gap-2',
                item.level === 'group' && 'bg-blue-100 dark:bg-blue-950/50 font-medium',
                item.level === 'category' && 'bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100',
                item.level === 'subcategory' && 'bg-amber-50 dark:bg-amber-950/20 hover:bg-amber-100 pl-4',
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
                  <span className="truncate">{item.label}</span>
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
                  <span className="text-blue-700 dark:text-blue-300 truncate">{item.label}</span>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
