import { Users, UserCog } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageLayout } from '@/components/layout/PageLayout'

export function SettingsAccessPage() {
  return (
    <PageLayout
      title="Erişim"
      description="Kullanıcılar ve roller yönetimi"
      backTo="/ayarlar"
    >
      <Tabs defaultValue="users" className="w-full">
        <TabsList>
          <TabsTrigger value="users">Kullanıcılar</TabsTrigger>
          <TabsTrigger value="roles">Roller</TabsTrigger>
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
