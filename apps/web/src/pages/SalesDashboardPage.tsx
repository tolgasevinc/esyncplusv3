import { Link } from 'react-router-dom'
import {
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  MapPin,
  Wallet,
  ArrowRight,
  Clock,
  CheckCircle2,
  Circle,
  XCircle,
  Package,
  AlertCircle,
  BarChart3,
  UserPlus,
  Search,
  CalendarCheck,
  Layers,
  ReceiptText,
  MessageSquare,
  RotateCcw,
  Banknote,
  Activity,
} from 'lucide-react'
import { PageLayout } from '@/components/layout/PageLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useSalesDashboard } from '@/hooks/useSalesDashboard'
import type {
  VisitItem,
  VisitStatus,
  PendingOrder,
  OrderStatus,
  OrderAlert,
  AlertSeverity,
  AlertType,
  StockItem,
  StockLevel,
  ActivityItem,
  ActivityType,
} from '@/hooks/useSalesDashboard'
import { cn } from '@/lib/utils'
import { type ReactNode } from 'react'

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatTime(d: Date | null): string {
  if (!d) return '—'
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string
  value: ReactNode
  delta?: number | null
  deltaLabel?: string
  icon: ReactNode
  iconBg: string
  iconColor: string
  loading?: boolean
  to?: string
  subValue?: string
}

function KpiCard({ label, value, delta, deltaLabel, icon, iconBg, iconColor, loading, to, subValue }: KpiCardProps) {
  const inner = (
    <Card className={cn('h-full transition-shadow', to && 'hover:shadow-md cursor-pointer')}>
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', iconBg)}>
            <span className={cn('h-5 w-5', iconColor)}>{icon}</span>
          </div>
          {delta != null && !loading && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium',
                delta >= 0
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
              )}
            >
              {delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {Math.abs(delta)}%
            </span>
          )}
        </div>
        <div>
          {loading ? (
            <Skeleton className="h-8 w-24 mb-1" />
          ) : (
            <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
          )}
          <p className="text-sm text-muted-foreground mt-0.5">{label}</p>
          {subValue && !loading && (
            <p className="text-xs text-muted-foreground mt-1">{subValue}</p>
          )}
          {deltaLabel && !loading && (
            <p className="text-xs text-muted-foreground mt-0.5">{deltaLabel}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )

  if (to) {
    return (
      <Link to={to} className="block group">
        {inner}
      </Link>
    )
  }
  return inner
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ icon, message }: { icon: ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
      <span className="opacity-40">{icon}</span>
      <p className="text-sm">{message}</p>
    </div>
  )
}

// ─── Skeleton Rows ────────────────────────────────────────────────────────────

function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-2 p-1">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  )
}

// ─── Visit Status ─────────────────────────────────────────────────────────────

