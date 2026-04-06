import { useState, useMemo, useCallback, type ComponentPropsWithoutRef } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CategoryItem } from '@/components/CategorySelect'

function TreeIndentDiv({
  paddingLeftPx,
  className,
  ...rest
}: { paddingLeftPx: number } & ComponentPropsWithoutRef<'div'>) {
  const refFn = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) el.style.setProperty('--category-tree-pl', `${paddingLeftPx}px`)
    },
    [paddingLeftPx]
  )
  return <div ref={refFn} className={cn('category-tree-indent', className)} {...rest} />
}

function TreeIndentButton({
  paddingLeftPx,
  className,
  ...rest
}: { paddingLeftPx: number } & ComponentPropsWithoutRef<'button'>) {
  const refFn = useCallback(
    (el: HTMLButtonElement | null) => {
      if (el) el.style.setProperty('--category-tree-pl', `${paddingLeftPx}px`)
    },
    [paddingLeftPx]
  )
  return <button ref={refFn} type="button" className={cn('category-tree-indent', className)} {...rest} />
}

function LevelDot({ color, tone }: { color?: string; tone: 'blue' | 'emerald' | 'amber' }) {
  if (color?.trim()) {
    return (
      <span
        className="shrink-0 w-3 h-3 rounded border border-border"
        style={{ backgroundColor: color }}
      />
    )
  }
  const cls =
    tone === 'blue'
      ? 'bg-blue-500'
      : tone === 'emerald'
        ? 'bg-emerald-500'
        : 'bg-amber-500'
  return <span className={cn('shrink-0 w-1.5 h-1.5 rounded-full', cls)} />
}

const OCCUPIED_TITLE = 'Bu master kayıt başka bir IdeaSoft kategori satırında kullanılıyor; seçilemez.'

export interface MasterCategoryTreePickerProps {
  categories: CategoryItem[]
  selectedId: number | null
  onSelect: (id: number) => void
  /** Dışarıdaki arama kutusu metni — eşleşmeyen dallar gizlenir */
  searchQuery: string
  /**
   * Bu master id’leri başka IdeaSoft kategori satırlarında kullanılıyor (mevcut satır hariç).
   * Ağaçta pasif, tıklanamaz listelenir.
   */
  disabledMasterIds?: ReadonlySet<number>
}

/**
 * Parametreler › Kategoriler (product_categories) hiyerarşisi: grup → ana kategori → alt kategori.
 * Ürünler sayfası CategoryTreeTab ile aynı veri modeli (CategoryItem).
 */
