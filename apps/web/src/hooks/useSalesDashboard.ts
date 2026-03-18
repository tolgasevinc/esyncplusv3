/**
 * useSalesDashboard — B2B Sales Operations Dashboard Data Hook
 *
 * Currently powered by realistic mock data. Replace the mock fetch functions
 * with real API calls (API_URL) when the backend endpoints are ready.
 */

import { useState, useCallback, useEffect } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type VisitStatus = 'completed' | 'pending' | 'skipped'
export type OrderStatus = 'new' | 'processing' | 'ready'
export type AlertSeverity = 'high' | 'medium' | 'low'
export type AlertType = 'overdue' | 'stock_out' | 'price_change' | 'return'
export type ActivityType = 'order' | 'visit' | 'payment' | 'return' | 'note'
export type StockLevel = 'critical' | 'low' | 'ok'

export interface KpiData {
  dailyRevenue: number
  dailyRevenueChange: number
  pendingOrdersCount: number
  pendingOrdersAmount: number
  visitsCompleted: number
  visitsTotal: number
  collection: number
  collectionChange: number
}

export interface VisitItem {
  id: number
  customer: string
  initials: string
  address: string
  scheduledTime: string
  status: VisitStatus
  orderId?: string
  amount?: number
}

export interface PendingOrder {
  id: number
  orderNo: string
  customer: string
  amount: number
  itemCount: number
  date: string
  status: OrderStatus
}

export interface OrderAlert {
  id: number
  type: AlertType
  message: string
  severity: AlertSeverity
  time: string
}

export interface StockItem {
  id: number
  name: string
  sku: string
  stock: number
  threshold: number
  unit: string
  level: StockLevel
}

export interface ActivityItem {
  id: number
  type: ActivityType
  description: string
  time: string
  user: string
  amount?: number
}

