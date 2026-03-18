import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { FolderTree, RefreshCw, Link2, ChevronRight, ChevronDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { PageLayout } from '@/components/layout/PageLayout'
import { API_URL } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toastSuccess, toastError } from '@/lib/toast'
import { buildHierarchyWithSelectableGroups, type CategoryItem, type HierarchyItem } from '@/components/CategorySelect'

interface ParasutCategory {
  id: string
  name?: string
  parent_id?: number | null
  full_path?: string
  level?: 1 | 2 | 3
  _depth?: number
}

const NEW_CREATE_VALUE = '__new__'

interface MasterTreeNode {
  item: CategoryItem
  hierarchyItem: HierarchyItem
  children: MasterTreeNode[]
}

function buildMasterTree(categories: CategoryItem[], fullHierarchy: HierarchyItem[]): MasterTreeNode[] {
  const byId = new Map<number, CategoryItem>()
  categories.forEach((c) => byId.set(c.id, c))
  const hierarchyById = new Map<number, HierarchyItem>()
  fullHierarchy.forEach((h) => hierarchyById.set(h.id, h))

  const groups = categories
    .filter((c) => (!c.group_id || c.group_id === 0) && (!c.category_id || c.category_id === 0))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))

  const byGroup = new Map<number, CategoryItem[]>()
  const byParent = new Map<number, CategoryItem[]>()
  categories.forEach((c) => {
    if (c.group_id && c.group_id > 0 && (!c.category_id || c.category_id === 0)) {
      if (!byGroup.has(c.group_id)) byGroup.set(c.group_id, [])
      byGroup.get(c.group_id)!.push(c)
    }
    if (c.category_id && c.category_id > 0) {
      if (!byParent.has(c.category_id)) byParent.set(c.category_id, [])
      byParent.get(c.category_id)!.push(c)
    }
  })

  const noGroupCats = categories.filter(
    (c) => !c.group_id && (!c.category_id || c.category_id === 0) && !groups.some((g) => g.id === c.id)
  )

  const result: MasterTreeNode[] = []

  for (const group of groups) {
    const h = hierarchyById.get(group.id)
    if (!h) continue
    const groupCats = byGroup.get(group.id) || []
    groupCats.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
    const children: MasterTreeNode[] = []
    for (const cat of groupCats) {
      let catH = hierarchyById.get(cat.id)
      if (!catH) {
        catH = {
          id: cat.id,
          label: `${group.name} [${group.code}] > ${cat.name} [${cat.code}]`,
          path: [
            { name: group.name, code: group.code },
            { name: cat.name, code: cat.code },
          ],
          level: 'category' as const,
          selectable: true,
          color: cat.color,
        }
      }
      const subs = byParent.get(cat.id) || []
      subs.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
      const subChildren: MasterTreeNode[] = subs.map((sub) => {
        const subH = hierarchyById.get(sub.id)!
        return { item: sub, hierarchyItem: subH, children: [] }
      })
      children.push({ item: cat, hierarchyItem: catH, children: subChildren })
    }
    result.push({ item: group, hierarchyItem: h, children })
  }

  for (const cat of noGroupCats) {
    const catH = hierarchyById.get(cat.id)
    if (!catH) continue
    const subs = byParent.get(cat.id) || []
    subs.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
    const children: MasterTreeNode[] = subs.map((sub) => {
      const subH = hierarchyById.get(sub.id)
      return { item: sub, hierarchyItem: subH!, children: [] }
    })
    result.push({ item: cat, hierarchyItem: { ...catH, level: 'group' as const }, children })
  }

  return result
}

interface ParasutTreeNode {
  category: ParasutCategory
  children: ParasutTreeNode[]
}

