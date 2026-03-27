import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { FolderTree, RefreshCw, Link2, ChevronRight, ChevronDown, Bug } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { PageLayout } from '@/components/layout/PageLayout'
import { API_URL } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toastSuccess, toastError } from '@/lib/toast'
import { buildHierarchyWithSelectableGroups, type CategoryItem, type HierarchyItem } from '@/components/CategorySelect'

interface IdeasoftCategory {
  id: string
  name?: string
  parent_id?: string | null
}

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

interface IdeasoftTreeNode {
  category: IdeasoftCategory
  children: IdeasoftTreeNode[]
}

function buildIdeasoftTree(categories: IdeasoftCategory[]): IdeasoftTreeNode[] {
  const byParent = new Map<string, IdeasoftCategory[]>()
  const roots: IdeasoftCategory[] = []
  categories.forEach((c) => {
    const pid = c.parent_id
    const pidStr =
      pid != null && pid !== '' && String(pid) !== '0' ? String(pid) : null
    if (!pidStr) roots.push(c)
    else {
      if (!byParent.has(pidStr)) byParent.set(pidStr, [])
      byParent.get(pidStr)!.push(c)
    }
  })
  roots.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))

  const build = (items: IdeasoftCategory[]): IdeasoftTreeNode[] =>
    items.map((c) => {
      const children = byParent.get(String(c.id)) || []
      children.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
      return { category: c, children: build(children) }
    })

  return build(roots)
}

