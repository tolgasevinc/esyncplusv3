import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Users, UserCog } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageLayout } from '@/components/layout/PageLayout'

const ACCESS_TABS = ['users', 'roles'] as const
type AccessTab = (typeof ACCESS_TABS)[number]

function parseAccessTab(raw: string | null): AccessTab {
  if (raw === 'roles' || raw === 'users') return raw
  return 'users'
}

export function SettingsAccessPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabFromUrl = useMemo(() => parseAccessTab(searchParams.get('tab')), [searchParams])
  const [activeTab, setActiveTab] = useState<AccessTab>(tabFromUrl)

  useEffect(() => {
    setActiveTab(tabFromUrl)
  }, [tabFromUrl])

  const handleTabChange = (v: string) => {
    const next = parseAccessTab(v)
    setActiveTab(next)
    setSearchParams({ tab: next }, { replace: true })
  }

  return (
    <PageLayout
      title="Erişim"
      description="Kullanıcılar ve roller yönetimi"
      backTo="/ayarlar"
    >
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList>
          <TabsTrigger value="users">Kullanıcı Yönetimi</TabsTrigger>
          <TabsTrigger value="roles">Yetkiler</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Kullanıcılar
              </CardTitle>
              <CardDescription>
                Sistem kullanıcılarını yönetin
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Kullanıcı listesi burada gösterilecektir.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCog className="h-5 w-5" />
                Roller
              </CardTitle>
              <CardDescription>
                Yetki rolleri ve izinleri yönetin
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Rol listesi burada gösterilecektir.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageLayout>
  )
}