const VISIT_STATUS_CONFIG: Record<VisitStatus, { label: string; icon: ReactNode; badge: string }> = {
  completed: {
    label: 'Tamamlandı',
    icon: <CheckCircle2 className="h-4 w-4 text-green-500" />,
    badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  pending: {
    label: 'Bekliyor',
    icon: <Circle className="h-4 w-4 text-amber-400" />,
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
  skipped: {
    label: 'Atlandı',
    icon: <XCircle className="h-4 w-4 text-muted-foreground" />,
    badge: 'bg-muted text-muted-foreground',
  },
}

function VisitRow({ visit }: { visit: VisitItem }) {
  const cfg = VISIT_STATUS_CONFIG[visit.status]
  return (
    <li className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors rounded-lg">
      {/* Avatar */}
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
        {visit.initials}
      </div>
      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{visit.customer}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground">{visit.scheduledTime}</span>
          {visit.address && (
            <>
              <span className="text-muted-foreground">·</span>
              <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground truncate">{visit.address}</span>
            </>
          )}
        </div>
      </div>
      {/* Status */}
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', cfg.badge)}>
          {cfg.label}
        </span>
        {visit.amount != null && (
          <span className="text-xs font-medium text-foreground tabular-nums">
            {formatCurrency(visit.amount)}
          </span>
        )}
      </div>
    </li>
  )
}

// ─── Order Status ─────────────────────────────────────────────────────────────

const ORDER_STATUS_CONFIG: Record<OrderStatus, { label: string; badge: string }> = {
  new: { label: 'Yeni', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  processing: { label: 'İşlemde', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  ready: { label: 'Hazır', badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
}

function OrderRow({ order }: { order: PendingOrder }) {
  const cfg = ORDER_STATUS_CONFIG[order.status]
  return (
    <li className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors rounded-lg">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono font-semibold text-foreground">{order.orderNo}</span>
          <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', cfg.badge)}>
            {cfg.label}
          </span>
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-xs text-muted-foreground truncate">{order.customer}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground shrink-0">{order.itemCount} kalem</span>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(order.amount)}</p>
        <p className="text-xs text-muted-foreground">{order.date}</p>
      </div>
    </li>
  )
}

// ─── Alert ────────────────────────────────────────────────────────────────────

const ALERT_SEVERITY_COLORS: Record<AlertSeverity, string> = {
  high: 'border-l-red-500 bg-red-50 dark:bg-red-950/20',
  medium: 'border-l-amber-400 bg-amber-50 dark:bg-amber-950/20',
  low: 'border-l-blue-400 bg-blue-50 dark:bg-blue-950/20',
}

const ALERT_ICON: Record<AlertType, ReactNode> = {
  overdue: <Wallet className="h-4 w-4 text-red-500" />,
  stock_out: <Package className="h-4 w-4 text-amber-500" />,
  price_change: <TrendingUp className="h-4 w-4 text-blue-500" />,
  return: <RotateCcw className="h-4 w-4 text-purple-500" />,
}

const ALERT_SEVERITY_BADGE: Record<AlertSeverity, string> = {
  high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  low: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
}

const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  high: 'Kritik',
  medium: 'Orta',
  low: 'Düşük',
}

function AlertRow({ alert }: { alert: OrderAlert }) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border-l-4 px-3 py-2.5',
        ALERT_SEVERITY_COLORS[alert.severity],
      )}
    >
      <span className="mt-0.5 shrink-0">{ALERT_ICON[alert.type]}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground leading-snug">{alert.message}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{alert.time}</p>
      </div>
      <span
        className={cn(
          'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
          ALERT_SEVERITY_BADGE[alert.severity],
        )}
      >
        {SEVERITY_LABEL[alert.severity]}
      </span>
    </div>
  )
}

// ─── Stock Row ────────────────────────────────────────────────────────────────

const STOCK_LEVEL_CONFIG: Record<StockLevel, { color: string; bar: string; badge: string; label: string }> = {
  critical: {
    color: 'text-red-600 dark:text-red-400',
    bar: 'bg-red-500',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    label: 'Kritik',
  },
  low: {
    color: 'text-amber-600 dark:text-amber-400',
    bar: 'bg-amber-400',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    label: 'Düşük',
  },
  ok: {
    color: 'text-green-600 dark:text-green-400',
    bar: 'bg-green-500',
    badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    label: 'Normal',
  },
}

function StockRow({ item }: { item: StockItem }) {
  const cfg = STOCK_LEVEL_CONFIG[item.level]
  const pct = item.threshold > 0 ? Math.min(100, Math.round((item.stock / item.threshold) * 100)) : 0

  return (
    <li className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors rounded-lg">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
        <p className="text-xs font-mono text-muted-foreground mt-0.5">{item.sku}</p>
        {/* Stock bar */}
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', cfg.bar)}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {item.stock}/{item.threshold} {item.unit}
          </span>
        </div>
      </div>
      <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-medium', cfg.badge)}>
        {cfg.label}
      </span>
    </li>
  )
}

// ─── Activity Feed ────────────────────────────────────────────────────────────

const ACTIVITY_CONFIG: Record<
  ActivityType,
  { icon: ReactNode; bg: string; color: string }
> = {
  order: {
    icon: <ShoppingCart className="h-4 w-4" />,
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    color: 'text-blue-600 dark:text-blue-400',
  },
  visit: {
    icon: <CalendarCheck className="h-4 w-4" />,
    bg: 'bg-green-100 dark:bg-green-900/30',
    color: 'text-green-600 dark:text-green-400',
  },
  payment: {
    icon: <Banknote className="h-4 w-4" />,
    bg: 'bg-purple-100 dark:bg-purple-900/30',
    color: 'text-purple-600 dark:text-purple-400',
  },
  return: {
    icon: <RotateCcw className="h-4 w-4" />,
    bg: 'bg-red-100 dark:bg-red-900/30',
    color: 'text-red-600 dark:text-red-400',
  },
  note: {
    icon: <MessageSquare className="h-4 w-4" />,
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    color: 'text-amber-600 dark:text-amber-400',
  },
}