export interface SalesDashboardData {
  kpi: KpiData
  visits: VisitItem[]
  pendingOrders: PendingOrder[]
  alerts: OrderAlert[]
  lowStock: StockItem[]
  activity: ActivityItem[]
  loading: boolean
  lastRefresh: Date | null
  refresh: () => void
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_KPI: KpiData = {
  dailyRevenue: 184350,
  dailyRevenueChange: 12.4,
  pendingOrdersCount: 17,
  pendingOrdersAmount: 423800,
  visitsCompleted: 6,
  visitsTotal: 9,
  collection: 97500,
  collectionChange: -3.1,
}

const MOCK_VISITS: VisitItem[] = [
  { id: 1, customer: 'Anadolu Market A.Ş.', initials: 'AM', address: 'Bağcılar, İstanbul', scheduledTime: '09:00', status: 'completed', orderId: 'SP-2401', amount: 18450 },
  { id: 2, customer: 'Yıldız Zincir Mağazacılık', initials: 'YZ', address: 'Kadıköy, İstanbul', scheduledTime: '10:30', status: 'completed', orderId: 'SP-2402', amount: 7200 },
  { id: 3, customer: 'Güneş Toptan Ltd.', initials: 'GT', address: 'Ümraniye, İstanbul', scheduledTime: '12:00', status: 'completed' },
  { id: 4, customer: 'Metro Grossmarket', initials: 'MG', address: 'Maltepe, İstanbul', scheduledTime: '13:30', status: 'pending' },
  { id: 5, customer: 'Akdeniz Gıda Paz.', initials: 'AG', address: 'Üsküdar, İstanbul', scheduledTime: '15:00', status: 'pending' },
  { id: 6, customer: 'Karadeniz Toptan', initials: 'KT', address: 'Beykoz, İstanbul', scheduledTime: '16:30', status: 'skipped' },
  { id: 7, customer: 'Boğaz Ticaret San.', initials: 'BT', address: 'Sarıyer, İstanbul', scheduledTime: '09:30', status: 'completed', orderId: 'SP-2405', amount: 42100 },
  { id: 8, customer: 'Ege Dağıtım A.Ş.', initials: 'ED', address: 'Bayrampaşa, İstanbul', scheduledTime: '11:00', status: 'pending' },
  { id: 9, customer: 'Turan Toptan Ltd.', initials: 'TT', address: 'Eyüpsultan, İstanbul', scheduledTime: '14:00', status: 'pending' },
]

const MOCK_ORDERS: PendingOrder[] = [
  { id: 1, orderNo: 'SP-2410', customer: 'Anadolu Market A.Ş.', amount: 48750, itemCount: 14, date: '16.03.2026', status: 'new' },
  { id: 2, orderNo: 'SP-2409', customer: 'Yıldız Zincir Mağazacılık', amount: 23400, itemCount: 8, date: '16.03.2026', status: 'processing' },
  { id: 3, orderNo: 'SP-2407', customer: 'Metro Grossmarket', amount: 87600, itemCount: 22, date: '15.03.2026', status: 'ready' },
  { id: 4, orderNo: 'SP-2406', customer: 'Güneş Toptan Ltd.', amount: 15200, itemCount: 5, date: '15.03.2026', status: 'processing' },
  { id: 5, orderNo: 'SP-2404', customer: 'Boğaz Ticaret San.', amount: 62100, itemCount: 18, date: '14.03.2026', status: 'new' },
  { id: 6, orderNo: 'SP-2403', customer: 'Akdeniz Gıda Paz.', amount: 33500, itemCount: 9, date: '14.03.2026', status: 'new' },
]

const MOCK_ALERTS: OrderAlert[] = [
  { id: 1, type: 'overdue', message: 'Karadeniz Toptan — 45.000 ₺ ödeme 12 gün vadesi geçti', severity: 'high', time: '2s önce' },
  { id: 2, type: 'stock_out', message: 'Ürün "AB-PRO-2404" stokta kalmadı, 3 bekleyen sipariş etkilendi', severity: 'high', time: '18dk önce' },
  { id: 3, type: 'price_change', message: 'Tedarikçi fiyatı: Marka X ürünlerinde %8 artış — teklif fiyatları güncellenebilir', severity: 'medium', time: '1sa önce' },
  { id: 4, type: 'return', message: 'İade talebi: Metro Grossmarket — SP-2391, 3 kalem ürün', severity: 'medium', time: '3sa önce' },
  { id: 5, type: 'overdue', message: 'Ege Dağıtım A.Ş. — 18.500 ₺ ödeme 7 gün vadesi geçti', severity: 'low', time: 'dün' },
]

const MOCK_STOCK: StockItem[] = [
  { id: 1, name: 'Yemek Sepeti Pro 500ml', sku: 'AB-PRO-2404', stock: 0, threshold: 50, unit: 'adet', level: 'critical' },
  { id: 2, name: 'Endüstriyel Temizlik Kiti', sku: 'CL-KIT-1102', stock: 8, threshold: 30, unit: 'adet', level: 'critical' },
  { id: 3, name: 'Plastik Kasa 45L', sku: 'PK-0045-BL', stock: 22, threshold: 80, unit: 'adet', level: 'low' },
  { id: 4, name: 'Ambalaj Streç Film', sku: 'AM-STR-180', stock: 15, threshold: 60, unit: 'rulo', level: 'low' },
  { id: 5, name: 'Alüminyum Folyo 30cm', sku: 'AL-FOL-030', stock: 40, threshold: 100, unit: 'rulo', level: 'low' },
]

const MOCK_ACTIVITY: ActivityItem[] = [
  { id: 1, type: 'order', description: 'Sipariş oluşturuldu: SP-2410 — Anadolu Market A.Ş.', time: '14:22', user: 'Mehmet A.', amount: 48750 },
  { id: 2, type: 'visit', description: 'Ziyaret tamamlandı: Boğaz Ticaret San.', time: '13:55', user: 'Mehmet A.' },
  { id: 3, type: 'payment', description: 'Tahsilat alındı: Metro Grossmarket', time: '13:10', user: 'Mehmet A.', amount: 62000 },
  { id: 4, type: 'order', description: 'Sipariş oluşturuldu: SP-2409 — Yıldız Zincir', time: '11:44', user: 'Mehmet A.', amount: 23400 },
  { id: 5, type: 'visit', description: 'Ziyaret tamamlandı: Güneş Toptan Ltd.', time: '11:20', user: 'Mehmet A.' },
  { id: 6, type: 'note', description: 'Not eklendi: Anadolu Market yeni depo açıyor, Nisan\'da büyük sipariş bekleniyor', time: '10:58', user: 'Mehmet A.' },
  { id: 7, type: 'return', description: 'İade kaydedildi: Metro Grossmarket SP-2391', time: '10:30', user: 'Sistem' },
  { id: 8, type: 'visit', description: 'Ziyaret tamamlandı: Yıldız Zincir Mağazacılık', time: '09:48', user: 'Mehmet A.' },
]

// ─── Simulated async fetch (replace with real API_URL calls) ─────────────────

async function fetchDashboardData(): Promise<Omit<SalesDashboardData, 'loading' | 'lastRefresh' | 'refresh'>> {
  // Simulate network latency
  await new Promise((r) => setTimeout(r, 800))
  return {
    kpi: MOCK_KPI,
    visits: MOCK_VISITS,
    pendingOrders: MOCK_ORDERS,
    alerts: MOCK_ALERTS,
    lowStock: MOCK_STOCK,
    activity: MOCK_ACTIVITY,
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

const DEFAULT_KPI: KpiData = {
  dailyRevenue: 0,
  dailyRevenueChange: 0,
  pendingOrdersCount: 0,
  pendingOrdersAmount: 0,
  visitsCompleted: 0,
  visitsTotal: 0,
  collection: 0,
  collectionChange: 0,
}

export function useSalesDashboard(): SalesDashboardData {
  const [kpi, setKpi] = useState<KpiData>(DEFAULT_KPI)
  const [visits, setVisits] = useState<VisitItem[]>([])
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([])
  const [alerts, setAlerts] = useState<OrderAlert[]>([])
  const [lowStock, setLowStock] = useState<StockItem[]>([])
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchDashboardData()
      setKpi(data.kpi)
      setVisits(data.visits)
      setPendingOrders(data.pendingOrders)
      setAlerts(data.alerts)
      setLowStock(data.lowStock)
      setActivity(data.activity)
      setLastRefresh(new Date())
    } catch (err) {
      console.error('SalesDashboard fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { kpi, visits, pendingOrders, alerts, lowStock, activity, loading, lastRefresh, refresh }
}