export function IdeasoftCategoriesPage() {
  const [masterCategories, setMasterCategories] = useState<CategoryItem[]>([])
  const [ideasoftCategories, setIdeasoftCategories] = useState<IdeasoftCategory[]>([])
  const [mappings, setMappings] = useState<Record<string, string>>({})
  const [masterLoading, setMasterLoading] = useState(true)
  const [ideasoftLoading, setIdeasoftLoading] = useState(true)
  const [mappingsLoading, setMappingsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [oauthReconnectHint, setOauthReconnectHint] = useState(false)
  const [savingId, setSavingId] = useState<string | number | null>(null)
  const [selections, setSelections] = useState<Record<string, string>>({})
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerForMasterId, setPickerForMasterId] = useState<number | null>(null)
  const [expandedMaster, setExpandedMaster] = useState<Set<string>>(new Set())
  const [expandedIdeasoft, setExpandedIdeasoft] = useState<Set<string>>(new Set())
  const [debugOpen, setDebugOpen] = useState(false)
  const [debugData, setDebugData] = useState<{ storeBase?: string; results?: { path: string; url: string; status: number; memberCount: number; rawPreview: string }[]; error?: string } | null>(null)
  const [debugLoading, setDebugLoading] = useState(false)

  const fullHierarchy = useMemo(
    () => buildHierarchyWithSelectableGroups(masterCategories),
    [masterCategories]
  )

  const masterTree = useMemo(
    () => buildMasterTree(masterCategories, fullHierarchy),
    [masterCategories, fullHierarchy]
  )

  const ideasoftTree = useMemo(() => buildIdeasoftTree(ideasoftCategories), [ideasoftCategories])

  const toggleMaster = useCallback((key: string) => {
    setExpandedMaster((p) => {
      const next = new Set(p)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const toggleIdeasoft = useCallback((key: string) => {
    setExpandedIdeasoft((p) => {
      const next = new Set(p)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const matchedIdeasoftIds = useMemo(() => new Set(Object.values(mappings)), [mappings])

  /** Alt kategorilerde eşleşmemiş varsa true (üst kategorileri turuncu yapmak için) */
  const hasUnmatchedDescendant = useCallback(
    (node: IdeasoftTreeNode): boolean => {
      const k = String(node.category.id)
      if (!matchedIdeasoftIds.has(k)) return true
      return node.children.some((ch) => hasUnmatchedDescendant(ch))
    },
    [matchedIdeasoftIds]
  )

  const ideasoftById = useMemo(() => {
    const m = new Map<string, IdeasoftCategory>()
    ideasoftCategories.forEach((c) => m.set(String(c.id), c))
    return m
  }, [ideasoftCategories])

  const buildDisplayPath = useCallback(
    (c: IdeasoftCategory): string => {
      const parts: string[] = []
      const seen = new Set<string>()
      let cur: IdeasoftCategory | undefined = c
      for (let i = 0; i < 10 && cur; i++) {
        if (seen.has(String(cur.id))) break
        seen.add(String(cur.id))
        const n = String(cur.name ?? '').trim() || (cur === c ? String(cur.id) : '')
        if (n) parts.unshift(n)
        cur = cur.parent_id ? ideasoftById.get(String(cur.parent_id)) : undefined
      }
      return parts.join(' > ') || String(c.name ?? '') || String(c.id)
    },
    [ideasoftById]
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

  const fetchIdeasoft = useCallback(async () => {
    setIdeasoftLoading(true)
    setError(null)
    setOauthReconnectHint(false)
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/categories`)
      const data = await res.json()
      if (!res.ok) {
        const msg = String(data.error || 'Ideasoft kategorileri yüklenemedi')
        setOauthReconnectHint(
          res.status === 401 || /oauth|yetkilendir|bağlantı/i.test(msg)
        )
        throw new Error(msg)
      }
      const raw = (data.data ?? []) as { id: string; name: string; parentId: string | null }[]
      setIdeasoftCategories(
        raw.map((x) => ({
          id: String(x.id),
          name: x.name,
          parent_id: x.parentId != null ? String(x.parentId) : null,
        }))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yüklenemedi')
      setIdeasoftCategories([])
    } finally {
      setIdeasoftLoading(false)
    }
  }, [])

  const fetchMappings = useCallback(async () => {
    setMappingsLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/category-mappings`)
      const data = await res.json()
      setMappings(data.mappings ?? {})
    } catch {
      setMappings({})
    } finally {
      setMappingsLoading(false)
    }
  }, [])

  const saveMapping = useCallback(
    async (masterId: number, ideasoftId: string) => {
      const key = String(masterId)
      setSavingId(masterId)
      try {
        const next = { ...mappings, [key]: ideasoftId }
        const res = await fetch(`${API_URL}/api/ideasoft/category-mappings`, {
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
    async (h: HierarchyItem, ideasoftId: string) => {
      if (!ideasoftId?.trim()) {
        toastError('Hata', 'Ideasoft kategorisi seçin.')
        return
      }
      await saveMapping(h.id, ideasoftId)
      void fetchIdeasoft()
    },
    [saveMapping, fetchIdeasoft]
  )

  const removeMapping = useCallback(
    async (masterId: number) => {
      const key = String(masterId)
      const next = { ...mappings }
      delete next[key]
      setSavingId(masterId)
      try {
        const res = await fetch(`${API_URL}/api/ideasoft/category-mappings`, {
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

  const fetchDebug = useCallback(async () => {
    setDebugLoading(true)
    setDebugOpen(true)
    try {
      const res = await fetch(`${API_URL}/api/ideasoft/debug/categories`)
      const data = await res.json()
      setDebugData(data as typeof debugData)
    } catch (err) {
      setDebugData({ error: err instanceof Error ? err.message : 'Tanı başarısız' })
    } finally {
      setDebugLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMaster()
  }, [fetchMaster])

  useEffect(() => {
    fetchIdeasoft()
  }, [fetchIdeasoft])

  useEffect(() => {
    fetchMappings()
  }, [fetchMappings])

  const isLoading = masterLoading || ideasoftLoading || mappingsLoading

  const renderMasterRow = (node: MasterTreeNode, depth: number): ReactNode => {
    const { item, hierarchyItem, children } = node
    const key = String(item.id)
    const ideasoftId = mappings[key]
    const isMatched = !!ideasoftId
    const matchedIdeasoft = ideasoftId ? ideasoftById.get(ideasoftId) : null
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
                  {matchedIdeasoft
                    ? buildDisplayPath(matchedIdeasoft)
                    : String(ideasoftId ?? '')}
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
                  disabled={ideasoftLoading}
                >
                  Kategori seç
                </Button>
                {sel && (
                  <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                    {(() => {
                      const pc = ideasoftById.get(sel)
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
      title="Ideasoft Kategoriler"
      description="Master kategorileri Ideasoft mağaza kategorileriyle eşleştirin"
      backTo="/ideasoft"
      contentOverflow="hidden"
    >
      <Card className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <CardHeader className="pb-3 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <FolderTree className="h-5 w-5" />
              Kategori Eşleştirme
            </CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  fetchMaster()
                  fetchIdeasoft()
                  fetchMappings()
                }}
                disabled={isLoading}
              >
                <RefreshCw className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
                Yenile
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => debugOpen ? setDebugOpen(false) : fetchDebug()}
                disabled={debugLoading}
                title="Ideasoft API tanı — ham yanıtları göster"
              >
                <Bug className="h-4 w-4 mr-1" />
                {debugLoading ? 'Sorgulanıyor…' : 'Tanı'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 flex-1 min-h-0 overflow-hidden flex flex-col">
          {error && (
            <div className="flex flex-col gap-2 p-4 text-destructive bg-destructive/10 mx-4 rounded-lg shrink-0 sm:flex-row sm:items-center sm:justify-between">
              <span>{error}</span>
              {oauthReconnectHint && (
                <Button variant="outline" size="sm" className="shrink-0 border-destructive/40" asChild>
                  <Link to="/ayarlar/entegrasyonlar/ideasoft">IdeaSoft ayarlarına git</Link>
                </Button>
              )}
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
                {!ideasoftLoading && ideasoftCategories.length === 0 && !error && (
                  <div className="px-4 py-3 text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/30 border-b space-y-1.5">
                    <p className="font-medium">Ideasoft kategorileri boş geldi.</p>
                    <p>Olası nedenler: OAuth uygulamasında kategori/ürün izni yok; mağazada kategori tanımlı değil; API yolu bu mağazada farklı.</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button variant="outline" size="sm" className="h-7 text-xs border-amber-400" onClick={() => fetchDebug()}>
                        <Bug className="h-3 w-3 mr-1" />Ham Ideasoft yanıtını göster (Tanı)
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs border-amber-400" asChild>
                        <Link to="/ayarlar/entegrasyonlar/ideasoft">OAuth ayarları</Link>
                      </Button>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-[1fr_320px] gap-4 border-b bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">
                  <div>Master kategori</div>
                  <div>Ideasoft eşleşmesi</div>
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
            <DialogTitle>Ideasoft kategorisi seç</DialogTitle>
            <DialogDescription className="sr-only">
              Master kategori ile eşleştirmek için Ideasoft mağaza kategorilerinden birini seçin.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto py-2">
            <div className="space-y-0.5">
              {!ideasoftLoading && ideasoftTree.length === 0 && (
                <p className="px-3 py-4 text-sm text-muted-foreground text-center">
                  Ideasoft kategorisi bulunamadı. Mağazada kategori oluşturun veya API izinlerini kontrol edin.
                </p>
              )}
              {ideasoftTree.map((node) => {
                const renderIdeasoftNode = (n: IdeasoftTreeNode, d: number) => {
                  const { category, children } = n
                  const k = String(category.id)
                  const hasChildren = children.length > 0
                  const expKey = `p-${k}`
                  const isExpanded = expandedIdeasoft.has(expKey)
                  const isDisabled = matchedIdeasoftIds.has(k)
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
                          onClick={() => hasChildren && toggleIdeasoft(expKey)}
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
                      {isExpanded && children.map((ch) => renderIdeasoftNode(ch, d + 1))}
                    </div>
                  )
                }
                return renderIdeasoftNode(node, 0)
              })}
            </div>
          </div>
          <DialogFooter>
            {pickerForMasterId && (
              <>
                <span className="text-sm text-muted-foreground mr-auto">
                  {selections[String(pickerForMasterId)]
                    ? (() => {
                        const pc = ideasoftById.get(selections[String(pickerForMasterId)]!)
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
        Master kategoriler ağaç yapısında. OAuth bağlantısı (Ayarlar → IdeaSoft) gerekir. &quot;Kategori seç&quot; ile
        Ideasoft kategorisi seçip &quot;Eşleştir&quot; ile kaydedin.
      </p>

      {debugOpen && (
        <div className="mt-4 rounded-lg border bg-muted/40 p-4 text-xs font-mono space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm not-italic font-sans">Ideasoft API Tanı</span>
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setDebugOpen(false)}>Kapat</Button>
          </div>
          {debugData?.error && (
            <p className="text-destructive">{debugData.error}</p>
          )}
          {debugData?.storeBase && (
            <p className="text-muted-foreground">Mağaza: <span className="text-foreground">{debugData.storeBase}</span></p>
          )}
          {debugData?.results?.map((r, i) => (
            <div key={i} className="border rounded p-2 space-y-1 bg-background">
              <div className="flex items-center gap-2">
                <span className={cn(
                  'px-1.5 py-0.5 rounded text-[10px] font-semibold',
                  r.status === 200 && r.memberCount > 0 ? 'bg-emerald-100 text-emerald-800' :
                  r.status === 200 ? 'bg-amber-100 text-amber-800' :
                  r.status === 404 ? 'bg-muted text-muted-foreground' :
                  'bg-destructive/10 text-destructive'
                )}>
                  {r.status || 'ERR'}
                </span>
                <span className="truncate text-foreground">{r.path}</span>
                {r.memberCount > 0 && (
                  <span className="ml-auto shrink-0 text-emerald-700 font-semibold">{r.memberCount} kategori</span>
                )}
              </div>
              <pre className="text-[10px] text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all">{r.rawPreview}</pre>
            </div>
          ))}
        </div>
      )}
    </PageLayout>
  )
}