function buildParasutTree(categories: ParasutCategory[]): ParasutTreeNode[] {
  const byParent = new Map<string, ParasutCategory[]>()
  const roots: ParasutCategory[] = []
  categories.forEach((c) => {
    const pid = c.parent_id
    const pidStr = pid != null && pid !== 0 ? String(pid) : null
    if (!pidStr) roots.push(c)
    else {
      if (!byParent.has(pidStr)) byParent.set(pidStr, [])
      byParent.get(pidStr)!.push(c)
    }
  })
  roots.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))

  const build = (items: ParasutCategory[]): ParasutTreeNode[] =>
    items.map((c) => {
      const children = byParent.get(String(c.id)) || []
      children.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
      return { category: c, children: build(children) }
    })

  return build(roots)
}

export function ParasutCategoriesPage() {
  const [masterCategories, setMasterCategories] = useState<CategoryItem[]>([])
  const [parasutCategories, setParasutCategories] = useState<ParasutCategory[]>([])
  const [mappings, setMappings] = useState<Record<string, string>>({})
  const [masterLoading, setMasterLoading] = useState(true)
  const [parasutLoading, setParasutLoading] = useState(true)
  const [mappingsLoading, setMappingsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | number | null>(null)
  const [selections, setSelections] = useState<Record<string, string>>({})
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerForMasterId, setPickerForMasterId] = useState<number | null>(null)
  const [expandedMaster, setExpandedMaster] = useState<Set<string>>(new Set())
  const [expandedParasut, setExpandedParasut] = useState<Set<string>>(new Set())

  const fullHierarchy = useMemo(
    () => buildHierarchyWithSelectableGroups(masterCategories),
    [masterCategories]
  )

  const masterTree = useMemo(
    () => buildMasterTree(masterCategories, fullHierarchy),
    [masterCategories, fullHierarchy]
  )

  const parasutTree = useMemo(() => buildParasutTree(parasutCategories), [parasutCategories])

  const toggleMaster = useCallback((key: string) => {
    setExpandedMaster((p) => {
      const next = new Set(p)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const toggleParasut = useCallback((key: string) => {
    setExpandedParasut((p) => {
      const next = new Set(p)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const matchedParasutIds = useMemo(() => new Set(Object.values(mappings)), [mappings])

  /** Alt kategorilerde eşleşmemiş varsa true (üst kategorileri turuncu yapmak için) */
  const hasUnmatchedDescendant = useCallback(
    (node: ParasutTreeNode): boolean => {
      const k = String(node.category.id)
      if (!matchedParasutIds.has(k)) return true
      return node.children.some((ch) => hasUnmatchedDescendant(ch))
    },
    [matchedParasutIds]
  )

  const parasutById = useMemo(() => {
    const m = new Map<string, ParasutCategory>()
    parasutCategories.forEach((c) => m.set(String(c.id), c))
    return m
  }, [parasutCategories])

  const buildDisplayPath = useCallback(
    (c: ParasutCategory): string => {
      const parts: string[] = []
      const seen = new Set<string>()
      let cur: ParasutCategory | undefined = c
      for (let i = 0; i < 10 && cur; i++) {
        if (seen.has(String(cur.id))) break
        seen.add(String(cur.id))
        const n = String(cur.name ?? '').trim() || (cur === c ? String(cur.id) : '')
        if (n) parts.unshift(n)
        cur = cur.parent_id ? parasutById.get(String(cur.parent_id)) : undefined
      }
      return parts.join(' > ') || String(c.name ?? '') || String(c.id)
    },
    [parasutById]
  )

  const openPicker = useCallback((masterId: number) => {
    setPickerForMasterId(masterId)
    setPickerOpen(true)
  }, [])

  const closePicker = useCallback(() => {
    setPickerOpen(false)
    setPickerForMasterId(null)
  }, [])

  const fetchMaster = useCallback(async () => {
    setMasterLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/product-categories?limit=9999`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ana kategoriler yüklenemedi')
      setMasterCategories((data.data ?? []) as CategoryItem[])
    } catch {
      setMasterCategories([])
    } finally {
      setMasterLoading(false)
    }
  }, [])

  const fetchParasut = useCallback(async () => {
    setParasutLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/parasut/categories`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Paraşüt kategorileri yüklenemedi')
      setParasutCategories(data.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yüklenemedi')
      setParasutCategories([])
    } finally {
      setParasutLoading(false)
    }
  }, [])

  const fetchMappings = useCallback(async () => {
    setMappingsLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/parasut/category-mappings`)
      const data = await res.json()
      setMappings(data.mappings ?? {})
    } catch {
      setMappings({})
    } finally {
      setMappingsLoading(false)
    }
  }, [])

  const saveMapping = useCallback(
    async (masterId: number, parasutId: string) => {
      const key = String(masterId)
      setSavingId(masterId)
      try {
        const next = { ...mappings, [key]: parasutId }
        const res = await fetch(`${API_URL}/api/parasut/category-mappings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mappings: next }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Kaydedilemedi')
        setMappings(next)
        setSelections((p) => ({ ...p, [key]: '' }))
        closePicker()
        toastSuccess('Başarılı', 'Eşleştirme kaydedildi.')
      } catch (err) {
        toastError('Hata', err instanceof Error ? err.message : 'Kaydedilemedi')
      } finally {
        setSavingId(null)
      }
    },
    [mappings, closePicker]
  )

  const handleMatch = useCallback(
    async (h: HierarchyItem, parasutId: string) => {
      const masterId = h.id
      const masterName = h.path[h.path.length - 1]?.name ?? ''

      if (parasutId === NEW_CREATE_VALUE && masterName) {
        setSavingId(masterId)
        try {
          let parentParasutId: string | undefined
          const item = masterCategories.find((c) => c.id === masterId)
          if (item) {
            const parentMasterId =
              item.category_id && item.category_id > 0
                ? item.category_id
                : item.group_id && item.group_id > 0
                  ? item.group_id
                  : undefined
            if (parentMasterId) {
              parentParasutId = mappings[String(parentMasterId)]
              if (!parentParasutId) {
                toastError('Hata', 'Önce üst kategoriyi eşleştirin.')
                setSavingId(null)
                return
              }
            }
          }
          const createRes = await fetch(`${API_URL}/api/parasut/categories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: masterName, parent_id: parentParasutId ?? undefined }),
          })
          const createData = await createRes.json()
          if (!createRes.ok) throw new Error(createData.error || "Paraşüt'te oluşturulamadı")
          const newId = createData.id
          if (newId) {
            await saveMapping(masterId, newId)
            fetchParasut()
          }
        } catch (err) {
          toastError('Hata', err instanceof Error ? err.message : 'Oluşturulamadı')
        } finally {
          setSavingId(null)
        }
      } else if (parasutId && parasutId !== NEW_CREATE_VALUE) {
        setSavingId(masterId)
        try {
          if (masterName) {
            const updateRes = await fetch(`${API_URL}/api/parasut/categories/${parasutId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: masterName }),
            })
            const updateData = await updateRes.json()
            if (!updateRes.ok) {
              toastError('Hata', updateData.error || 'Paraşüt kategori ismi güncellenemedi')
              return
            }
          }
          await saveMapping(masterId, parasutId)
          fetchParasut()
        } catch (err) {
          toastError('Hata', err instanceof Error ? err.message : 'Eşleştirme kaydedilemedi')
        } finally {
          setSavingId(null)
        }
      } else {
        toastError('Hata', 'Paraşüt kategorisi seçin veya "Yeni oluştur" ile eşleştirin.')
      }
    },
    [mappings, masterCategories, saveMapping, fetchParasut]
  )

  const removeMapping = useCallback(
    async (masterId: number) => {
      const key = String(masterId)
      const next = { ...mappings }
      delete next[key]
      setSavingId(masterId)
      try {
        const res = await fetch(`${API_URL}/api/parasut/category-mappings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mappings: next }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Kaydedilemedi')
        setMappings(next)
        toastSuccess('Başarılı', 'Eşleştirme kaldırıldı.')
      } catch (err) {
        toastError('Hata', err instanceof Error ? err.message : 'Kaydedilemedi')
      } finally {
        setSavingId(null)
      }
    },
    [mappings]
  )

  useEffect(() => {
    fetchMaster()
  }, [fetchMaster])

  useEffect(() => {
    fetchParasut()
  }, [fetchParasut])

  useEffect(() => {
    fetchMappings()
  }, [fetchMappings])

  const isLoading = masterLoading || parasutLoading || mappingsLoading

  const renderMasterRow = (node: MasterTreeNode, depth: number): ReactNode => {
    const { item, hierarchyItem, children } = node
    const key = String(item.id)
    const parasutId = mappings[key]
    const isMatched = !!parasutId
    const matchedParasut = parasutId ? parasutById.get(parasutId) : null
    const sel = selections[key]
    const hasChildren = children.length > 0
    const expKey = `m-${item.id}`
    const isExpanded = expandedMaster.has(expKey)

    return (
      <div key={item.id}>
        <div
          className={cn(
            'grid grid-cols-[1fr_320px] gap-4 items-center border-b px-4 py-2.5 text-sm',
            isMatched ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : 'hover:bg-muted/30'
          )}
        >
          <div
            className="min-w-0 flex items-center gap-2"
            style={{ paddingLeft: `${16 + depth * 24}px` }}
          >
            <button
              type="button"
              onClick={() => hasChildren && toggleMaster(expKey)}
              className={cn('shrink-0 p-0.5 rounded hover:bg-muted/50', !hasChildren && 'invisible')}
            >
              {hasChildren ? (
                isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )
              ) : (
                <span className="w-4 inline-block" />
              )}
            </button>
            <span className="font-medium truncate">
              {hierarchyItem.path[hierarchyItem.path.length - 1]?.name}
            </span>
            <span className="text-xs text-muted-foreground shrink-0">
              [{hierarchyItem.path[hierarchyItem.path.length - 1]?.code}]
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isMatched ? (
              <>
                <span className="flex-1 truncate text-muted-foreground">
                  {String(matchedParasut?.full_path ?? matchedParasut?.name ?? parasutId ?? '')}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-destructive hover:text-destructive shrink-0"
                  onClick={() => removeMapping(item.id)}
                  disabled={savingId === item.id}
                >
                  Kaldır
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs shrink-0"
                  onClick={() => openPicker(item.id)}
                  disabled={parasutLoading}
                >
                  Kategori seç
                </Button>
                {sel && (
                  <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                    {sel === NEW_CREATE_VALUE
                      ? 'Yeni oluştur'
                      : (() => {
                          const pc = parasutById.get(sel)
                          return pc ? buildDisplayPath(pc) : sel
                        })()}
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs shrink-0"
                  onClick={() => sel && handleMatch(hierarchyItem, sel)}
                  disabled={savingId === item.id || !sel}
                >
                  {savingId === item.id ? '...' : <><Link2 className="h-3.5 w-3 mr-1" />Eşleştir</>}
                </Button>
              </>
            )}
          </div>
        </div>
        {isExpanded && children.map((child) => renderMasterRow(child, depth + 1))}
      </div>
    )
  }

  return (
    <PageLayout
      title="Paraşüt Kategoriler"
      description="Master kategorileri Paraşüt ürün/hizmet kategorileriyle eşleştirin"
      backTo="/parasut"
      contentOverflow="hidden"
    >
      <Card className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <CardHeader className="pb-3 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <FolderTree className="h-5 w-5" />
              Kategori Eşleştirme
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                fetchMaster()
                fetchParasut()
                fetchMappings()
              }}
              disabled={isLoading}
            >
              <RefreshCw className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
              Yenile
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0 flex-1 min-h-0 overflow-hidden flex flex-col">
          {error && (
            <div className="flex items-center gap-2 p-4 text-destructive bg-destructive/10 mx-4 rounded-lg shrink-0">
              <span>{error}</span>
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Yükleniyor...</div>
            ) : masterTree.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                Ana kategoriler bulunamadı. Önce parametrelerden kategoriler ekleyin.
              </div>
            ) : (
              <div className="border-t">
                <div className="grid grid-cols-[1fr_320px] gap-4 border-b bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">
                  <div>Master kategori</div>
                  <div>Paraşüt eşleşmesi</div>
                </div>
                {masterTree.map((node) => renderMasterRow(node, 0))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={pickerOpen} onOpenChange={(open) => !open && closePicker()}>
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Paraşüt Kategorisi Seç</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto py-2">
            <div className="space-y-0.5">
              <button
                type="button"
                onClick={() => {
                  if (pickerForMasterId) {
                    setSelections((p) => ({ ...p, [String(pickerForMasterId)]: NEW_CREATE_VALUE }))
                  }
                }}
                className="w-full text-left px-3 py-2 rounded-md hover:bg-muted/50 text-sm font-medium"
              >
                — Yeni oluştur —
              </button>
              {parasutTree.map((node) => {
                const renderParasutNode = (n: ParasutTreeNode, d: number) => {
                  const { category, children } = n
                  const k = String(category.id)
                  const hasChildren = children.length > 0
                  const expKey = `p-${k}`
                  const isExpanded = expandedParasut.has(expKey)
                  const isDisabled = matchedParasutIds.has(k)
                  const isSelected = pickerForMasterId && selections[String(pickerForMasterId)] === k
                  const hasUnmatched = hasUnmatchedDescendant(n)
                  const displayName = String(category.name ?? '').trim() || String(category.id)
                  const indent = d * 24

                  return (
                    <div key={k}>
                      <div
                        className={cn(
                          'flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer',
                          isDisabled && 'opacity-50',
                          isSelected && 'bg-primary/10',
                          hasUnmatched && 'bg-amber-50 dark:bg-amber-950/30',
                          !isDisabled && 'hover:bg-muted/50'
                        )}
                        style={{ paddingLeft: indent + 12 }}
                      >
                        <button
                          type="button"
                          onClick={() => hasChildren && toggleParasut(expKey)}
                          className={cn('shrink-0 p-0.5 rounded', !hasChildren && 'invisible')}
                        >
                          {hasChildren ? (
                            isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )
                          ) : (
                            <span className="w-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          disabled={isDisabled}
                          onClick={() => {
                            if (isDisabled) return
                            if (pickerForMasterId) {
                              setSelections((p) => ({ ...p, [String(pickerForMasterId)]: k }))
                            }
                          }}
                          className="flex-1 text-left text-sm truncate"
                        >
                          {displayName}
                          {isDisabled && ' ✓'}
                        </button>
                      </div>
                      {isExpanded && children.map((ch) => renderParasutNode(ch, d + 1))}
                    </div>
                  )
                }
                return renderParasutNode(node, 0)
              })}
            </div>
          </div>
          <DialogFooter>
            {pickerForMasterId && (
              <>
                <span className="text-sm text-muted-foreground mr-auto">
                  {selections[String(pickerForMasterId)] === NEW_CREATE_VALUE
                    ? 'Yeni oluştur seçildi'
                    : selections[String(pickerForMasterId)]
                      ? (() => {
                          const pc = parasutById.get(selections[String(pickerForMasterId)]!)
                          return pc ? `Seçilen: ${buildDisplayPath(pc)}` : 'Seçildi'
                        })()
                      : 'Kategori seçin'}
                </span>
                <Button variant="outline" onClick={closePicker}>
                  İptal
                </Button>
                <DialogClose asChild>
                  <Button
                    type="button"
                    onClick={() => {
                      const sel = selections[String(pickerForMasterId)]
                      const h = fullHierarchy.find((x) => x.id === pickerForMasterId)
                      if (h && sel) handleMatch(h, sel)
                    }}
                    disabled={
                      !selections[String(pickerForMasterId)] ||
                      savingId === pickerForMasterId
                    }
                  >
                    {savingId === pickerForMasterId ? '...' : 'Eşleştir'}
                  </Button>
                </DialogClose>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-xs text-muted-foreground mt-4 px-1">
        Master kategoriler ağaç yapısında. &quot;Kategori seç&quot; ile modal açılır, Paraşüt kategorisi seçip
        &quot;Eşleştir&quot; ile kaydedin.
      </p>
    </PageLayout>
  )
}
