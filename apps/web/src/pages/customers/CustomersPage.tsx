import { useState, useEffect, useCallback, useRef } from 'react'
import { usePersistedListState } from '@/hooks/usePersistedListState'
import { Search, Plus, X, Trash2, Save, UserPlus, Pencil, RefreshCw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageLayout } from '@/components/layout/PageLayout'
import { TablePaginationFooter, type PageSizeValue } from '@/components/TablePaginationFooter'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toastSuccess, toastError } from '@/lib/toast'
import { API_URL } from '@/lib/api'
import { formatPhone, formatPhoneInput } from '@/lib/utils'
import { PhoneInput } from '@/components/PhoneInput'
import { CustomerTitleInput } from '@/components/CustomerTitleInput'

interface Customer {
  id: number
  title: string
  code?: string | null
  group_id?: number | null
  type_id?: number | null
  legal_type_id?: number | null
  tax_no?: string | null
  tax_office?: string | null
  email?: string | null
  phone?: string | null
  phone_mobile?: string | null
  status?: number
  created_at?: string
}

interface CustomerGroup {
  id: number
  name: string
  color?: string | null
}
interface CustomerType {
  id: number
  name: string
  color?: string | null
  type?: 'şahıs' | 'firma' | string
}
interface CustomerLegalType {
  id: number
  name: string
}

interface CustomerContact {
  id: number
  customer_id: number
  full_name: string
  role?: string | null
  phone?: string | null
  phone_mobile?: string | null
  email?: string | null
  is_primary?: number
  notes?: string | null
  sort_order?: number
  status?: number
  created_at?: string
}

interface CustomerAddress {
  id: number
  customer_id: number
  type: string
  title?: string | null
  contact_name?: string | null
  phone?: string | null
  email?: string | null
  phone_mobile?: string | null
  country_code?: string | null
  city?: string | null
  district?: string | null
  post_code?: string | null
  address_line_1?: string | null
  address_line_2?: string | null
  is_default?: number
  status?: number
  created_at?: string
}

const emptyForm = {
  title: '',
  code: '',
  group_id: '' as number | '',
  type_id: '' as number | '',
  legal_type_id: '' as number | '',
  tax_no: '',
  tax_office: '',
  email: '',
  phone: '',
  phone_mobile: '',
  sort_order: 0,
  status: 1,
}

const customersListDefaults = { search: '', page: 1, pageSize: 'fit' as PageSizeValue, fitLimit: 10 }

