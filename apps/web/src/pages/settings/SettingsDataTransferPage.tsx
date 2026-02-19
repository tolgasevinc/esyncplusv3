import { useState, useEffect, useCallback } from 'react'
import {
  Database,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  Save,
  Plus,
  ArrowRight,
  Loader2,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PageLayout } from '@/components/layout/PageLayout'
import { toastSuccess, toastError, toastWarning } from '@/lib/toast'

import { API_URL } from '@/lib/api'
const MYSQL_CATEGORY = 'mysql'

// Bu sütunlar eşleştirme listesinde gösterilmez ve aktarılmaz (D1 tarafında otomatik)
const EXCLUDED_COLUMNS = ['id', 'created_at', 'updated_at']

interface MysqlConfig {
  host: string
  port: number
  database: string
  user: string
  password: string
}

interface TransferCard {
  id: string
  step: 1 | 2 | 3
  sourceTable: string
  targetTable: string
  mysqlColumns: { name: string; type: string }[]
  d1Columns: { name: string; type: string }[]
  columnMapping: Record<string, string>
  /** Sütun eşleştirmede işaretli (aktarılacak) olan kaynak sütunlar */
  enabledMappingKeys: Set<string>
  rows: Record<string, unknown>[]
  selectedIndices: Set<number>
  loading: boolean
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

function genId() {
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function filterExcludedMapping(
  mapping: Record<string, string>,
  enabledKeys?: Set<string>
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [src, tgt] of Object.entries(mapping)) {
    if (EXCLUDED_COLUMNS.includes(src.toLowerCase()) || EXCLUDED_COLUMNS.includes((tgt || '').toLowerCase())) continue
    if (enabledKeys && !enabledKeys.has(src)) continue
    if (tgt) out[src] = tgt
  }
  return out
}

export function SettingsDataTransferPage() {
  const [activeTab, setActiveTab] = useState('aktarimlar')
  const [open, setOpen] = useState(false)
  const [connected, setConnected] = useState(false)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testError, setTestError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [mysqlTables, setMysqlTables] = useState<string[]>([])
  const [d1Tables, setD1Tables] = useState<string[]>([])
  const [mysqlTablesError, setMysqlTablesError] = useState<string | null>(null)
  const [d1TablesError, setD1TablesError] = useState<string | null>(null)
  const [tablesLoading, setTablesLoading] = useState(false)
  const [config, setConfig] = useState<MysqlConfig>(emptyConfig)
  const [cards, setCards] = useState<TransferCard[]>([])
  const [transferModal, setTransferModal] = useState<{ card: TransferCard } | null>(null)
  const [transferring, setTransferring] = useState(false)

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

  const loadMysqlTables = useCallback(async () => {
    setMysqlTablesError(null)
    try {
      const res = await fetch(`${API_URL}/api/mysql/tables`)
      const json = await res.json()
      if (res.ok && json.tables) {
        setMysqlTables(json.tables)
      } else {
        setMysqlTables([])
        setMysqlTablesError(json?.error || 'MySQL tabloları alınamadı')
      }
    } catch (err) {
      setMysqlTables([])
      setMysqlTablesError(err instanceof Error ? err.message : 'Bağlantı hatası')
    }
  }, [])

  const loadD1Tables = useCallback(async () => {
    setD1TablesError(null)
    try {
      const res = await fetch(`${API_URL}/api/d1/tables`)
      const json = await res.json()
      if (res.ok && json.tables) {
        setD1Tables(json.tables)
      } else {
        setD1Tables([])
        setD1TablesError(json?.error || 'D1 tabloları alınamadı')
      }
    } catch (err) {
      setD1Tables([])
      setD1TablesError(err instanceof Error ? err.message : 'Bağlantı hatası')
    }
  }, [])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  const loadAllTables = useCallback(async () => {
    setTablesLoading(true)
    await Promise.all([loadMysqlTables(), loadD1Tables()])
    setTablesLoading(false)
  }, [loadMysqlTables, loadD1Tables])

  useEffect(() => {
    if (activeTab === 'aktarimlar') {
      loadAllTables()
    }
  }, [activeTab, loadAllTables])

  async function handleTestConnection() {
    setTesting(true)
    setTestError(null)
    setMysqlTables([])
    try {
      const hasCredentials = config.host && config.database && config.user
      if (!hasCredentials) {
        setConnected(false)
        const msg = 'Host, veritabanı ve kullanıcı adı gerekli'
        setTestError(msg)
        toastWarning('Eksik bilgi', msg)
        return
      }

      const res = await fetch(`${API_URL}/api/mysql/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: config.host,
          port: config.port,
          database: config.database,
          user: config.user,
          password: config.password,
        }),
      })

      const json = await res.json()

      if (!res.ok) {
        setConnected(false)
        const msg = json.error || 'Bağlantı başarısız'
        setTestError(msg)
        toastError('Bağlantı hatası', msg)
        return
      }

      const list = Array.isArray(json.tables) ? json.tables : []
      setConnected(true)
      setMysqlTables(list)
      toastSuccess(
        'Bağlantı başarılı',
        list.length > 0 ? `${list.length} MySQL tablosu bulundu.` : 'MySQL veritabanına başarıyla bağlanıldı.',
      )
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

  function addCard() {
    setCards((prev) => [
      ...prev,
      {
        id: genId(),
        step: 1,
        sourceTable: '',
        targetTable: '',
        mysqlColumns: [],
        d1Columns: [],
        columnMapping: {},
        enabledMappingKeys: new Set(),
        rows: [],
        selectedIndices: new Set(),
        loading: false,
      },
    ])
  }

  function removeCard(id: string) {
    setCards((prev) => prev.filter((c) => c.id !== id))
  }

  function updateCard(id: string, updates: Partial<TransferCard>) {
    setCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    )
  }

  async function loadSourceColumns(cardId: string, table: string) {
    if (!table) return
    updateCard(cardId, { loading: true })
    try {
      const res = await fetch(`${API_URL}/api/mysql/columns/${encodeURIComponent(table)}`)
      const json = await res.json()
      if (res.ok && json.columns) {
        updateCard(cardId, { mysqlColumns: json.columns })
      } else {
        updateCard(cardId, { mysqlColumns: [] })
      }
    } catch {
      updateCard(cardId, { mysqlColumns: [] })
    } finally {
      updateCard(cardId, { loading: false })
    }
  }

  async function loadTargetColumns(cardId: string, table: string) {
    if (!table) return
    updateCard(cardId, { loading: true })
    try {
      const res = await fetch(`${API_URL}/api/d1/columns/${encodeURIComponent(table)}`)
      const json = await res.json()
      if (res.ok && json.columns) {
        updateCard(cardId, { d1Columns: json.columns })
      } else {
        updateCard(cardId, { d1Columns: [] })
      }
    } catch {
      updateCard(cardId, { d1Columns: [] })
    } finally {
      updateCard(cardId, { loading: false })
    }
  }

  async function loadTableData(cardId: string, table: string) {
    if (!table) return
    updateCard(cardId, { loading: true })
    try {
      const res = await fetch(`${API_URL}/api/mysql/table-data/${encodeURIComponent(table)}?limit=100`)
      const json = await res.json()
      if (res.ok && json.rows) {
        const rows = json.rows as Record<string, unknown>[]
        const selected = new Set(rows.map((_, i) => i))
        updateCard(cardId, { rows, selectedIndices: selected })
      } else {
        updateCard(cardId, { rows: [], selectedIndices: new Set() })
      }
    } catch {
      updateCard(cardId, { rows: [], selectedIndices: new Set() })
    } finally {
      updateCard(cardId, { loading: false })
    }
  }

  function handleSourceTableChange(cardId: string, table: string) {
    updateCard(cardId, { sourceTable: table, step: 1 })
    if (table) loadSourceColumns(cardId, table)
  }

  function handleTargetTableChange(cardId: string, table: string) {
    updateCard(cardId, { targetTable: table })
    if (table) loadTargetColumns(cardId, table)
  }

  function goToStep2(card: TransferCard) {
    if (!card.sourceTable || !card.targetTable) return
    const mapping: Record<string, string> = {}
    const sourceCols = card.mysqlColumns.filter((c) => !EXCLUDED_COLUMNS.includes(c.name.toLowerCase()))
    const targetCols = card.d1Columns.filter((c) => !EXCLUDED_COLUMNS.includes(c.name.toLowerCase()))
    const enabledKeys = new Set<string>()
    for (const mc of sourceCols) {
      const match = targetCols.find((dc) => dc.name.toLowerCase() === mc.name.toLowerCase())
      mapping[mc.name] = match ? match.name : ''
      if (match) enabledKeys.add(mc.name)
    }
    updateCard(card.id, { step: 2, columnMapping: mapping, enabledMappingKeys: enabledKeys })
  }

  function goToStep3(card: TransferCard) {
    if (!card.sourceTable) return
    loadTableData(card.id, card.sourceTable)
    updateCard(card.id, { step: 3 })
  }

  function toggleRowSelection(cardId: string, index: number) {
    setCards((prev) =>
      prev.map((c) => {
        if (c.id !== cardId) return c
        const next = new Set(c.selectedIndices)
        if (next.has(index)) next.delete(index)
        else next.add(index)
        return { ...c, selectedIndices: next }
      })
    )
  }

  function toggleAllRows(cardId: string, checked: boolean) {
    setCards((prev) =>
      prev.map((c) => {
        if (c.id !== cardId) return c
        const next = checked ? new Set(c.rows.map((_, i) => i)) : new Set<number>()
        return { ...c, selectedIndices: next }
      })
    )
  }

  function toggleMappingKey(cardId: string, key: string) {
    setCards((prev) =>
      prev.map((c) => {
        if (c.id !== cardId) return c
        const next = new Set(c.enabledMappingKeys)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return { ...c, enabledMappingKeys: next }
      })
    )
  }

  function toggleAllMappings(cardId: string, checked: boolean) {
    setCards((prev) =>
      prev.map((c) => {
        if (c.id !== cardId) return c
        const mappableKeys = Object.keys(c.columnMapping).filter(
          (k) => c.columnMapping[k] && !EXCLUDED_COLUMNS.includes(k.toLowerCase())
        )
        const next = checked ? new Set(mappableKeys) : new Set<string>()
        return { ...c, enabledMappingKeys: next }
      })
    )
  }

  async function executeTransfer() {
    if (!transferModal) return
    const { card } = transferModal
    setTransferring(true)
    try {
      const res = await fetch(`${API_URL}/api/transfer/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceTable: card.sourceTable,
          targetTable: card.targetTable,
          columnMapping: filterExcludedMapping(card.columnMapping, card.enabledMappingKeys),
          selectedIndices: Array.from(card.selectedIndices),
        }),
      })
      const text = await res.text()
      let json: { error?: string; inserted?: number; updated?: number } = {}
      try {
        json = text ? JSON.parse(text) : {}
      } catch {
        throw new Error(res.ok ? 'Yanıt işlenemedi' : text || `HTTP ${res.status}`)
      }
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      const msg = json.updated
        ? `${json.inserted} yeni eklendi, ${json.updated} mevcut güncellendi.`
        : `${json.inserted} kayıt D1'e aktarıldı.`
      toastSuccess('Aktarım tamamlandı', msg)
      setTransferModal(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Bilinmeyen hata'
      toastError('Aktarım hatası', msg)
    } finally {
      setTransferring(false)
    }
  }

  const settingsContent = (
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
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )

  return (
    <PageLayout
      title="Veri Aktarımı"
      description="MySQL'den D1'e veri aktarımı"
      backTo="/ayarlar"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="aktarimlar">Aktarımlar</TabsTrigger>
          <TabsTrigger value="ayarlar">Ayarlar</TabsTrigger>
        </TabsList>

        <TabsContent value="aktarimlar" className="mt-4 space-y-4">
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                Kaynak MySQL tablosundan hedef D1 tablosuna veri aktarımı yapın.
                {mysqlTables.length === 0 && d1Tables.length > 0 && (
                  <span className="block mt-1 text-amber-600">
                    MySQL tabloları görünmüyorsa Ayarlar sekmesinden bağlantıyı test edin ve kaydedin.
                  </span>
                )}
              </p>
              <Button onClick={addCard}>
                <Plus className="h-4 w-4 mr-2" />
                Yeni Aktarım
              </Button>
            </div>
            <div className="flex items-center gap-2 text-sm flex-wrap">
              <span className="text-muted-foreground">API:</span>
              <code className="bg-muted px-2 py-0.5 rounded text-xs">{API_URL}</code>
              {API_URL.includes('localhost') && (
                <span className="text-amber-600 font-medium">
                  ⚠️ Yerel API → veriler Cloudflare D1'e değil, yerel D1'e yazılır. Canlı D1 için .env'de VITE_API_URL=deploy-URL kullanın veya canlı siteden aktarın.
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={loadAllTables}
                disabled={tablesLoading}
              >
                {tablesLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {tablesLoading ? 'Yükleniyor...' : 'Tablo listesini yenile'}
              </Button>
            </div>
            {(mysqlTablesError || d1TablesError) && (
              <div className="space-y-1 text-sm text-destructive">
                {mysqlTablesError && <p>MySQL: {mysqlTablesError}</p>}
                {d1TablesError && <p>D1: {d1TablesError}</p>}
              </div>
            )}
          </div>

          {cards.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Database className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">Henüz aktarım yok</p>
                <Button variant="outline" onClick={addCard}>
                  <Plus className="h-4 w-4 mr-2" />
                  İlk Aktarımı Ekle
                </Button>
              </CardContent>
            </Card>
          )}

          {cards.map((card) => (
            <TransferCardComponent
              key={card.id}
              card={card}
              mysqlTables={mysqlTables}
              d1Tables={d1Tables}
              onUpdate={(updates) => updateCard(card.id, updates)}
              onRemove={() => removeCard(card.id)}
              onSourceTableChange={(t) => handleSourceTableChange(card.id, t)}
              onTargetTableChange={(t) => handleTargetTableChange(card.id, t)}
              onGoToStep2={() => goToStep2(card)}
              onGoToStep3={() => goToStep3(card)}
              onToggleRow={(i) => toggleRowSelection(card.id, i)}
              onToggleAll={(checked) => toggleAllRows(card.id, checked)}
              onToggleMappingKey={(k) => toggleMappingKey(card.id, k)}
              onToggleAllMappings={(checked) => toggleAllMappings(card.id, checked)}
              onTransfer={() => setTransferModal({ card })}
            />
          ))}
        </TabsContent>

        <TabsContent value="ayarlar" className="mt-4">
          {settingsContent}
        </TabsContent>
      </Tabs>

      <Dialog open={!!transferModal} onOpenChange={() => setTransferModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Aktarımı Onayla</DialogTitle>
            <DialogDescription>
              {transferModal && (
                <>
                  <strong>{transferModal.card.sourceTable}</strong> (MySQL) →{' '}
                  <strong>{transferModal.card.targetTable}</strong> (D1)
                  <br />
                  <br />
                  {transferModal.card.selectedIndices.size} kayıt aktarılacak.
                  <br />
                  Sütun eşleştirmesi: {Object.entries(filterExcludedMapping(transferModal.card.columnMapping, transferModal.card.enabledMappingKeys)).length} alan
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferModal(null)}>
              İptal
            </Button>
            <Button onClick={executeTransfer} disabled={transferring}>
              {transferring ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Aktarılıyor...
                </>
              ) : (
                'Aktar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  )
}

function TransferCardComponent({
  card,
  mysqlTables,
  d1Tables,
  onUpdate,
  onRemove,
  onSourceTableChange,
  onTargetTableChange,
  onGoToStep2,
  onGoToStep3,
  onToggleRow,
  onToggleAll,
  onToggleMappingKey,
  onToggleAllMappings,
  onTransfer,
}: {
  card: TransferCard
  mysqlTables: string[]
  d1Tables: string[]
  onUpdate: (u: Partial<TransferCard>) => void
  onRemove: () => void
  onSourceTableChange: (t: string) => void
  onTargetTableChange: (t: string) => void
  onGoToStep2: () => void
  onGoToStep3: () => void
  onToggleRow: (i: number) => void
  onToggleAll: (checked: boolean) => void
  onToggleMappingKey: (k: string) => void
  onToggleAllMappings: (checked: boolean) => void
  onTransfer: () => void
}) {
  const mappableSource = card.mysqlColumns.filter((c) => !EXCLUDED_COLUMNS.includes(c.name.toLowerCase()))
  const mappableTarget = card.d1Columns.filter((c) => !EXCLUDED_COLUMNS.includes(c.name.toLowerCase()))
  const canStep2 = card.sourceTable && card.targetTable && mappableSource.length > 0 && mappableTarget.length > 0
  const enabledMappingCount = Object.keys(card.columnMapping).filter(
    (k) => card.columnMapping[k] && card.enabledMappingKeys.has(k)
  ).length
  const canStep3 = enabledMappingCount > 0
  const selectedCount = card.selectedIndices.size

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs font-normal">
              {card.step === 1 && '1. Tablo seçimi'}
              {card.step === 2 && '2. Sütun eşleştirme'}
              {card.step === 3 && '3. Kayıt seçimi'}
            </span>
            {card.sourceTable && card.targetTable && (
              <span className="text-muted-foreground font-normal">
                {card.sourceTable} → {card.targetTable}
              </span>
            )}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onRemove} className="text-destructive hover:text-destructive">
            Kaldır
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {card.step === 1 && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Kaynak (MySQL)</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={card.sourceTable}
                  onChange={(e) => onSourceTableChange(e.target.value)}
                >
                  <option value="">Tablo seçin</option>
                  {mysqlTables.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Hedef (D1)</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={card.targetTable}
                  onChange={(e) => onTargetTableChange(e.target.value)}
                >
                  <option value="">Tablo seçin</option>
                  {d1Tables.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
            <Button onClick={onGoToStep2} disabled={!canStep2 || card.loading}>
              {card.loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4 mr-2" />
              )}
              Devam: Sütun eşleştirme
            </Button>
          </div>
        )}

        {card.step === 2 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Sütun eşleştirmesi</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onToggleAllMappings(enabledMappingCount < Object.keys(card.columnMapping).filter((k) => card.columnMapping[k]).length)}
                >
                  {enabledMappingCount === Object.keys(card.columnMapping).filter((k) => card.columnMapping[k]).length
                    ? 'Tümünü kaldır'
                    : 'Tümünü seç'}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Kaynak sütunu hedef sütuna eşleyin. İşaretli satırlar aktarılır ({enabledMappingCount} seçili)
              </p>
              <div className="border rounded-md divide-y max-h-80 overflow-y-auto">
                {card.mysqlColumns
                  .filter((mc) => !EXCLUDED_COLUMNS.includes(mc.name.toLowerCase()))
                  .map((mc) => {
                    const hasTarget = !!card.columnMapping[mc.name]
                    const isEnabled = card.enabledMappingKeys.has(mc.name)
                    return (
                      <div key={mc.name} className="flex items-center gap-2 p-2">
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={() => onToggleMappingKey(mc.name)}
                          disabled={!hasTarget}
                          className="h-4 w-4 shrink-0"
                        />
                        <span className="flex-1 text-sm font-medium">{mc.name}</span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        <select
                          className="flex h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                          value={card.columnMapping[mc.name] || ''}
                          onChange={(e) => {
                            const val = e.target.value
                            onUpdate({
                              columnMapping: {
                                ...card.columnMapping,
                                [mc.name]: val,
                              },
                              enabledMappingKeys: val
                                ? new Set([...card.enabledMappingKeys, mc.name])
                                : (() => {
                                    const next = new Set(card.enabledMappingKeys)
                                    next.delete(mc.name)
                                    return next
                                  })(),
                            })
                          }}
                        >
                          <option value="">—</option>
                          {card.d1Columns
                            .filter((dc) => !EXCLUDED_COLUMNS.includes(dc.name.toLowerCase()))
                            .map((dc) => (
                              <option key={dc.name} value={dc.name}>{dc.name}</option>
                            ))}
                        </select>
                      </div>
                    )
                  })}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onUpdate({ step: 1 })}>
                Geri
              </Button>
              <Button onClick={onGoToStep3} disabled={!canStep3}>
                Devam: Kayıt listesi
              </Button>
            </div>
          </div>
        )}

        {card.step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Kayıtlar ({card.rows.length} kayıt, {selectedCount} seçili)</Label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onToggleAll(selectedCount < card.rows.length)}
                >
                  {selectedCount === card.rows.length ? 'Tümünü kaldır' : 'Tümünü seç'}
                </Button>
              </div>
            </div>
            <div className="border rounded-md overflow-auto max-h-64">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 text-left w-10">
                      <input
                        type="checkbox"
                        checked={selectedCount === card.rows.length && card.rows.length > 0}
                        onChange={(e) => onToggleAll(e.target.checked)}
                      />
                    </th>
                    {card.rows[0] && Object.keys(card.rows[0]).map((k) => (
                      <th key={k} className="p-2 text-left font-medium">{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {card.rows.map((row, i) => (
                    <tr key={i} className="border-b hover:bg-muted/30">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={card.selectedIndices.has(i)}
                          onChange={() => onToggleRow(i)}
                        />
                      </td>
                      {card.rows[0] && Object.keys(card.rows[0]).map((k) => (
                        <td key={k} className="p-2 text-muted-foreground">
                          {String(row[k] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onUpdate({ step: 2 })}>
                Geri
              </Button>
              <Button onClick={onTransfer} disabled={selectedCount === 0 || card.loading}>
                {card.loading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Aktar ({selectedCount} kayıt)
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