function ActivityFeedRow({ item, isLast }: { item: ActivityItem; isLast: boolean }) {
  const cfg = ACTIVITY_CONFIG[item.type]
  return (
    <li className="flex gap-3">
      {/* Timeline line */}
      <div className="flex flex-col items-center">
        <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', cfg.bg)}>
          <span className={cfg.color}>{cfg.icon}</span>
        </div>
        {!isLast && <div className="mt-1 flex-1 w-px bg-border" />}
      </div>
      {/* Content */}
      <div className={cn('pb-4 min-w-0 flex-1', isLast && 'pb-0')}>
        <p className="text-sm text-foreground leading-snug">{item.description}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground">{item.user}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground">{item.time}</span>
          {item.amount != null && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-xs font-medium text-foreground tabular-nums">
                {formatCurrency(item.amount)}
              </span>
            </>
          )}
        </div>
      </div>
    </li>
  )
}

// ─── Quick Actions Config ─────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { label: 'Yeni Sipariş', icon: <ShoppingCart className="h-4 w-4" />, to: '/teklifler/yeni' },
  { label: 'Yeni Ziyaret', icon: <CalendarCheck className="h-4 w-4" />, to: '/satis/ziyaretler' },
  { label: 'Müşteri Ekle', icon: <UserPlus className="h-4 w-4" />, to: '/customers' },
  { label: 'Tahsilat Al', icon: <Banknote className="h-4 w-4" />, to: '/e-documents' },
  { label: 'Ürün Ara', icon: <Search className="h-4 w-4" />, to: '/products' },
  { label: 'Raporlar', icon: <BarChart3 className="h-4 w-4" />, to: '/ayarlar' },
] as const

// ─── SalesDashboardPage ───────────────────────────────────────────────────────

