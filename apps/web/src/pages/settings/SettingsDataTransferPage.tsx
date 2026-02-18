import { useState, useEffect, useCallback } from 'react'
import { Database, ChevronDown, ChevronUp, CheckCircle, XCircle, Save } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { PageLayout } from '@/components/layout/PageLayout'
import { toastSuccess, toastError, toastWarning } from '@/lib/toast'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787'
const MYSQL_CATEGORY = 'mysql'

interface MysqlConfig {
  host: string
  port: number
  database: string
  user: string
  password: string
}

const emptyConfig: MysqlConfig = { host: '', port: 3306, database: '', user: '', password: '' }

function settingsToConfig(s: Record<string, string>): MysqlConfig {
  return {
    host: s.host || '',
    port: parseInt(s.port || '3306') || 3306,
    database: s.database || '',
    user: s.user || '',
    password: s.password || '',
  }
}

function configToSettings(c: MysqlConfig): Record<string, string> {
  return {
    host: c.host,
    port: String(c.port),
    database: c.database,
    user: c.user,
    password: c.password,
  }
}

export function SettingsDataTransferPage() {
  const [open, setOpen] = useState(false)
  const [connected, setConnected] = useState(false)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testError, setTestError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [tables, setTables] = useState<string[]>([])
  const [config, setConfig] = useState<MysqlConfig>(emptyConfig)

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/app-settings?category=${encodeURIComponent(MYSQL_CATEGORY)}`)
      const json = await res.json()
      if (res.ok && typeof json === 'object') {
        setConfig(settingsToConfig(json))
      }
    } catch {
      setConfig(emptyConfig)
    }
  }, [])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  async function handleTestConnection() {
    setTesting(true)
    setTestError(null)
    setTables([])
    try {
      // TODO: API endpoint ile gerçek MySQL bağlantı testi
      await new Promise((r) => setTimeout(r, 800))
      const hasCredentials = config.host && config.database && config.user
      if (hasCredentials) {
        setConnected(true)
        // TODO: API'den tablo listesi al
        setTables(['product_brands', 'product_units', 'product_categories', 'product_groups', 'storage_folders'])
        toastSuccess('Bağlantı başarılı', 'MySQL veritabanına başarıyla bağlanıldı.')
      } else {
        setConnected(false)
        const msg = 'Host, veritabanı ve kullanıcı adı gerekli'
        setTestError(msg)
        toastWarning('Eksik bilgi', msg)
      }
    } catch (err) {
      setConnected(false)
      const msg = err instanceof Error ? err.message : 'Bağlantı başarısız'
      setTestError(msg)
      toastError('Bağlantı hatası', msg)
    } finally {
      setTesting(false)
    }
  }

  function handleConfigChange(updates: Partial<MysqlConfig>) {
    setConfig((prev) => ({ ...prev, ...updates }))
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`${API_URL}/api/app-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: MYSQL_CATEGORY,
          settings: configToSettings(config),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Kaydedilemedi')
      toastSuccess('Bilgiler kaydedildi', 'MySQL bağlantı bilgileri başarıyla kaydedildi.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Kaydedilemedi'
      setSaveError(msg)
      toastError('Kaydetme hatası', msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageLayout
      title="Veri Aktarımı"
      description="MySQL veritabanı bağlantısı ve veri aktarımı"
      backTo="/ayarlar"
    >
      <Card>
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 rounded-t-lg transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  <CardTitle>MySQL Veritabanı Bağlantısı</CardTitle>
                  {!open && connected && (
                    <span className="flex items-center gap-1.5 text-sm font-normal text-green-600">
                      <CheckCircle className="h-4 w-4" />
                      Bağlı
                    </span>
                  )}
                  {!open && !connected && config.host && (
                    <span className="flex items-center gap-1.5 text-sm font-normal text-muted-foreground">
                      <XCircle className="h-4 w-4" />
                      Bağlı değil
                    </span>
                  )}
                </div>
                {open ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
              </div>
              <CardDescription>
                Veri aktarımı için MySQL veritabanına bağlanmak üzere bilgileri girin
              </CardDescription>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4 pt-0">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="mysql_host">Host</Label>
                  <Input
                    id="mysql_host"
                    value={config.host}
                    onChange={(e) => handleConfigChange({ host: e.target.value })}
                    placeholder="localhost"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mysql_port">Port</Label>
                  <Input
                    id="mysql_port"
                    type="number"
                    value={config.port}
                    onChange={(e) => handleConfigChange({ port: parseInt(e.target.value) || 3306 })}
                    placeholder="3306"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mysql_database">Veritabanı Adı</Label>
                <Input
                  id="mysql_database"
                  value={config.database}
                  onChange={(e) => handleConfigChange({ database: e.target.value })}
                  placeholder="veritabani_adi"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="mysql_user">Kullanıcı Adı</Label>
                  <Input
                    id="mysql_user"
                    value={config.user}
                    onChange={(e) => handleConfigChange({ user: e.target.value })}
                    placeholder="kullanici"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mysql_password">Şifre</Label>
                  <Input
                    id="mysql_password"
                    type="password"
                    value={config.password}
                    onChange={(e) => handleConfigChange({ password: e.target.value })}
                    placeholder="••••••••"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleTestConnection} disabled={testing}>
                  {testing ? 'Test ediliyor...' : 'Bağlantıyı Test Et'}
                </Button>
                <Button variant="outline" onClick={handleSave} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Kaydediliyor...' : 'Kaydet'}
                </Button>
              </div>
              {testError && <p className="text-sm text-destructive">{testError}</p>}
              {saveError && <p className="text-sm text-destructive">{saveError}</p>}
              {connected && tables.length > 0 && (
                <div className="space-y-2 pt-4 border-t">
                  <Label>Tablo Listesi</Label>
                  <div className="flex flex-wrap gap-2">
                    {tables.map((table) => (
                      <Button
                        key={table}
                        variant="outline"
                        size="sm"
                        onClick={() => {}}
                      >
                        {table}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </PageLayout>
  )
}
