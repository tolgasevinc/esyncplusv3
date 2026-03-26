import { Link } from 'react-router-dom'
import {
  Package,
  Users,
  FileText,
  Receipt,
  Tag,
  Truck,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Wifi,
  WifiOff,
  Clock,
  Plus,
  Settings,
  SlidersHorizontal,
  ShoppingCart,
  Building2,
  Store,
  Banknote,
  LayoutDashboard,
  Download,
  FolderTree,
} from 'lucide-react'
import { PageLayout } from '@/components/layout/PageLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { useHomePageData, type HomeStats } from '@/hooks/useHomePageData'
import { cn } from '@/lib/utils'
import { type ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAmount(amount: number | undefined): string {
  if (amount == null) return '—'
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatDate(date: string | undefined): string {
  if (!date || date === '—') return '—'
  try {
    // Handle DD.MM.YYYY format
    if (date.includes('.')) {
      const [d, m, y] = date.split('.')
      return new Date(`${y}-${m}-${d}`).toLocaleDateString('tr-TR')
    }
    return new Date(date).toLocaleDateString('tr-TR')
  } catch {
    return date
  }
}

function formatTime(d: Date | null): string {
  if (!d) return '—'
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------

interface StatCardProps {
  label: string
  value: number
  icon: ReactNode
  to: string
  iconBgClass: string
  iconColorClass: string
  loading?: boolean
}

function StatCard({
  label,
  value,
  icon,
  to,
  iconBgClass,
  iconColorClass,
  loading,
}: StatCardProps) {
  return (
    <Link to={to} className="group block">
      <Card className="h-full transition-shadow hover:shadow-md">
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <div
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-lg',
                iconBgClass,
              )}
            >
              <span className={cn('h-5 w-5', iconColorClass)}>{icon}</span>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
          <div>
            {loading ? (
              <div className="h-8 w-16 animate-pulse rounded bg-muted" />
            ) : (
              <p className="text-2xl font-bold text-foreground">
                {value.toLocaleString('tr-TR')}
              </p>
            )}
            <p className="mt-0.5 text-sm text-muted-foreground">{label}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// IntegrationCard
// ---------------------------------------------------------------------------

interface IntegrationCardProps {
  name: string
  description: string
  icon: ReactNode
  to: string
  configured?: boolean
}

function IntegrationCard({
  name,
  description,
  icon,
  to,
  configured,
}: IntegrationCardProps) {
  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground">
              {icon}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{name}</p>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
          </div>
          {configured !== undefined && (
            configured ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
            )
          )}
        </div>
        <Link
          to={to}
          className={cn(
            buttonVariants({ variant: 'outline', size: 'sm' }),
            'mt-auto w-full text-xs',
          )}
        >
          Ayarları Görüntüle
        </Link>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Stat card config
// ---------------------------------------------------------------------------

interface StatConfig {
  key: keyof HomeStats
  label: string
  icon: ReactNode
  to: string
  iconBgClass: string
  iconColorClass: string
}

const STAT_CARDS: StatConfig[] = [
  {
    key: 'products',
    label: 'Ürünler',
    icon: <Package className="h-5 w-5" />,
    to: '/products',
    iconBgClass: 'bg-blue-100 dark:bg-blue-900/30',
    iconColorClass: 'text-blue-600 dark:text-blue-400',
  },
  {
    key: 'customers',
    label: 'Müşteriler',
    icon: <Users className="h-5 w-5" />,
    to: '/customers',
    iconBgClass: 'bg-green-100 dark:bg-green-900/30',
    iconColorClass: 'text-green-600 dark:text-green-400',
  },
  {
    key: 'offers',
    label: 'Teklifler',
    icon: <FileText className="h-5 w-5" />,
    to: '/teklifler',
    iconBgClass: 'bg-purple-100 dark:bg-purple-900/30',
    iconColorClass: 'text-purple-600 dark:text-purple-400',
  },
  {
    key: 'eDocuments',
    label: 'E-Belgeler',
    icon: <Receipt className="h-5 w-5" />,
    to: '/e-documents',
    iconBgClass: 'bg-orange-100 dark:bg-orange-900/30',
    iconColorClass: 'text-orange-600 dark:text-orange-400',
  },
  {
    key: 'brands',
    label: 'Markalar',
    icon: <Tag className="h-5 w-5" />,
    to: '/parametreler/markalar',
    iconBgClass: 'bg-pink-100 dark:bg-pink-900/30',
    iconColorClass: 'text-pink-600 dark:text-pink-400',
  },
  {
    key: 'suppliers',
    label: 'Tedarikçiler',
    icon: <Truck className="h-5 w-5" />,
    to: '/parametreler/tedarikciler',
    iconBgClass: 'bg-amber-100 dark:bg-amber-900/30',
    iconColorClass: 'text-amber-600 dark:text-amber-400',
  },
]

// ---------------------------------------------------------------------------
// Quick actions
// ---------------------------------------------------------------------------

interface QuickActionItem {
  label: string
  icon: ReactNode
  to: string
  variant?: 'default' | 'outline'
}

const QUICK_ACTIONS: QuickActionItem[] = [
  { label: 'Ürünler', icon: <Package className="h-4 w-4" />, to: '/products' },
  { label: 'Müşteriler', icon: <Users className="h-4 w-4" />, to: '/customers' },
  { label: 'Teklifler', icon: <FileText className="h-4 w-4" />, to: '/teklifler' },
  { label: 'E-Belgeler', icon: <Receipt className="h-4 w-4" />, to: '/e-documents' },
  { label: 'Veri Aktarım', icon: <Download className="h-4 w-4" />, to: '/veri-aktarim' },
  { label: 'Parametreler', icon: <SlidersHorizontal className="h-4 w-4" />, to: '/parametreler' },
  { label: 'Ayarlar', icon: <Settings className="h-4 w-4" />, to: '/ayarlar' },
]

// ---------------------------------------------------------------------------
// HomePage
// ---------------------------------------------------------------------------

export function HomePage() {
  const { stats, apiOnline, recentEdocs, lastRefresh, loading, refresh } =
    useHomePageData()

  return (
    <PageLayout
      title="Genel Bakış"
      description="e-syncplus yönetim paneli"
      logo={<LayoutDashboard className="h-5 w-5 text-primary" />}
      showRefresh
      onRefresh={refresh}
    >
      <div className="flex flex-col gap-6">

        {/* ── Status Bar ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-4 rounded-lg bg-muted/50 px-4 py-2.5 text-sm">
          <div className="flex items-center gap-1.5">
            {apiOnline ? (
              <Wifi className="h-4 w-4 text-green-500" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-500" />
            )}
            <span className={apiOnline ? 'text-green-600 dark:text-green-400' : 'text-red-500'}>
              API {apiOnline ? 'Çevrimiçi' : 'Çevrimdışı'}
            </span>
          </div>
          <span className="h-4 w-px bg-border" />
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span>Cloudflare D1</span>
          </div>
          <span className="h-4 w-px bg-border" />
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>Son güncelleme: {formatTime(lastRefresh)}</span>
          </div>
          {loading && (
            <>
              <span className="h-4 w-px bg-border" />
              <span className="text-muted-foreground">Yükleniyor...</span>
            </>
          )}
        </div>

        {/* ── Stats Grid ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {STAT_CARDS.map((cfg) => (
            <StatCard
              key={cfg.key}
              label={cfg.label}
              value={stats[cfg.key]}
              icon={cfg.icon}
              to={cfg.to}
              iconBgClass={cfg.iconBgClass}
              iconColorClass={cfg.iconColorClass}
              loading={loading}
            />
          ))}
        </div>

        {/* ── Integrations ───────────────────────────────────────────── */}
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Entegrasyonlar
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <IntegrationCard
              name="Paraşüt"
              description="Muhasebe & Fatura"
              icon={<Banknote className="h-5 w-5" />}
              to="/parasut"
            />
            <IntegrationCard
              name="Dia"
              description="ERP Entegrasyonu"
              icon={<Building2 className="h-5 w-5" />}
              to="/dia"
            />
            <IntegrationCard
              name="OpenCart"
              description="E-Ticaret Platformu"
              icon={<ShoppingCart className="h-5 w-5" />}
              to="/opencart"
            />
            <IntegrationCard
              name="Ideasoft"
              description="Mağaza & kategori eşleştirme"
              icon={<FolderTree className="h-5 w-5" />}
              to="/ideasoft"
            />
            <IntegrationCard
              name="Shopify"
              description="E-Ticaret Platformu"
              icon={<Store className="h-5 w-5" />}
              to="/ayarlar/entegrasyonlar"
            />
          </div>
        </div>

        {/* ── Bottom: Recent E-Docs + Quick Actions ──────────────────── */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">

          {/* Recent E-Documents */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold">Son E-Belgeler</CardTitle>
              <Link
                to="/e-documents"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Tümünü gör <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="space-y-2 px-4 pb-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-10 animate-pulse rounded bg-muted" />
                  ))}
                </div>
              ) : recentEdocs.length === 0 ? (
                <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                  Kayıt yok
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {recentEdocs.map((doc) => (
                    <li
                      key={doc.id}
                      className="flex items-center justify-between gap-3 px-4 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {doc.sender ?? doc.receiver ?? doc.description ?? '—'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(doc.date)}
                          {doc.invoice_no ? ` · ${doc.invoice_no}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-medium text-foreground">
                        {doc.amount != null ? formatAmount(doc.amount) : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Hızlı Erişim</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {QUICK_ACTIONS.map((action) => (
                  <Link
                    key={action.to}
                    to={action.to}
                    className={cn(
                      buttonVariants({ variant: 'outline', size: 'sm' }),
                      'flex items-center justify-start gap-2 text-xs',
                    )}
                  >
                    {action.icon}
                    {action.label}
                  </Link>
                ))}
              </div>

              <div className="mt-4 border-t pt-4">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Yeni Ekle</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {[
                    { label: 'Ürün', to: '/products', icon: <Package className="h-3.5 w-3.5" /> },
                    { label: 'Müşteri', to: '/customers', icon: <Users className="h-3.5 w-3.5" /> },
                    { label: 'Teklif', to: '/teklifler', icon: <FileText className="h-3.5 w-3.5" /> },
                  ].map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={cn(
                        buttonVariants({ variant: 'default', size: 'sm' }),
                        'flex items-center justify-start gap-1.5 text-xs',
                      )}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {item.icon}
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </PageLayout>
  )
}
