import { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export interface CategoryItem {
  id: number
  name: string
  code: string
  group_id?: number | null
  category_id?: number | null
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
}

/**
 * Sadece product_categories tablosundan hiyerarşi oluşturur.
 * group_id=0 → grup (üst seviye)
 * category_id=0 → kategori (gruba bağlı)
 * category_id>0 → alt kategori (kategoriye bağlı)
 * group_id → bağlı olduğu grubun id'si
 * category_id → bağlı olduğu kategorinin id'si (alt kategori için)
 */
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

  groups
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((group) => {
      result.push({
        id: group.id,
        label: `${group.name} [${group.code}]`,
        path: [{ name: group.name, code: group.code }],
        level: 'group',
        selectable: false,
      })
      const groupCats = byGroup.get(group.id) || []
      groupCats.sort((a, b) => a.name.localeCompare(b.name))
      groupCats.forEach((cat) => {
        const subs = byParent.get(cat.id) || []
        subs.sort((a, b) => a.name.localeCompare(b.name))
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
            })
          })
        }
      })
    })

  const noGroupCats = cats.filter(
    (c) => c.group_id == null && !groups.some((g) => g.id === c.id)
  )
  noGroupCats.sort((a, b) => a.name.localeCompare(b.name))
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
        })
      })
    }
  })

  return result
}

export function CategorySelect({
  value,
  onChange,
  categories,
  placeholder = 'Seçin',
  id: inputId,
  className,
}: CategorySelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null)

  const hierarchy = useMemo(() => buildHierarchy(categories), [categories])

  const filtered = useMemo(() => {
    if (!search.trim()) return hierarchy
    const q = search.toLowerCase()
    return hierarchy.filter(
      (h) =>
        h.label.toLowerCase().includes(q) ||
        h.path.some((p) => p.name.toLowerCase().includes(q) || (p.code && p.code.toLowerCase().includes(q)))
    )
  }, [hierarchy, search])

  const selectedItem = useMemo(
    () => hierarchy.find((h) => h.id === value),
    [hierarchy, value]
  )

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      const inTrigger = containerRef.current?.contains(target)
      const inDropdown = dropdownRef.current?.contains(target)
      if (!inTrigger && !inDropdown) {
        setOpen(false)
      }
    }
    if (open) {
      const rect = containerRef.current?.getBoundingClientRect()
      if (rect) {
        setDropdownRect({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 320) })
      }
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
        setDropdownRect(null)
      }
    }
  }, [open])

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        id={inputId}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm text-left',
          'hover:bg-accent/50 transition-colors'
        )}
      >
        <span className={cn(!selectedItem && 'text-muted-foreground')}>
          {selectedItem ? selectedItem.label : placeholder}
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && dropdownRect &&
        createPortal(
          <div
            ref={(el) => { dropdownRef.current = el }}
            className="fixed z-[100] flex flex-col rounded-md border bg-popover text-popover-foreground shadow-lg"
            style={{
              top: dropdownRect.top,
              left: dropdownRect.left,
              width: Math.min(dropdownRect.width, window.innerWidth - dropdownRect.left - 16),
              maxHeight: 320,
            }}
          >
            <div className="shrink-0 p-2 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Ara..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="pl-8 h-9"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-1" style={{ maxHeight: 260 }}>
              <button
                type="button"
                onClick={() => {
                  onChange('')
                  setOpen(false)
                }}
                className={cn(
                  'w-full text-left px-2 py-1.5 rounded text-sm',
                  !value && 'bg-accent'
                )}
              >
                <span className="text-muted-foreground">{placeholder}</span>
              </button>
              {filtered.length === 0 ? (
                <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                  {hierarchy.length === 0
                    ? 'Kategori bulunamadı. Parametrelerden ekleyin.'
                    : 'Sonuç bulunamadı'}
                </div>
              ) : (
                filtered.map((item) => {
                  const rowClass = cn(
                    'w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-2',
                    item.level === 'group' && 'bg-blue-100 dark:bg-blue-950/50 font-medium cursor-default',
                    item.level === 'category' && 'bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-950/50',
                    item.level === 'subcategory' && 'bg-amber-50 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-950/40 pl-4',
                    item.selectable && 'cursor-pointer',
                    !item.selectable && 'cursor-default',
                    value === item.id && item.selectable && 'bg-accent'
                  )
                  return item.selectable ? (
                    <button
                      key={`${item.level}-${item.id}`}
                      type="button"
                      onClick={() => {
                        onChange(item.id)
                        setOpen(false)
                      }}
                      className={rowClass}
                    >
                      <span
                        className={cn(
                          item.level === 'group' && 'w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0',
                          item.level === 'category' && 'w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0',
                          item.level === 'subcategory' && 'w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0'
                        )}
                      />
                      <span className="truncate">
                        {item.path.length === 1 && (
                          <span className={item.level === 'group' ? 'text-blue-700 dark:text-blue-300' : 'text-foreground'}>
                            {item.path[0].name} <span className="text-muted-foreground text-xs">[{item.path[0].code}]</span>
                          </span>
                        )}
                        {item.path.length === 2 && (
                          <>
                            <span className={item.level === 'group' ? 'text-blue-700 dark:text-blue-300' : 'font-medium text-primary'}>{item.path[0].name} <span className="text-xs opacity-80">[{item.path[0].code}]</span></span>
                            <span className="text-muted-foreground"> › </span>
                            <span className="text-emerald-700 dark:text-emerald-300">{item.path[1].name} <span className="text-muted-foreground text-xs">[{item.path[1].code}]</span></span>
                          </>
                        )}
                        {item.path.length >= 3 && (
                          <>
                            <span className="font-medium text-blue-600 dark:text-blue-400">{item.path[0].name} <span className="text-xs opacity-80">[{item.path[0].code}]</span></span>
                            <span className="text-muted-foreground"> › </span>
                            <span className="text-emerald-600 dark:text-emerald-400">{item.path[1].name} <span className="text-muted-foreground text-xs">[{item.path[1].code}]</span></span>
                            <span className="text-muted-foreground"> › </span>
                            <span className="text-amber-700 dark:text-amber-300">{item.path[2].name} <span className="text-xs opacity-80">[{item.path[2].code}]</span></span>
                          </>
                        )}
                      </span>
                    </button>
                  ) : (
                    <div key={`${item.level}-${item.id}`} className={rowClass}>
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                      <span className="text-blue-700 dark:text-blue-300">
                        {item.path[0].name} <span className="text-muted-foreground text-xs">[{item.path[0].code}]</span>
                      </span>
                    </div>
                  )
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