export function CustomersPage() {
  const [listState, setListState] = usePersistedListState('customers', customersListDefaults)
  const { search, page, pageSize, fitLimit } = listState
  const [data, setData] = useState<Customer[]>([])
  const [total, setTotal] = useState(0)
  const [groups, setGroups] = useState<CustomerGroup[]>([])
  const [types, setTypes] = useState<CustomerType[]>([])
  const [legalTypes, setLegalTypes] = useState<CustomerLegalType[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [taxNoError, setTaxNoError] = useState<string | null>(null)
  const [contacts, setContacts] = useState<CustomerContact[]>([])
  const [contactDialogOpen, setContactDialogOpen] = useState(false)
  const [editingContactId, setEditingContactId] = useState<number | null>(null)
  const [contactForm, setContactForm] = useState({ full_name: '', role: '', phone: '', phone_mobile: '', email: '', is_primary: false, notes: '' })
  const [contactSaving, setContactSaving] = useState(false)
  const [addresses, setAddresses] = useState<CustomerAddress[]>([])
  const [addressDialogOpen, setAddressDialogOpen] = useState(false)
  const [editingAddressId, setEditingAddressId] = useState<number | null>(null)
  const [addressForm, setAddressForm] = useState({ type: 'Fatura', title: '', contact_name: '', address_line_1: '', address_line_2: '', city: '', district: '', post_code: '', phone: '', email: '', is_default: false })
  const [addressSaving, setAddressSaving] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  const emptyContactForm = { full_name: '', role: '', phone: '', phone_mobile: '', email: '', is_primary: false, notes: '' }
  const emptyAddressForm = { type: 'Fatura' as const, title: '', contact_name: '', address_line_1: '', address_line_2: '', city: '', district: '', post_code: '', phone: '', email: '', is_default: false }
  const ADDRESS_TYPES = ['Fatura', 'Sevkiyat', 'Project', 'Other'] as const
  const hasFilter = search.length > 0
  const limit = pageSize === 'fit' ? fitLimit : pageSize

  const fetchLookups = useCallback(async () => {
    try {
      const [gRes, tRes, lRes] = await Promise.all([
        fetch(`${API_URL}/api/customer-groups?limit=500`),
        fetch(`${API_URL}/api/customer-types?limit=500`),
        fetch(`${API_URL}/api/customer-legal-types?limit=500`),
      ])
      const [gJson, tJson, lJson] = await Promise.all([gRes.json(), tRes.json(), lRes.json()])
      setGroups(gJson.data || [])
      setTypes(tJson.data || [])
      setLegalTypes(lJson.data || [])
    } catch {
      setGroups([])
      setTypes([])
      setLegalTypes([])
    }
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (search) params.set('search', search)
      const res = await fetch(`${API_URL}/api/customers?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Yüklenemedi')
      setData(json.data || [])
      setTotal(json.total ?? 0)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yüklenemedi')
      setData([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, search, limit])

  useEffect(() => {
    fetchLookups()
  }, [fetchLookups])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const fetchContacts = useCallback(async () => {
    if (!editingId) {
      setContacts([])
      return
    }
    try {
      const res = await fetch(`${API_URL}/api/customers/${editingId}/contacts`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Yüklenemedi')
      setContacts(json.data || [])
    } catch {
      setContacts([])
    }
  }, [editingId])

  const fetchAddresses = useCallback(async () => {
    if (!editingId) {
      setAddresses([])
      return
    }
    try {
      const res = await fetch(`${API_URL}/api/customers/${editingId}/addresses`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Yüklenemedi')
      setAddresses(json.data || [])
    } catch {
      setAddresses([])
    }
  }, [editingId])

  useEffect(() => {
    if (modalOpen && editingId) {
      fetchContacts()
      fetchAddresses()
    } else {
      setContacts([])
      setAddresses([])
    }
  }, [modalOpen, editingId, fetchContacts, fetchAddresses])

  const openNew = async () => {
    setEditingId(null)
    setForm(emptyForm)
    try {
      const [sortRes, codeRes] = await Promise.all([
        fetch(`${API_URL}/api/customers/next-sort-order`),
        fetch(`${API_URL}/api/customers/next-code`),
      ])
      const [sortJson, codeJson] = await Promise.all([sortRes.json(), codeRes.json()])
      setForm((f) => ({
        ...f,
        ...(sortJson?.next != null && { sort_order: sortJson.next }),
        ...(codeJson?.code && { code: codeJson.code }),
      }))
    } catch { /* ignore */ }
    setModalOpen(true)
  }

  const openEdit = (item: Customer) => {
    const typeId = item.type_id ?? ''
    const maxLen = isSahisType(typeId) ? 11 : 10
    const taxNo = (item.tax_no || '').replace(/\D/g, '').slice(0, maxLen)
    setEditingId(item.id)
    setForm({
      ...emptyForm,
      title: item.title,
      code: item.code || '',
      group_id: item.group_id ?? '',
      type_id: typeId,
      legal_type_id: item.legal_type_id ?? '',
      tax_no: taxNo,
      tax_office: item.tax_office || '',
      email: item.email || '',
      phone: formatPhoneInput(item.phone || ''),
      phone_mobile: formatPhoneInput(item.phone_mobile || ''),
      status: item.status ?? 1,
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingId(null)
    setForm(emptyForm)
    setTaxNoError(null)
    setContacts([])
    setAddresses([])
    setContactDialogOpen(false)
    setAddressDialogOpen(false)
    setEditingContactId(null)
    setEditingAddressId(null)
    setContactForm(emptyContactForm)
    setAddressForm(emptyAddressForm)
  }

  const openAddContact = () => {
    setEditingContactId(null)
    setContactForm(emptyContactForm)
    setContactDialogOpen(true)
  }

  const openEditContact = (c: CustomerContact) => {
    setEditingContactId(c.id)
    setContactForm({
      full_name: c.full_name || '',
      role: c.role || '',
      phone: formatPhoneInput(c.phone || ''),
      phone_mobile: formatPhoneInput(c.phone_mobile || ''),
      email: c.email || '',
      is_primary: !!c.is_primary,
      notes: c.notes || '',
    })
    setContactDialogOpen(true)
  }

  const closeContactDialog = () => {
    setContactDialogOpen(false)
    setEditingContactId(null)
    setContactForm(emptyContactForm)
  }

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!contactForm.full_name.trim() || !editingId) return
    setContactSaving(true)
    try {
      const payload = {
        full_name: contactForm.full_name.trim(),
        role: contactForm.role.trim() || undefined,
        phone: contactForm.phone.trim() || undefined,
        phone_mobile: contactForm.phone_mobile.trim() || undefined,
        email: contactForm.email.trim() || undefined,
        is_primary: contactForm.is_primary,
        notes: contactForm.notes.trim() || undefined,
      }
      if (editingContactId) {
        const res = await fetch(`${API_URL}/api/customers/${editingId}/contacts/${editingContactId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Güncellenemedi')
        toastSuccess('Kişi güncellendi')
      } else {
        const res = await fetch(`${API_URL}/api/customers/${editingId}/contacts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Eklenemedi')
        toastSuccess('Kişi eklendi')
      }
      closeContactDialog()
      fetchContacts()
    } catch (err) {
      toastError('Hata', err instanceof Error ? err.message : 'İşlem başarısız')
    } finally {
      setContactSaving(false)
    }
  }

  const handleDeleteContact = async (contactId: number) => {
    if (!editingId || !confirm('Bu kişiyi silmek istediğinize emin misiniz?')) return
    try {
      const res = await fetch(`${API_URL}/api/customers/${editingId}/contacts/${contactId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Silinemedi')
      toastSuccess('Kişi silindi')
      fetchContacts()
    } catch (err) {
      toastError('Silme hatası', err instanceof Error ? err.message : 'Silinemedi')
    }
  }

  const openAddAddress = () => {
    setEditingAddressId(null)
    setAddressForm(emptyAddressForm)
    setAddressDialogOpen(true)
  }

  const openEditAddress = (a: CustomerAddress) => {
    setEditingAddressId(a.id)
    setAddressForm({
      type: a.type || 'Fatura',
      title: a.title || '',
      contact_name: a.contact_name || '',
      address_line_1: a.address_line_1 || '',
      address_line_2: a.address_line_2 || '',
      city: a.city || '',
      district: a.district || '',
      post_code: a.post_code || '',
      phone: formatPhoneInput(a.phone || ''),
      email: a.email || '',
      is_default: !!a.is_default,
    })
    setAddressDialogOpen(true)
  }

  const closeAddressDialog = () => {
    setAddressDialogOpen(false)
    setEditingAddressId(null)
    setAddressForm(emptyAddressForm)
  }

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingId) return
    setAddressSaving(true)
    try {
      const payload = {
        type: addressForm.type,
        title: addressForm.title.trim() || undefined,
        contact_name: addressForm.contact_name.trim() || undefined,
        address_line_1: addressForm.address_line_1.trim() || undefined,
        address_line_2: addressForm.address_line_2.trim() || undefined,
        city: addressForm.city.trim() || undefined,
        district: addressForm.district.trim() || undefined,
        post_code: addressForm.post_code.trim() || undefined,
        phone: addressForm.phone.trim() || undefined,
        email: addressForm.email.trim() || undefined,
        is_default: addressForm.is_default,
      }
      if (editingAddressId) {
        const res = await fetch(`${API_URL}/api/customers/${editingId}/addresses/${editingAddressId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Güncellenemedi')
        toastSuccess('Adres güncellendi')
      } else {
        const res = await fetch(`${API_URL}/api/customers/${editingId}/addresses`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Eklenemedi')
        toastSuccess('Adres eklendi')
      }
      closeAddressDialog()
      fetchAddresses()
    } catch (err) {
      toastError('Hata', err instanceof Error ? err.message : 'İşlem başarısız')
    } finally {
      setAddressSaving(false)
    }
  }

  const handleDeleteAddress = async (addressId: number) => {
    if (!editingId || !confirm('Bu adresi silmek istediğinize emin misiniz?')) return
    try {
      const res = await fetch(`${API_URL}/api/customers/${editingId}/addresses/${addressId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Silinemedi')
      toastSuccess('Adres silindi')
      fetchAddresses()
    } catch (err) {
      toastError('Silme hatası', err instanceof Error ? err.message : 'Silinemedi')
    }
  }

  const checkTaxNoDuplicate = useCallback(async () => {
    const raw = form.tax_no.replace(/\D/g, '')
    if (!raw) {
      setTaxNoError(null)
      return
    }
    try {
      const params = new URLSearchParams({ tax_no: raw })
      if (editingId) params.set('exclude_id', String(editingId))
      const res = await fetch(`${API_URL}/api/customers/check-tax-no?${params}`)
      const json = await res.json()
      if (json.exists && json.customer) {
        setTaxNoError(`Bu numara zaten kayıtlı: ${json.customer.title}`)
      } else {
        setTaxNoError(null)
      }
    } catch {
      setTaxNoError(null)
    }
  }, [form.tax_no, editingId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    if (taxNoError) return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        title: form.title.trim(),
        code: form.code.trim() || undefined,
        group_id: form.group_id === '' ? null : form.group_id,
        type_id: form.type_id === '' ? null : form.type_id,
        legal_type_id: form.legal_type_id === '' ? null : form.legal_type_id,
        tax_no: form.tax_no.trim() || undefined,
        tax_office: form.tax_office.trim() || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        phone_mobile: form.phone_mobile.trim() || undefined,
        sort_order: form.sort_order,
        status: form.status,
      }
      const url = editingId ? `${API_URL}/api/customers/${editingId}` : `${API_URL}/api/customers`
      const method = editingId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Kaydedilemedi')
      closeModal()
      fetchData()
      toastSuccess(editingId ? 'Müşteri güncellendi' : 'Müşteri eklendi', 'Değişiklikler başarıyla kaydedildi.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Kaydedilemedi'
      setError(msg)
      toastError('Kaydetme hatası', msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number, onSuccess?: () => void) {
    if (!confirm('Bu müşteriyi silmek istediğinize emin misiniz?')) return
    try {
      const res = await fetch(`${API_URL}/api/customers/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Silinemedi')
      fetchData()
      toastSuccess('Müşteri silindi', 'Müşteri başarıyla silindi.')
      onSuccess?.()
    } catch (err) {
      toastError('Silme hatası', err instanceof Error ? err.message : 'Silinemedi')
    }
  }

  const getGroupName = (id: number | null | undefined) => groups.find((g) => g.id === id)?.name ?? '—'
  const getTypeName = (id: number | null | undefined) => types.find((t) => t.id === id)?.name ?? '—'
  const getGroupColor = (id: number | null | undefined) => groups.find((g) => g.id === id)?.color
  const getTypeColor = (id: number | null | undefined) => types.find((t) => t.id === id)?.color
  const isSahisType = (typeId: number | '' | null | undefined) => {
    if (typeId === '' || typeId == null) return false
    const t = types.find((x) => x.id === typeId)
    if (!t) return false
    const typeVal = String(t.type || '').toLowerCase()
    if (typeVal === 'şahıs' || typeVal === 'sahis') return true
    const name = String(t.name || '').toLowerCase()
    return name.includes('şahıs') || name.includes('sahis') || name.includes('birey')
  }

  return (
    <PageLayout
      title="Müşteriler"
      description="Müşteri listesini yönetin"
      backTo="/parametreler"
      contentRef={contentRef}
      showRefresh
      onRefresh={() => {
        setListState({ search: '', page: 1 })
        fetchData()
      }}
      headerActions={
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Ara (ad, kod, vergi no, e-posta)..."
              value={search}
              onChange={(e) => setListState({ search: e.target.value })}
              className="pl-8 w-64 h-9"
            />
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={openNew}>
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Yeni müşteri</TooltipContent>
          </Tooltip>
          {hasFilter && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => setListState({ search: '', page: 1 })}>
                  <X className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Filtreleri sıfırla</TooltipContent>
            </Tooltip>
          )}
        </div>
      }
      footerContent={
        <TablePaginationFooter
          total={total}
          page={page}
          pageSize={pageSize}
          fitLimit={fitLimit}
          onPageChange={(p) => setListState({ page: p })}
          onPageSizeChange={(s) => setListState({ pageSize: s, page: 1 })}
          onFitLimitChange={(v) => setListState({ fitLimit: v })}
          tableContainerRef={contentRef}
          hasFilter={hasFilter}
        />
      }
    >
      <Card>
        <CardContent className="p-0">
          {/* Tablo: md ve üzeri genişlikte */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Müşteri Adı</th>
                  <th className="text-left p-3 font-medium">Kod</th>
                  <th className="text-left p-3 font-medium">Grup</th>
                  <th className="text-left p-3 font-medium">Tip</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Yükleniyor...</td></tr>
                ) : data.length === 0 ? (
                  <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">{error || 'Henüz müşteri kaydı yok.'}</td></tr>
                ) : (
                  data.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b hover:bg-muted/30 cursor-pointer"
                      onClick={() => openEdit(item)}
                    >
                      <td className="p-3 font-medium">{item.title}</td>
                      <td className="p-3">{item.code || '—'}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="shrink-0 w-3.5 h-3.5 rounded-full border border-muted-foreground/30"
                            style={{ backgroundColor: getGroupColor(item.group_id) || 'transparent' }}
                            title={getGroupName(item.group_id)}
                          />
                          <span>{getGroupName(item.group_id)}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="shrink-0 w-3.5 h-3.5 rounded-sm border border-muted-foreground/30"
                            style={{ backgroundColor: getTypeColor(item.type_id) || 'transparent' }}
                            title={getTypeName(item.type_id)}
                          />
                          <span>{getTypeName(item.type_id)}</span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Kart listesi: dar ekranlarda (md altı) */}
          <div className="md:hidden divide-y">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Yükleniyor...</div>
            ) : data.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">{error || 'Henüz müşteri kaydı yok.'}</div>
            ) : (
              data.map((item) => (
                <div
                  key={item.id}
                  className="p-4 hover:bg-muted/30 cursor-pointer active:bg-muted/50 transition-colors"
                  onClick={() => openEdit(item)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{item.title}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                        {item.code && <span>Kod: {item.code}</span>}
                        <span className="flex items-center gap-1">
                          <span
                            className="shrink-0 w-2.5 h-2.5 rounded-full border border-muted-foreground/30"
                            style={{ backgroundColor: getGroupColor(item.group_id) || 'transparent' }}
                          />
                          {getGroupName(item.group_id)}
                        </span>
                        <span className="flex items-center gap-1">
                          <span
                            className="shrink-0 w-2.5 h-2.5 rounded-sm border border-muted-foreground/30"
                            style={{ backgroundColor: getTypeColor(item.type_id) || 'transparent' }}
                          />
                          {getTypeName(item.type_id)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editingId ? 'Müşteri Düzenle' : 'Yeni Müşteri'}</DialogTitle>
            <DialogDescription>Müşteri bilgilerini girin.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 flex flex-col min-h-0">
            {error && <p className="text-sm text-destructive shrink-0">{error}</p>}
            <Tabs defaultValue="genel" className="w-full flex flex-col min-h-0 flex-1 overflow-hidden">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="genel">Genel</TabsTrigger>
                <TabsTrigger value="adresler">Adresler</TabsTrigger>
                <TabsTrigger value="kisiler">Kişiler</TabsTrigger>
              </TabsList>
              <div className="min-h-[380px] flex-1 overflow-y-auto mt-4">
              <TabsContent value="genel" className="mt-0">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="title">Müşteri Adı / Ünvan *</Label>
                    <CustomerTitleInput
                      id="title"
                      value={form.title}
                      onChange={(v) => setForm((f) => ({ ...f, title: v }))}
                      placeholder="Firma adı veya şahıs adı"
                      required
                      excludeCustomerId={editingId}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="code">Kod</Label>
                    <div className="flex gap-2">
                      <Input id="code" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="Müşteri kodu" className="flex-1" />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          try {
                            const res = await fetch(`${API_URL}/api/customers/next-code`)
                            const json = await res.json()
                            if (json?.code) setForm((f) => ({ ...f, code: json.code }))
                          } catch { /* ignore */ }
                        }}
                      >
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Türet
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="group_id">Grup</Label>
                    <select
                      id="group_id"
                      value={form.group_id}
                      onChange={(e) => setForm((f) => ({ ...f, group_id: e.target.value === '' ? '' : Number(e.target.value) }))}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                    >
                      <option value="">—</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="type_id">Müşteri Tipi</Label>
                    <select
                      id="type_id"
                      value={form.type_id}
                      onChange={(e) => {
                        const val = e.target.value === '' ? '' : Number(e.target.value)
                        const maxLen = val === '' ? 10 : (isSahisType(val) ? 11 : 10)
                        setForm((f) => {
                          const digits = (f.tax_no || '').replace(/\D/g, '').slice(0, maxLen)
                          return { ...f, type_id: val, tax_no: digits }
                        })
                        setTaxNoError(null)
                      }}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                    >
                      <option value="">—</option>
                      {types.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tax_no">
                      {isSahisType(form.type_id) ? 'TC Kimlik No' : 'Vergi No (VKN)'}
                    </Label>
                    <Input
                      id="tax_no"
                      value={form.tax_no}
                      onChange={(e) => {
                        const maxLen = isSahisType(form.type_id) ? 11 : 10
                        const digits = e.target.value.replace(/\D/g, '').slice(0, maxLen)
                        setForm((f) => ({ ...f, tax_no: digits }))
                        setTaxNoError(null)
                      }}
                      onBlur={checkTaxNoDuplicate}
                      placeholder={isSahisType(form.type_id) ? '11 haneli TC kimlik no' : '10 haneli vergi no'}
                      className={taxNoError ? 'border-destructive' : ''}
                      inputMode="numeric"
                      maxLength={isSahisType(form.type_id) ? 11 : 10}
                    />
                    {taxNoError && <p className="text-sm text-destructive">{taxNoError}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="legal_type_id">Yasal Tip</Label>
                    <select
                      id="legal_type_id"
                      value={form.legal_type_id}
                      onChange={(e) => setForm((f) => ({ ...f, legal_type_id: e.target.value === '' ? '' : Number(e.target.value) }))}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                    >
                      <option value="">—</option>
                      {legalTypes.map((l) => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tax_office">Vergi Dairesi</Label>
                    <Input id="tax_office" value={form.tax_office} onChange={(e) => setForm((f) => ({ ...f, tax_office: e.target.value }))} placeholder="Vergi dairesi adı" />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="email">E-posta</Label>
                    <Input id="email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="ornek@firma.com" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefon</Label>
                    <PhoneInput id="phone" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} placeholder="212 123 45 67" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone_mobile">Cep Telefonu</Label>
                    <PhoneInput id="phone_mobile" value={form.phone_mobile} onChange={(v) => setForm((f) => ({ ...f, phone_mobile: v }))} placeholder="532 207 12 53" />
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="adresler" className="mt-0">
                {editingId ? (
                  <>
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-sm text-muted-foreground">Müşteriye ait adresler</span>
                      <Button type="button" variant="outline" size="sm" onClick={openAddAddress}>
                        <Plus className="h-4 w-4 mr-1" />
                        Ekle
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {addresses.length === 0 ? (
                        <p className="col-span-2 text-sm text-muted-foreground py-4">Henüz adres eklenmemiş.</p>
                      ) : (
                        addresses.map((a) => (
                          <Card key={a.id} className="overflow-hidden">
                            <CardContent className="p-3">
                              <div className="flex justify-between items-start gap-2">
                                <div>
                                  <div className="font-medium flex items-center gap-2">
                                    <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{a.type}</span>
                                    {a.is_default && <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">Varsayılan</span>}
                                  </div>
                                  {a.title && <p className="text-sm font-medium mt-1">{a.title}</p>}
                                  {a.address_line_1 && <p className="text-sm">{a.address_line_1}</p>}
                                  {a.address_line_2 && <p className="text-sm text-muted-foreground">{a.address_line_2}</p>}
                                  {(a.city || a.district) && (
                                    <p className="text-sm text-muted-foreground">
                                      {[a.district, a.city].filter(Boolean).join(' / ')}
                                      {a.post_code && ` ${a.post_code}`}
                                    </p>
                                  )}
                                  {a.phone && <p className="text-sm">{formatPhone(a.phone)}</p>}
                                  {a.email && <p className="text-sm truncate">{a.email}</p>}
                                </div>
                                <div className="flex gap-1 shrink-0">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditAddress(a)}>
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Düzenle</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDeleteAddress(a.id)}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Sil</TooltipContent>
                                  </Tooltip>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground py-4">Adres eklemek için önce müşteriyi kaydedin.</p>
                )}
              </TabsContent>
              <TabsContent value="kisiler" className="mt-0">
                {editingId ? (
                  <>
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-sm text-muted-foreground">Müşteriye ait iletişim kişileri</span>
                      <Button type="button" variant="outline" size="sm" onClick={openAddContact}>
                        <UserPlus className="h-4 w-4 mr-1" />
                        Ekle
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {contacts.length === 0 ? (
                        <p className="col-span-2 text-sm text-muted-foreground py-4">Henüz kişi eklenmemiş.</p>
                      ) : (
                        contacts.map((c) => (
                          <Card key={c.id} className="overflow-hidden">
                            <CardContent className="p-3">
                              <div className="flex justify-between items-start gap-2">
                                <div>
                                  <div className="font-medium flex items-center gap-2">
                                    {c.full_name}
                                    {c.is_primary && <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">Ana</span>}
                                  </div>
                                  {c.role && <p className="text-sm text-muted-foreground">{c.role}</p>}
                                  {c.phone && <p className="text-sm">{formatPhone(c.phone)}</p>}
                                  {c.phone_mobile && <p className="text-sm">{formatPhone(c.phone_mobile)}</p>}
                                  {c.email && <p className="text-sm truncate">{c.email}</p>}
                                </div>
                                <div className="flex gap-1 shrink-0">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditContact(c)}>
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Düzenle</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDeleteContact(c.id)}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Sil</TooltipContent>
                                  </Tooltip>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground py-4">Kişi eklemek için önce müşteriyi kaydedin.</p>
                )}
              </TabsContent>
              </div>
            </Tabs>
            <DialogFooter className="flex-row justify-between gap-4 sm:justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Switch
                  id="modal-status"
                  checked={!!form.status}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, status: v ? 1 : 0 }))}
                />
                <Label htmlFor="modal-status" className="text-sm cursor-pointer">Aktif</Label>
              </div>
              <div className="flex items-center gap-1">
                {editingId && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-block">
                        <Button type="button" variant="outline" size="icon" onClick={() => handleDelete(editingId, closeModal)} disabled={saving} className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Sil</TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="submit" variant="outline" size="icon" disabled={saving || !form.title.trim()}>
                      <Save className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Kaydet</TooltipContent>
                </Tooltip>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={contactDialogOpen} onOpenChange={(open) => !open && closeContactDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingContactId ? 'Kişi Düzenle' : 'Yeni Kişi'}</DialogTitle>
            <DialogDescription>İletişim kişisi bilgilerini girin.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveContact} className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="contact_full_name">Ad Soyad *</Label>
                <Input id="contact_full_name" value={contactForm.full_name} onChange={(e) => setContactForm((f) => ({ ...f, full_name: e.target.value }))} placeholder="Ad Soyad" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact_role">Rol / Ünvan</Label>
                <Input id="contact_role" value={contactForm.role} onChange={(e) => setContactForm((f) => ({ ...f, role: e.target.value }))} placeholder="Satın alma, muhasebe vb." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact_phone">Telefon</Label>
                <PhoneInput id="contact_phone" value={contactForm.phone} onChange={(v) => setContactForm((f) => ({ ...f, phone: v }))} placeholder="212 123 45 67" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact_phone_mobile">Cep Telefonu</Label>
                <PhoneInput id="contact_phone_mobile" value={contactForm.phone_mobile} onChange={(v) => setContactForm((f) => ({ ...f, phone_mobile: v }))} placeholder="532 207 12 53" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact_email">E-posta</Label>
                <Input id="contact_email" type="email" value={contactForm.email} onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))} placeholder="ornek@firma.com" />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="contact_is_primary"
                  checked={contactForm.is_primary}
                  onCheckedChange={(v) => setContactForm((f) => ({ ...f, is_primary: v }))}
                />
                <Label htmlFor="contact_is_primary" className="text-sm cursor-pointer">Ana iletişim kişisi</Label>
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact_notes">Notlar</Label>
                <Input id="contact_notes" value={contactForm.notes} onChange={(e) => setContactForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Ek notlar" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeContactDialog}>İptal</Button>
              <Button type="submit" disabled={contactSaving || !contactForm.full_name.trim()}>
                {contactSaving ? 'Kaydediliyor...' : (editingContactId ? 'Güncelle' : 'Ekle')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={addressDialogOpen} onOpenChange={(open) => !open && closeAddressDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingAddressId ? 'Adres Düzenle' : 'Yeni Adres'}</DialogTitle>
            <DialogDescription>Adres bilgilerini girin.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveAddress} className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="address_type">Tip</Label>
                <select
                  id="address_type"
                  value={addressForm.type}
                  onChange={(e) => setAddressForm((f) => ({ ...f, type: e.target.value }))}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  {ADDRESS_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="address_title">Başlık</Label>
                <Input id="address_title" value={addressForm.title} onChange={(e) => setAddressForm((f) => ({ ...f, title: e.target.value }))} placeholder="Adres başlığı" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address_contact_name">İletişim Kişisi</Label>
                <Input id="address_contact_name" value={addressForm.contact_name} onChange={(e) => setAddressForm((f) => ({ ...f, contact_name: e.target.value }))} placeholder="Adreste bulunacak kişi" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address_line_1">Adres Satırı 1</Label>
                <Input id="address_line_1" value={addressForm.address_line_1} onChange={(e) => setAddressForm((f) => ({ ...f, address_line_1: e.target.value }))} placeholder="Sokak, mahalle, bina no" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address_line_2">Adres Satırı 2</Label>
                <Input id="address_line_2" value={addressForm.address_line_2} onChange={(e) => setAddressForm((f) => ({ ...f, address_line_2: e.target.value }))} placeholder="Ek adres bilgisi (opsiyonel)" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="address_city">İl</Label>
                  <Input id="address_city" value={addressForm.city} onChange={(e) => setAddressForm((f) => ({ ...f, city: e.target.value }))} placeholder="İl" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address_district">İlçe</Label>
                  <Input id="address_district" value={addressForm.district} onChange={(e) => setAddressForm((f) => ({ ...f, district: e.target.value }))} placeholder="İlçe" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="address_post_code">Posta Kodu</Label>
                <Input id="address_post_code" value={addressForm.post_code} onChange={(e) => setAddressForm((f) => ({ ...f, post_code: e.target.value }))} placeholder="Posta kodu" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address_phone">Telefon</Label>
                <PhoneInput id="address_phone" value={addressForm.phone} onChange={(v) => setAddressForm((f) => ({ ...f, phone: v }))} placeholder="212 123 45 67" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address_email">E-posta</Label>
                <Input id="address_email" type="email" value={addressForm.email} onChange={(e) => setAddressForm((f) => ({ ...f, email: e.target.value }))} placeholder="ornek@firma.com" />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="address_is_default"
                  checked={addressForm.is_default}
                  onCheckedChange={(v) => setAddressForm((f) => ({ ...f, is_default: v }))}
                />
                <Label htmlFor="address_is_default" className="text-sm cursor-pointer">Varsayılan adres</Label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeAddressDialog}>İptal</Button>
              <Button type="submit" disabled={addressSaving}>
                {addressSaving ? 'Kaydediliyor...' : (editingAddressId ? 'Güncelle' : 'Ekle')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageLayout>
  )
}