export function MasterCategoryTreePicker({
  categories,
  selectedId,
  onSelect,
  searchQuery,
  disabledMasterIds,
}: MasterCategoryTreePickerProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set())
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set())

  const isMasterOccupiedElsewhere = useCallback(
    (id: number) => disabledMasterIds?.has(id) ?? false,
    [disabledMasterIds]
  )

  const groups = useMemo(
    () => categories.filter((c) => (!c.group_id || c.group_id === 0) && (!c.category_id || c.category_id === 0)),
    [categories]
  )
  const mainCats = useMemo(
    () => categories.filter((c) => !c.category_id || c.category_id === 0),
    [categories]
  )
  const subCats = useMemo(() => categories.filter((c) => c.category_id && c.category_id > 0), [categories])

  const byGroup = useMemo(() => {
    const m = new Map<number, CategoryItem[]>()
    mainCats.forEach((c) => {
      const gid = c.group_id ?? 0
      if (gid > 0) {
        if (!m.has(gid)) m.set(gid, [])
        m.get(gid)!.push(c)
      }
    })
    return m
  }, [mainCats])

  const byParent = useMemo(() => {
    const m = new Map<number, CategoryItem[]>()
    subCats.forEach((c) => {
      const pid = c.category_id!
      if (!m.has(pid)) m.set(pid, [])
      m.get(pid)!.push(c)
    })
    return m
  }, [subCats])

  const noGroupCats = useMemo(
    () => mainCats.filter((c) => c.group_id == null && !groups.some((g) => g.id === c.id)),
    [mainCats, groups]
  )

  const q = searchQuery.trim().toLowerCase()
  const matches = useCallback(
    (c: CategoryItem) =>
      !q ||
      (c.name || '').toLowerCase().includes(q) ||
      (c.code || '').toLowerCase().includes(q) ||
      String(c.id).includes(q),
    [q]
  )

  const categoryMatches = useCallback(
    (cat: CategoryItem) => {
      if (matches(cat)) return true
      const subs = byParent.get(cat.id) || []
      return subs.some((s) => matches(s))
    },
    [matches, byParent]
  )

  const groupMatches = useCallback(
    (group: CategoryItem) => {
      if (matches(group)) return true
      const groupCats = byGroup.get(group.id) || []
      return groupCats.some((cat) => categoryMatches(cat))
    },
    [matches, byGroup, categoryMatches]
  )

  const toggleGroup = (id: number) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleCategory = (id: number) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const sortedGroups = useMemo(
    () =>
      [...groups].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name)),
    [groups]
  )
  const sortedNoGroup = useMemo(
    () =>
      [...noGroupCats].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name)),
    [noGroupCats]
  )

  const selectedCls = (id: number) =>
    selectedId === id ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''

  /** Sadece gerçekten başka satırda kullanılan master’lar; tüm ağacı soluk göstermez */
  const takenCls = (id: number) =>
    isMasterOccupiedElsewhere(id) ? 'bg-muted/50 text-muted-foreground' : ''

  const renderCat = (cat: CategoryItem, group: CategoryItem | undefined, indent: number) => {
    const subs = byParent.get(cat.id) || []
    const filteredSubs = q ? subs.filter((s) => matches(s)) : subs
    const hasSubs = filteredSubs.length > 0
    const isExpanded = expandedCategories.has(cat.id) || (!!q && hasSubs)
    if (q && !matches(cat) && !hasSubs) return null

    const basePl = 12 + indent * 16

    if (hasSubs) {
      return (
        <div key={`cat-${cat.id}`} className="space-y-0.5">
          <TreeIndentDiv
            paddingLeftPx={basePl}
            className={cn(
              'flex items-center gap-2 px-3 py-2 text-sm rounded-md',
              indent === 0 ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'bg-emerald-50/80 dark:bg-emerald-950/20'
            )}
          >
            <button
              type="button"
              onClick={() => toggleCategory(cat.id)}
              className="shrink-0 p-0.5 hover:bg-black/5 rounded"
              aria-label={isExpanded ? 'Daralt' : 'Genişlet'}
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => onSelect(cat.id)}
              disabled={isMasterOccupiedElsewhere(cat.id)}
              title={isMasterOccupiedElsewhere(cat.id) ? OCCUPIED_TITLE : undefined}
              className={cn(
                'flex-1 flex items-center gap-2 text-left min-w-0 rounded-md',
                !isMasterOccupiedElsewhere(cat.id) && 'hover:bg-black/5 dark:hover:bg-white/5',
                selectedCls(cat.id),
                takenCls(cat.id)
              )}
            >
              <LevelDot color={cat.color} tone="emerald" />
              <span
                className={cn(
                  'break-words whitespace-normal font-medium',
                  isMasterOccupiedElsewhere(cat.id) ? 'text-muted-foreground font-normal' : 'text-foreground'
                )}
              >
                {group ? `${group.name} [${group.code}] › ` : ''}
                {cat.name} [{cat.code}]
              </span>
              <span className="text-xs tabular-nums shrink-0 ml-auto flex items-center gap-1">
                {isMasterOccupiedElsewhere(cat.id) && (
                  <span className="text-[10px] font-normal normal-case text-muted-foreground">kullanımda</span>
                )}
                <span className={cn('tabular-nums', isMasterOccupiedElsewhere(cat.id) && 'text-muted-foreground')}>
                  #{cat.id}
                </span>
              </span>
            </button>
          </TreeIndentDiv>
          {isExpanded && (
            <div className="space-y-0.5">
              {[...filteredSubs]
                .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
                .map((sub) => (
                  <TreeIndentButton
                    key={`sub-${sub.id}`}
                    paddingLeftPx={28 + indent * 16}
                    onClick={() => onSelect(sub.id)}
                    disabled={isMasterOccupiedElsewhere(sub.id)}
                    title={isMasterOccupiedElsewhere(sub.id) ? OCCUPIED_TITLE : undefined}
                    className={cn(
                      'w-full text-left flex items-center gap-2 px-3 py-2 text-sm rounded-md bg-amber-50 dark:bg-amber-950/20',
                      !isMasterOccupiedElsewhere(sub.id) && 'hover:opacity-90',
                      selectedCls(sub.id),
                      takenCls(sub.id)
                    )}
                  >
                    <LevelDot color={sub.color} tone="amber" />
                    <span
                      className={cn(
                        'break-words whitespace-normal',
                        isMasterOccupiedElsewhere(sub.id) ? 'text-muted-foreground' : 'font-medium text-foreground'
                      )}
                    >
                      {cat.name} [{cat.code}] › {sub.name} [{sub.code}]
                    </span>
                    <span className="text-xs tabular-nums shrink-0 ml-auto flex items-center gap-1">
                      {isMasterOccupiedElsewhere(sub.id) && (
                        <span className="text-[10px] text-muted-foreground font-normal normal-case">kullanımda</span>
                      )}
                      <span className="text-muted-foreground tabular-nums">#{sub.id}</span>
                    </span>
                  </TreeIndentButton>
                ))}
            </div>
          )}
        </div>
      )
    }

    return (
      <TreeIndentButton
        key={`cat-${cat.id}`}
        paddingLeftPx={basePl}
        onClick={() => onSelect(cat.id)}
        disabled={isMasterOccupiedElsewhere(cat.id)}
        title={isMasterOccupiedElsewhere(cat.id) ? OCCUPIED_TITLE : undefined}
        className={cn(
          'w-full text-left flex items-center gap-2 px-3 py-2 text-sm rounded-md',
          indent === 0 ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'bg-emerald-50/80 dark:bg-emerald-950/20',
          !isMasterOccupiedElsewhere(cat.id) && 'hover:opacity-90',
          selectedCls(cat.id),
          takenCls(cat.id)
        )}
      >
        <LevelDot color={cat.color} tone="emerald" />
        <span
          className={cn(
            'break-words whitespace-normal',
            isMasterOccupiedElsewhere(cat.id) ? 'text-muted-foreground' : 'font-medium text-foreground'
          )}
        >
          {group ? `${group.name} [${group.code}] › ` : ''}
          {cat.name} [{cat.code}]
        </span>
        <span className="text-xs tabular-nums shrink-0 ml-auto flex items-center gap-1">
          {isMasterOccupiedElsewhere(cat.id) && (
            <span className="text-[10px] text-muted-foreground font-normal normal-case">kullanımda</span>
          )}
          <span className="text-muted-foreground">#{cat.id}</span>
        </span>
      </TreeIndentButton>
    )
  }

  const filteredGroups = q ? sortedGroups.filter((g) => groupMatches(g)) : sortedGroups
  const filteredNoGroup = q ? sortedNoGroup.filter((c) => categoryMatches(c)) : sortedNoGroup

  if (categories.length === 0) return null

  return (
    <div className="p-2 space-y-0.5">
      {filteredGroups.map((group) => {
        const isExpanded = expandedGroups.has(group.id) || !!q
        const groupCats = (byGroup.get(group.id) || [])
          .filter((c) => !q || categoryMatches(c))
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
        if (q && groupCats.length === 0 && !matches(group)) return null
        return (
          <div key={`grp-${group.id}`} className="space-y-0.5">
            <div className="flex items-center gap-1 rounded-md bg-blue-100 dark:bg-blue-950/50 text-sm font-medium">
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                className="shrink-0 p-2 hover:bg-black/5 rounded-md"
                aria-label={isExpanded ? 'Grubu daralt' : 'Grubu genişlet'}
              >
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => onSelect(group.id)}
                disabled={isMasterOccupiedElsewhere(group.id)}
                title={isMasterOccupiedElsewhere(group.id) ? OCCUPIED_TITLE : undefined}
                className={cn(
                  'flex-1 flex items-center gap-2 text-left py-2 pr-3 min-w-0 rounded-md',
                  !isMasterOccupiedElsewhere(group.id) && 'hover:opacity-90',
                  selectedCls(group.id),
                  takenCls(group.id)
                )}
              >
                <LevelDot color={group.color} tone="blue" />
                <span
                  className={cn(
                    'break-words whitespace-normal',
                    isMasterOccupiedElsewhere(group.id)
                      ? 'text-muted-foreground'
                      : 'font-medium text-foreground'
                  )}
                >
                  {group.name} [{group.code}]
                </span>
                <span className="text-xs font-normal tabular-nums shrink-0 ml-auto flex items-center gap-1">
                  {isMasterOccupiedElsewhere(group.id) && (
                    <span className="text-[10px] text-muted-foreground normal-case">kullanımda</span>
                  )}
                  <span className="text-muted-foreground">#{group.id}</span>
                </span>
              </button>
            </div>
            {isExpanded && (
              <div className="space-y-0.5 pl-1">{groupCats.map((cat) => renderCat(cat, group, 1))}</div>
            )}
          </div>
        )
      })}
      {filteredNoGroup.map((cat) => renderCat(cat, undefined, 0))}
      {q && filteredGroups.length === 0 && filteredNoGroup.length === 0 && (
        <div className="py-6 text-center text-sm text-muted-foreground">Sonuç yok.</div>
      )}
    </div>
  )
}