export function SalesDashboardPage() {
  const {
    kpi,
    visits,
    pendingOrders,
    alerts,
    lowStock,
    activity,
    loading,
    lastRefresh,
    refresh,
  } = useSalesDashboard()

  const visitsCompletedPct =
    kpi.visitsTotal > 0
      ? Math.round((kpi.visitsCompleted / kpi.visitsTotal) * 100)
      : 0

  return (
    <PageLayout
      title="Satış Operasyon Paneli"
      description="Günlük hedefler ve sahadan anlık görünüm"
      logo={<Activity className="h-5 w-5 text-primary" />}
      showRefresh
      onRefresh={refresh}
    >
      <div className="flex flex-col gap-5">

        {/* ── Last refresh bar ──────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/50 px-4 py-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            <span>Son güncelleme: {formatTime(lastRefresh)}</span>
          </div>
          {loading && (
            <>
              <span className="h-3 w-px bg-border" />
              <span>Yükleniyor...</span>
            </>
          )}
        </div>

        {/* ── KPI Cards ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard
            label="Günlük Ciro"
            value={loading ? null : formatCurrency(kpi.dailyRevenue)}
            delta={kpi.dailyRevenueChange}
            deltaLabel="değişim dünden"
            icon={<TrendingUp className="h-5 w-5" />}
            iconBg="bg-blue-100 dark:bg-blue-900/30"
            iconColor="text-blue-600 dark:text-blue-400"
            loading={loading}
            to="/teklifler"
          />
          <KpiCard
            label="Bekleyen Siparişler"
            value={loading ? null : kpi.pendingOrdersCount}
            subValue={loading ? undefined : formatCurrency(kpi.pendingOrdersAmount)}
            icon={<ShoppingCart className="h-5 w-5" />}
            iconBg="bg-amber-100 dark:bg-amber-900/30"
            iconColor="text-amber-600 dark:text-amber-400"
            loading={loading}
            to="/teklifler"
          />
          <KpiCard
            label="Bugünkü Ziyaretler"
            value={loading ? null : `${kpi.visitsCompleted}/${kpi.visitsTotal}`}
            subValue={loading ? undefined : `%${visitsCompletedPct} tamamlandı`}
            icon={<MapPin className="h-5 w-5" />}
            iconBg="bg-green-100 dark:bg-green-900/30"
            iconColor="text-green-600 dark:text-green-400"
            loading={loading}
          />
          <KpiCard
            label="Tahsilat"
            value={loading ? null : formatCurrency(kpi.collection)}
            delta={kpi.collectionChange}
            deltaLabel="değişim dünden"
            icon={<Wallet className="h-5 w-5" />}
            iconBg="bg-purple-100 dark:bg-purple-900/30"
            iconColor="text-purple-600 dark:text-purple-400"
            loading={loading}
          />
        </div>

        {/* ── Visits + Orders ───────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

          {/* Today's Visits */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <CalendarCheck className="h-4 w-4 text-primary" />
                  Ziyaret Planı
                </CardTitle>
                <div className="flex items-center gap-2">
                  {!loading && (
                    <span className="text-xs text-muted-foreground">
                      {kpi.visitsCompleted}/{kpi.visitsTotal} tamamlandı
                    </span>
                  )}
                </div>
              </div>
              {/* Progress bar */}
              {!loading && kpi.visitsTotal > 0 && (
                <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-green-500 transition-all"
                    style={{ width: `${visitsCompletedPct}%` }}
                  />
                </div>
              )}
            </CardHeader>
            <CardContent className="p-2">
              {loading ? (
                <SkeletonRows count={5} />
              ) : visits.length === 0 ? (
                <EmptyState
                  icon={<CalendarCheck className="h-10 w-10" />}
                  message="Bugün ziyaret planı yok"
                />
              ) : (
                <ul className="space-y-0.5 max-h-72 overflow-y-auto pr-1">
                  {visits.map((v) => <VisitRow key={v.id} visit={v} />)}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Pending Orders */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-primary" />
                Bekleyen Siparişler
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              {loading ? (
                <SkeletonRows count={5} />
              ) : pendingOrders.length === 0 ? (
                <EmptyState
                  icon={<ShoppingCart className="h-10 w-10" />}
                  message="Bekleyen sipariş yok"
                />
              ) : (
                <ul className="space-y-0.5 max-h-72 overflow-y-auto pr-1">
                  {pendingOrders.map((o) => <OrderRow key={o.id} order={o} />)}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Alerts + Stock + Quick Actions ────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">

          {/* Order Alerts */}
          <Card className="md:col-span-1 xl:col-span-1">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-destructive" />
                Sipariş Uyarıları
                {!loading && alerts.length > 0 && (
                  <Badge
                    variant="destructive"
                    className="ml-auto text-xs px-1.5 py-0.5 h-auto"
                  >
                    {alerts.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {loading ? (
                <SkeletonRows count={3} />
              ) : alerts.length === 0 ? (
                <EmptyState
                  icon={<AlertCircle className="h-10 w-10" />}
                  message="Uyarı yok"
                />
              ) : (
                <div className="space-y-2">
                  {alerts.map((a) => <AlertRow key={a.id} alert={a} />)}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Low Stock */}
          <Card className="md:col-span-1 xl:col-span-1">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Layers className="h-4 w-4 text-amber-500" />
                Düşük Stok / Depo Özeti
                {!loading && lowStock.length > 0 && (
                  <Badge className="ml-auto text-xs px-1.5 py-0.5 h-auto bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0">
                    {lowStock.length} ürün
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0">
              {loading ? (
                <SkeletonRows count={4} />
              ) : lowStock.length === 0 ? (
                <EmptyState
                  icon={<Package className="h-10 w-10" />}
                  message="Düşük stok uyarısı yok"
                />
              ) : (
                <ul className="space-y-0.5 max-h-64 overflow-y-auto pr-1">
                  {lowStock.map((s) => <StockRow key={s.id} item={s} />)}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="md:col-span-2 xl:col-span-1">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ReceiptText className="h-4 w-4 text-primary" />
                Hızlı İşlemler
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-3">
                {QUICK_ACTIONS.map((action) => (
                  <Link
                    key={action.label}
                    to={action.to}
                    className={cn(
                      buttonVariants({ variant: 'outline', size: 'sm' }),
                      'flex h-auto flex-col items-center justify-center gap-1.5 py-3 px-2 text-xs text-center',
                    )}
                  >
                    {action.icon}
                    <span className="leading-tight">{action.label}</span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Activity Feed ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Son Aktiviteler
              </CardTitle>
              <Link
                to="/e-documents"
                className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Tümünü gör <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-2">
            {loading ? (
              <SkeletonRows count={4} />
            ) : activity.length === 0 ? (
              <EmptyState
                icon={<Activity className="h-10 w-10" />}
                message="Henüz aktivite yok"
              />
            ) : (
              <ul className="space-y-0">
                {activity.map((item, idx) => (
                  <ActivityFeedRow
                    key={item.id}
                    item={item}
                    isLast={idx === activity.length - 1}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

      </div>
    </PageLayout>
  )
}
