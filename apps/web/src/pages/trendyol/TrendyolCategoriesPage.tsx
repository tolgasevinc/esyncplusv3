import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Loader2, Search, X } from 'lucide-react'
import { PageLayout } from '@/components/layout/PageLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  fetchTrendyolCategories,
  type TrendyolCategoryTreeNode,
} from '@/lib/trendyol-api'
import { cn } from '@/lib/utils'

function normalizeSearch(s: string): string {
  return s.trim().toLocaleLowerCase('tr')
}

/** Eşleşen dalları ve üst düğümleri tutar; boş aramada ağacın tamamı */
function filterCategoryTree(nodes: TrendyolCategoryTreeNode[], query: string): TrendyolCategoryTreeNode[] {
  const q = normalizeSearch(query)
  if (!q) return nodes

  function walk(node: TrendyolCategoryTreeNode): TrendyolCategoryTreeNode | null {
    const nameMatch = normalizeSearch(node.name).includes(q)
    const subs = node.subCategories?.map(walk).filter(Boolean) as TrendyolCategoryTreeNode[] | undefined
    const keptSubs = subs?.length ? subs : undefined
    if (nameMatch || (keptSubs && keptSubs.length > 0)) {
      return {
        id: node.id,
        name: node.name,
        ...(keptSubs && keptSubs.length > 0 ? { subCategories: keptSubs } : {}),
      }
    }
    return null
  }

  return nodes.map(walk).filter(Boolean) as TrendyolCategoryTreeNode[]
}

const DEPTH_PAD = ['pl-0', 'pl-[14px]', 'pl-[28px]', 'pl-[42px]', 'pl-[56px]', 'pl-[70px]', 'pl-[84px]', 'pl-[98px]', 'pl-[112px]', 'pl-[126px]', 'pl-[140px]', 'pl-[154px]', 'pl-[168px]', 'pl-[182px]', 'pl-[196px]', 'pl-[210px]', 'pl-[224px]', 'pl-[238px]', 'pl-[252px]', 'pl-[266px]', 'pl-[280px]'] as const

function depthPadClass(depth: number): string {
  return DEPTH_PAD[Math.min(Math.max(depth, 0), DEPTH_PAD.length - 1)] ?? 'pl-[280px]'
}

function CategoryBranch({
  node,
  depth,
  forceOpen,
}: {
  node: TrendyolCategoryTreeNode
  depth: number
  forceOpen: boolean
}) {
  const subs = node.subCategories
  const hasChildren = subs && subs.length > 0
  const pad = depthPadClass(depth)

  if (!hasChildren) {
    return (
      <div className={cn('flex items-start gap-2 py-1.5 text-sm border-b border-border/40 last:border-0', pad)}>
        <span className="text-muted-foreground tabular-nums shrink-0 w-14 text-right">{node.id}</span>
        <span className="min-w-0 break-words">{node.name}</span>
      </div>
    )
  }

  return (
    <details className="group border-b border-border/40 last:border-0" open={forceOpen}>
      <summary
        className={cn(
          'cursor-pointer py-2 text-sm list-none flex items-start gap-2 [&::-webkit-details-marker]:hidden',
          'hover:bg-muted/40 rounded-md px-1 -mx-1',
          pad,
        )}
      >
        <ChevronRight className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground group-open:rotate-90 transition-transform" />
        <span className="text-muted-foreground tabular-nums shrink-0 w-12 text-right">{node.id}</span>
        <span className="font-medium min-w-0 break-words">{node.name}</span>
      </summary>
      <div className="pb-1">
        {subs!.map((ch, i) => (
          <CategoryBranch key={`${ch.id}-${depth}-${i}`} node={ch} depth={depth + 1} forceOpen={forceOpen} />
        ))}
      </div>
    </details>
  )
}

export function TrendyolCategoriesPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tree, setTree] = useState<TrendyolCategoryTreeNode[]>([])
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { tree: t } = await fetchTrendyolCategories()
      setTree(t)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yükleme hatası')
      setTree([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => filterCategoryTree(tree, search), [tree, search])
  const forceOpen = search.trim().length > 0
  const hasFilter = search.trim().length > 0

  return (
    <PageLayout
      title="Trendyol — Kategoriler"
      description="Trendyol ürün kategori ağacı (GET product-categories). Arama, eşleşen dalları ve üst kategorileri gösterir."
      backTo="/trendyol"
      showRefresh
      onRefresh={() => void load()}
      headerActions={
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <div className="relative flex-1 min-w-[12rem] max-w-md">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-9 pr-9"
              placeholder="Kategori adında ara…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Kategori ara"
            />
            {hasFilter && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0.5 top-1/2 -translate-y-1/2 h-8 w-8"
                    onClick={() => setSearch('')}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Aramayı temizle</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>Kategori ağacı</CardTitle>
          <CardDescription>
            Kaynak:{' '}
            <code className="text-[11px] bg-muted px-1 rounded">/integration/product/product-categories</code> —{' '}
            <Link className="underline font-medium text-foreground" to="/ayarlar/marketplace?m=trendyol">
              Marketplace › Trendyol
            </Link>{' '}
            API bilgileri gerekir.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
              <Loader2 className="h-5 w-5 animate-spin" />
              Kategoriler yükleniyor…
            </div>
          )}
          {!loading && error && !tree.length && (
            <p className="text-sm text-destructive py-4">{error}</p>
          )}
          {!loading && !filtered.length && (
            <p className="text-sm text-muted-foreground py-6">
              {tree.length === 0 ? 'Kategori dönmedi veya liste boş.' : 'Arama sonucu yok.'}
            </p>
          )}
          {!loading && filtered.length > 0 && (
            <div className="rounded-md border bg-card max-h-[min(70vh,720px)] overflow-y-auto pr-1">
              <div className="p-2 space-y-0">
                {filtered.map((n, i) => (
                  <CategoryBranch key={`${n.id}-r-${i}`} node={n} depth={0} forceOpen={forceOpen} />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </PageLayout>
  )
}
