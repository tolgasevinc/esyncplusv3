import { useState, useCallback, useEffect } from 'react'
import { API_URL, parseJsonResponse } from '@/lib/api'

interface TableInfo {
  name: string
  rowCount: number
}

export interface HomeStats {
  products: number
  customers: number
  offers: number
  eDocuments: number
  brands: number
  suppliers: number
}

export interface RecentEdoc {
  id: number
  date: string
  invoice_no?: string
  sender?: string
  receiver?: string
  amount?: number
  type: string
  description?: string
}

export interface HomePageData {
  stats: HomeStats
  apiOnline: boolean
  recentEdocs: RecentEdoc[]
  lastRefresh: Date | null
  loading: boolean
  error: string | null
  refresh: () => void
}

const TABLE_STAT_MAP: Partial<Record<string, keyof HomeStats>> = {
  products: 'products',
  customers: 'customers',
  offers: 'offers',
  e_documents: 'eDocuments',
  product_brands: 'brands',
  suppliers: 'suppliers',
}

const EMPTY_STATS: HomeStats = {
  products: 0,
  customers: 0,
  offers: 0,
  eDocuments: 0,
  brands: 0,
  suppliers: 0,
}

export function useHomePageData(): HomePageData {
  const [stats, setStats] = useState<HomeStats>(EMPTY_STATS)
  const [apiOnline, setApiOnline] = useState(false)
  const [recentEdocs, setRecentEdocs] = useState<RecentEdoc[]>([])
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const [healthRes, tablesRes, edocsRes] = await Promise.allSettled([
        fetch(`${API_URL}/health`),
        fetch(`${API_URL}/tables/info`),
        fetch(`${API_URL}/api/e-documents?limit=5&sort_by=date&sort_order=desc`),
      ])

      // API health
      const online =
        healthRes.status === 'fulfilled' && healthRes.value.ok
      setApiOnline(online)

      // Table row counts
      if (tablesRes.status === 'fulfilled' && tablesRes.value.ok) {
        const tables = await parseJsonResponse<TableInfo[]>(tablesRes.value)
        const newStats: HomeStats = { ...EMPTY_STATS }
        for (const t of tables) {
          const key = TABLE_STAT_MAP[t.name]
          if (key) newStats[key] = t.rowCount
        }
        setStats(newStats)
      }

      // Recent e-documents
      if (edocsRes.status === 'fulfilled' && edocsRes.value.ok) {
        const parsed = await parseJsonResponse<{ data: RecentEdoc[] }>(
          edocsRes.value,
        )
        setRecentEdocs(parsed.data ?? [])
      }

      setLastRefresh(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Veri yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  return {
    stats,
    apiOnline,
    recentEdocs,
    lastRefresh,
    loading,
    error,
    refresh: fetchData,
  }
}
