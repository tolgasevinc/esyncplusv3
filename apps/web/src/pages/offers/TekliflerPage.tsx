import { useState, useEffect, useCallback, useRef } from 'react'
import { usePersistedListState } from '@/hooks/usePersistedListState'
import { Search, Plus, X, Trash2, ChevronLeft, ChevronRight, Receipt } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PageLayout } from '@/components/layout/PageLayout'
import { TablePaginationFooter, type PageSizeValue } from '@/components/TablePaginationFooter'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toastSuccess, toastError } from '@/lib/toast'
import { API_URL, parseJsonResponse } from '@/lib/api'
import { formatDate, formatPrice, normalizeForSearch, parseDecimal } from '@/lib/utils'
import { PhoneInput } from '@/components/PhoneInput'
import { CustomerTitleInput } from '@/components/CustomerTitleInput'

interface Offer {
  id: number
  date: string
  order_no?: string | null
  customer_id?: number | null
  contact_id?: number | null
  description?: string | null
  notes?: string | null
  discount_1?: number
  discount_2?: number
  discount_3?: number
  discount_4?: number
  status?: number
  created_at?: string
  customer_title?: string | null
  customer_code?: string | null
}

interface OfferItem {
  type?: 'product' | 'expense'
  product_id?: number | null
  product_name?: string | null
  product_sku?: string | null
  unit_name?: string | null
  description?: string | null
  amount: number
  unit_price: number
  line_discount: number
  discount_1?: number
  discount_2?: number
  discount_3?: number
  discount_4?: number
  discount_5?: number
  tax_rate: number
}

interface Customer {
  id: number
  title: string
  code?: string | null
}

interface CustomerGroup {
  id: number
  name: string
}
interface CustomerType {
  id: number
  name: string
}
interface CustomerLegalType {
  id: number
  name: string
}

interface CustomerContact {
  id: number
  full_name: string
  role?: string | null
  phone?: string | null
  phone_mobile?: string | null
  email?: string | null
}

interface Product {
  id: number
  name: string
  sku?: string | null
  price: number
  unit_name?: string | null
}

const emptyItem = (): OfferItem => ({
  type: 'product',
  product_id: null,
  product_name: null,
  product_sku: null,
  unit_name: null,
  description: null,
  amount: 1,
  unit_price: 0,
  line_discount: 0,
  discount_1: 0,
  discount_2: 0,
  discount_3: 0,
  discount_4: 0,
  discount_5: 0,
  tax_rate: 0,
})

const emptyForm = {
  date: new Date().toISOString().slice(0, 10),
  order_no: '',
  customer_id: '' as number | '',
  contact_id: '' as number | '',
  description: '',
  notes: '',
  discount_1: 0,
  discount_2: 0,
  discount_3: 0,
  discount_4: 0,
  items: [] as OfferItem[],
}

const offersListDefaults = { search: '', page: 1, pageSize: 'fit' as PageSizeValue, fitLimit: 10 }

function getItemRowTotal(it: OfferItem): number {
  const d1 = it.discount_1 ?? 0, d2 = it.discount_2 ?? 0, d3 = it.discount_3 ?? 0, d4 = it.discount_4 ?? 0, d5 = it.discount_5 ?? 0
  const totalDiscount = it.line_discount || (d1 + d2 + d3 + d4 + d5)
  return it.amount * it.unit_price - totalDiscount
}

/** Kelime kelime kontrol: her kelime title veya code içinde geçiyor mu? */
function filterCustomersByWords(customers: Customer[], inputWords: string[]): Customer[] {
  if (inputWords.length === 0) return []
  return customers.filter((c) => {
    const titleNorm = normalizeForSearch(c.title)
    const codeNorm = c.code ? normalizeForSearch(c.code) : ''
    return inputWords.every((w) => titleNorm.includes(w) || codeNorm.includes(w))
  })
}

export function TekliflerPage() {
  const [listState, setListState] = usePersistedListState('offers', offersListDefaults)
  const { search, page, pageSize, fitLimit } = listState
  const [data, setData] = useState<Offer[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalStep, setModalStep] = useState(1)
  const [discountModalRow, setDiscountModalRow] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [customerInput, setCustomerInput] = useState('')
  const [customerSearchResults, setCustomerSearchResults] = useState<Customer[]>([])
  const [similarCustomersModalOpen, setSimilarCustomersModalOpen] = useState(false)
  const [similarCustomersList, setSimilarCustomersList] = useState<Customer[]>([])
  const [newCustomerModalOpen, setNewCustomerModalOpen] = useState(false)
  const [newCustomerForm, setNewCustomerForm] = useState({ title: '', email: '', phone: '', group_id: '' as number | '', type_id: '' as number | '', legal_type_id: '' as number | '' })
  const [customerGroups, setCustomerGroups] = useState<CustomerGroup[]>([])
  const [customerTypes, setCustomerTypes] = useState<CustomerType[]>([])
  const [customerLegalTypes, setCustomerLegalTypes] = useState<CustomerLegalType[]>([])
  const [newCustomerSaving, setNewCustomerSaving] = useState(false)
  const [newCustomerModalFromNextStep, setNewCustomerModalFromNextStep] = useState(false)
  const [contacts, setContacts] = useState<CustomerContact[]>([])
  const [contactInput, setContactInput] = useState('')
  const [contactSearchResults, setContactSearchResults] = useState<CustomerContact[]>([])
  const [newContactModalOpen, setNewContactModalOpen] = useState(false)
  const [newContactForm, setNewContactForm] = useState({ full_name: '', phone: '', role: '' })
  const [newContactSaving, setNewContactSaving] = useState(false)
  const [newContactModalFromNextStep, setNewContactModalFromNextStep] = useState(false)
  const [activeContactSearch, setActiveContactSearch] = useState(false)
  const [activeProductSearchRow, setActiveProductSearchRow] = useState<number | null>(null)
  const [productSearchQuery, setProductSearchQuery] = useState('')
  const [productResults, setProductResults] = useState<Product[]>([])
  const contentRef = useRef<HTMLDivElement>(null)
  const hasFilter = search.length > 0
  const limit = pageSize === 'fit' ? fitLimit : pageSize

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (search) params.set('search', search)
      const res = await fetch(`${API_URL}/api/offers?${params}`)
      const json = await parseJsonResponse<{ data?: Offer[]; total?: number; error?: string }>(res)
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
    fetchData()
  }, [fetchData])

  const fetchCustomerSearch = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) {
      setCustomerSearchResults([])
      return
    }
    try {
      const search = trimmed.slice(0, 150)
      const res = await fetch(`${API_URL}/api/customers?search=${encodeURIComponent(search)}&limit=10`)
      const json = await parseJsonResponse<{ data?: Customer[] }>(res)
      setCustomerSearchResults(json.data || [])
    } catch {
      setCustomerSearchResults([])
    }
  }, [])

  const filterContactSearch = useCallback((q: string) => {
    if (!q.trim()) {
      setContactSearchResults([])
      return
    }
    const n = normalizeForSearch(q)
    const filtered = contacts.filter((c) => normalizeForSearch(c.full_name).includes(n) || (c.role && normalizeForSearch(c.role).includes(n)))
    setContactSearchResults(filtered)
  }, [contacts])

  const checkNewContactOnBlur = useCallback(() => {
    const input = contactInput.trim()
    if (!input || !form.customer_id) return
    const match = contacts.find((c) => {
      const full = `${c.full_name}${c.role ? ` (${c.role})` : ''}`
      return normalizeForSearch(full) === normalizeForSearch(input) || normalizeForSearch(c.full_name) === normalizeForSearch(input)
    })
    if (match && form.contact_id === '') {
      setForm((f) => ({ ...f, contact_id: match.id }))
      setContactInput(`${match.full_name}${match.role ? ` (${match.role})` : ''}`)
    } else     if (!match && form.contact_id === '') {
      setNewContactForm({ full_name: input, phone: '', role: '' })
      setNewContactModalFromNextStep(false)
      setNewContactModalOpen(true)
    }
  }, [contactInput, form.customer_id, form.contact_id, contacts])

  const createNewContact = useCallback(async () => {
    setNewContactSaving(true)
    try {
      const res = await fetch(`${API_URL}/api/customers/${form.customer_id}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: newContactForm.full_name.trim(),
          role: newContactForm.role.trim() || undefined,
          phone: newContactForm.phone.trim() || undefined,
          phone_mobile: newContactForm.phone.trim() || undefined,
        }),
      })
      const json = await parseJsonResponse<{ id?: number; full_name?: string; error?: string }>(res)
      if (!res.ok) throw new Error(json.error || 'İletişim kişisi oluşturulamadı')
      const newId = json.id
      if (newId) {
        setForm((f) => ({ ...f, contact_id: newId }))
        setContactInput(json.full_name || newContactForm.full_name.trim())
        setContacts((prev) => [...prev, { id: newId, full_name: json.full_name || newContactForm.full_name.trim(), role: null }])
        setNewContactModalOpen(false)
        setNewContactForm({ full_name: '', phone: '', role: '' })
        toastSuccess('İletişim kişisi eklendi')
        if (newContactModalFromNextStep) setModalStep(2)
        setNewContactModalFromNextStep(false)
      }
    } catch (err) {
      toastError('Hata', err instanceof Error ? err.message : 'Oluşturulamadı')
    } finally {
      setNewContactSaving(false)
    }
  }, [form.customer_id, newContactForm, newContactModalFromNextStep])

  const checkSimilarCustomersOnBlur = useCallback(async () => {
    const input = customerInput.trim()
    if (!input) return
    if (form.customer_id) return
    const words = input.split(/\s+/).map((w) => w.trim()).filter(Boolean).map((w) => normalizeForSearch(w))
    if (words.length === 0) return
    try {
      const seen = new Set<number>()
      const candidates: Customer[] = []
      for (const word of words.slice(0, 5)) {
        if (!word) continue
        const res = await fetch(`${API_URL}/api/customers?search=${encodeURIComponent(word)}&limit=30`)
        const json = await parseJsonResponse<{ data?: Customer[] }>(res)
        for (const c of json.data || []) {
          if (!seen.has(c.id)) {
            seen.add(c.id)
            candidates.push(c)
          }
        }
      }
      const similar = filterCustomersByWords(candidates, words)
      if (similar.length > 0) {
        const alreadySelected = similar.some((c) => c.id === form.customer_id)
        if (!alreadySelected) {
          setSimilarCustomersList(similar)
          setSimilarCustomersModalOpen(true)
        }
      } else {
        setNewCustomerForm({ title: input, email: '', phone: '', group_id: '', type_id: '', legal_type_id: '' })
        setNewCustomerModalFromNextStep(false)
        setNewCustomerModalOpen(true)
      }
    } catch {
      setNewCustomerForm({ title: input, email: '', phone: '', group_id: '', type_id: '', legal_type_id: '' })
      setNewCustomerModalFromNextStep(false)
      setNewCustomerModalOpen(true)
    }
  }, [customerInput, form.customer_id])

  const createNewCustomer = useCallback(async () => {
    setNewCustomerSaving(true)
    try {
      const res = await fetch(`${API_URL}/api/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newCustomerForm.title.trim(),
          email: newCustomerForm.email.trim() || undefined,
          phone: newCustomerForm.phone.trim() || undefined,
          phone_mobile: newCustomerForm.phone.trim() || undefined,
          group_id: newCustomerForm.group_id === '' ? null : newCustomerForm.group_id,
          type_id: newCustomerForm.type_id === '' ? null : newCustomerForm.type_id,
          legal_type_id: newCustomerForm.legal_type_id === '' ? null : newCustomerForm.legal_type_id,
        }),
      })
      const json = await parseJsonResponse<{ id?: number; title?: string; code?: string; error?: string }>(res)
      if (!res.ok) throw new Error(json.error || 'Müşteri oluşturulamadı')
      const newId = json.id
      if (newId) {
        setForm((f) => ({ ...f, customer_id: newId, contact_id: '' }))
        setCustomerInput(json.title || newCustomerForm.title.trim())
        setNewCustomerModalOpen(false)
        setNewCustomerForm({ title: '', email: '', phone: '', group_id: '', type_id: '', legal_type_id: '' })
        setSimilarCustomersModalOpen(false)
        setSimilarCustomersList([])
        fetchContacts(newId)
        toastSuccess('Müşteri eklendi')
        if (newCustomerModalFromNextStep) setModalStep(2)
        setNewCustomerModalFromNextStep(false)
      }
    } catch (err) {
      toastError('Hata', err instanceof Error ? err.message : 'Müşteri oluşturulamadı')
    } finally {
      setNewCustomerSaving(false)
    }
  }, [newCustomerForm, newCustomerModalFromNextStep])

  const fetchCustomerLookups = useCallback(async () => {
    try {
      const [gRes, tRes, lRes] = await Promise.all([
        fetch(`${API_URL}/api/customer-groups?limit=500`),
        fetch(`${API_URL}/api/customer-types?limit=500`),
        fetch(`${API_URL}/api/customer-legal-types?limit=500`),
      ])
      const [gJson, tJson, lJson] = await Promise.all([
        parseJsonResponse<{ data?: CustomerGroup[] }>(gRes),
        parseJsonResponse<{ data?: CustomerType[] }>(tRes),
        parseJsonResponse<{ data?: CustomerLegalType[] }>(lRes),
      ])
      setCustomerGroups(gJson.data || [])
      setCustomerTypes(tJson.data || [])
      setCustomerLegalTypes(lJson.data || [])
    } catch {
      setCustomerGroups([])
      setCustomerTypes([])
      setCustomerLegalTypes([])
    }
  }, [])

  useEffect(() => {
    if (newCustomerModalOpen) fetchCustomerLookups()
  }, [newCustomerModalOpen, fetchCustomerLookups])

  const fetchContacts = useCallback(async (customerId: number) => {
    try {
      const res = await fetch(`${API_URL}/api/customers/${customerId}/contacts`)
      const json = await parseJsonResponse<{ data?: CustomerContact[] }>(res)
      setContacts(json.data || [])
    } catch {
      setContacts([])
    }
  }, [])

  const fetchProductSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setProductResults([])
      return
    }
    try {
      const res = await fetch(`${API_URL}/api/products?search=${encodeURIComponent(q)}&limit=10`)
      const json = await parseJsonResponse<{ data?: Product[] }>(res)
      const list = (json.data || []).map((p: Product) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        price: p.price,
        unit_name: p.unit_name,
      }))
      setProductResults(list)
    } catch {
      setProductResults([])
    }
  }, [])

  const openNew = async () => {
    setEditingId(null)
    setForm(emptyForm)
    setForm((f) => ({ ...f, date: new Date().toISOString().slice(0, 10) }))
    setContacts([])
    setCustomerInput('')
    setCustomerSearchResults([])
    setContactInput('')
    setModalStep(1)
    setDiscountModalRow(null)
    try {
      const res = await fetch(`${API_URL}/api/offers/next-order-no`)
      const json = await parseJsonResponse<{ order_no?: string }>(res)
      if (json.order_no) setForm((f) => ({ ...f, order_no: json.order_no as string }))
    } catch { /* ignore */ }
    setModalOpen(true)
  }

  const openEdit = async (item: Offer) => {
    setEditingId(item.id)
    setContacts([])
    setModalStep(1)
    setDiscountModalRow(null)
    try {
      const res = await fetch(`${API_URL}/api/offers/${item.id}`)
      const json = await parseJsonResponse<{ error?: string; items?: unknown[]; [k: string]: unknown }>(res)
      if (!res.ok) throw new Error(json.error || 'Yüklenemedi')
      const items = (json.items || []).map((i: unknown) => {
        const row = i as Record<string, unknown>
        const it = emptyItem()
        it.type = (row.type as string) === 'expense' ? 'expense' : 'product'
        it.product_id = row.product_id as number | null
        it.product_name = row.product_name as string | null
        it.product_sku = row.product_sku as string | null
        it.unit_name = row.unit_name as string | null
        it.description = row.description as string | null
        it.amount = (row.amount as number) ?? 1
        it.unit_price = (row.unit_price as number) ?? 0
        it.line_discount = (row.line_discount as number) ?? 0
        it.discount_1 = (row.discount_1 as number) ?? 0
        it.discount_2 = (row.discount_2 as number) ?? 0
        it.discount_3 = (row.discount_3 as number) ?? 0
        it.discount_4 = (row.discount_4 as number) ?? 0
        it.discount_5 = (row.discount_5 as number) ?? 0
        it.tax_rate = (row.tax_rate as number) ?? 0
        return it
      })
      setForm({
        date: (json.date as string)?.slice(0, 10) || new Date().toISOString().slice(0, 10),
        order_no: (json.order_no as string) || '',
        customer_id: (json.customer_id as number) ?? '',
        contact_id: (json.contact_id as number) ?? '',
        description: (json.description as string) || '',
        notes: (json.notes as string) || '',
        discount_1: (json.discount_1 as number) ?? 0,
        discount_2: (json.discount_2 as number) ?? 0,
        discount_3: (json.discount_3 as number) ?? 0,
        discount_4: (json.discount_4 as number) ?? 0,
        items,
      })
      if (json.customer_id) fetchContacts(json.customer_id as number)
      setCustomerInput((json.customer_title as string) || '')
      setCustomerSearchResults([])
    } catch (err) {
      toastError('Yüklenemedi', err instanceof Error ? err.message : 'Teklif yüklenemedi')
      return
    }
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingId(null)
    setForm(emptyForm)
    setModalStep(1)
    setDiscountModalRow(null)
    setActiveProductSearchRow(null)
    setProductSearchQuery('')
    setProductResults([])
    setCustomerInput('')
    setCustomerSearchResults([])
    setSimilarCustomersModalOpen(false)
    setSimilarCustomersList([])
    setNewCustomerModalOpen(false)
    setNewCustomerForm({ title: '', email: '', phone: '', group_id: '', type_id: '', legal_type_id: '' })
    setNewCustomerModalFromNextStep(false)
    setContactInput('')
    setContactSearchResults([])
    setNewContactModalOpen(false)
    setNewContactForm({ full_name: '', phone: '', role: '' })
  }

  useEffect(() => {
    if (form.customer_id && typeof form.customer_id === 'number') {
      fetchContacts(form.customer_id)
    } else {
      setContacts([])
      setForm((f) => ({ ...f, contact_id: '' }))
      setContactInput('')
    }
  }, [form.customer_id, fetchContacts])

  useEffect(() => {
    if (form.contact_id && contacts.length > 0) {
      const c = contacts.find((x) => x.id === form.contact_id)
      if (c) setContactInput(`${c.full_name}${c.role ? ` (${c.role})` : ''}`)
    }
  }, [form.contact_id, contacts])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      let customerId: number | null = form.customer_id === '' ? null : form.customer_id
      if (!customerId && customerInput.trim()) {
        const createRes = await fetch(`${API_URL}/api/customers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: customerInput.trim() }),
        })
        const createJson = await parseJsonResponse<{ id?: number; error?: string }>(createRes)
        if (!createRes.ok) throw new Error(createJson.error || 'Müşteri oluşturulamadı')
        customerId = createJson.id ?? null
      }
      let contactId: number | null = form.contact_id === '' ? null : form.contact_id
      if (customerId && !contactId && contactInput.trim()) {
        const createContactRes = await fetch(`${API_URL}/api/customers/${customerId}/contacts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ full_name: contactInput.trim() }),
        })
        const createContactJson = await parseJsonResponse<{ id?: number; error?: string }>(createContactRes)
        if (!createContactRes.ok) throw new Error(createContactJson.error || 'İletişim kişisi oluşturulamadı')
        contactId = createContactJson.id ?? null
      }
      const payload = {
        date: form.date,
        order_no: form.order_no.trim() || undefined,
        customer_id: customerId,
        contact_id: contactId,
        description: form.description.trim() || undefined,
        notes: form.notes.trim() || undefined,
        discount_1: form.discount_1,
        discount_2: form.discount_2,
        discount_3: form.discount_3,
        discount_4: form.discount_4,
        items: form.items.map((it) => {
          const d1 = it.discount_1 ?? 0, d2 = it.discount_2 ?? 0, d3 = it.discount_3 ?? 0, d4 = it.discount_4 ?? 0, d5 = it.discount_5 ?? 0
          return {
            type: it.type || 'product',
            product_id: it.type === 'expense' ? null : it.product_id,
            description: (it.type === 'expense' || !it.product_id) ? (it.description || undefined) : undefined,
            amount: it.amount,
            unit_price: it.unit_price,
            line_discount: it.line_discount || (d1 + d2 + d3 + d4 + d5),
            discount_1: d1,
            discount_2: d2,
            discount_3: d3,
            discount_4: d4,
            discount_5: d5,
            tax_rate: it.tax_rate,
          }
        }),
      }
      const url = editingId ? `${API_URL}/api/offers/${editingId}` : `${API_URL}/api/offers`
      const method = editingId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await parseJsonResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(json.error || 'Kaydedilemedi')
      closeModal()
      fetchData()
      toastSuccess(editingId ? 'Teklif güncellendi' : 'Teklif eklendi')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi')
      toastError('Kaydetme hatası', err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number, onSuccess?: () => void) => {
    if (!confirm('Bu teklifi silmek istediğinize emin misiniz?')) return
    try {
      const res = await fetch(`${API_URL}/api/offers/${id}`, { method: 'DELETE' })
      const json = await parseJsonResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(json.error || 'Silinemedi')
      fetchData()
      toastSuccess('Teklif silindi')
      onSuccess?.()
    } catch (err) {
      toastError('Silme hatası', err instanceof Error ? err.message : 'Silinemedi')
    }
  }

  const selectProductForRow = (idx: number, p: Product) => {
    setForm((f) => ({
      ...f,
      items: f.items.map((it, i) =>
        i === idx ? { ...it, product_id: p.id, product_name: p.name, product_sku: p.sku || null, unit_name: p.unit_name || null, amount: 1, unit_price: p.price } : it
      ),
    }))
    setActiveProductSearchRow(null)
    setProductSearchQuery('')
    setProductResults([])
  }

  const addExpenseRow = () => {
    setForm((f) => ({
      ...f,
      items: [...f.items, { ...emptyItem(), type: 'expense', description: 'Masraf', amount: 1, unit_price: 0 }],
    }))
  }

  const removeItem = (idx: number) => {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
    if (discountModalRow === idx) setDiscountModalRow(null)
    else if (discountModalRow != null && discountModalRow > idx) setDiscountModalRow(discountModalRow - 1)
    if (activeProductSearchRow === idx) setActiveProductSearchRow(null)
    else if (activeProductSearchRow != null && activeProductSearchRow > idx) setActiveProductSearchRow(activeProductSearchRow - 1)
  }

  const updateItem = (idx: number, field: keyof OfferItem, value: number | string | null) => {
    setForm((f) => ({
      ...f,
      items: f.items.map((it, i) => (i === idx ? { ...it, [field]: value } : it)),
    }))
  }

  const getItemTotalDiscount = (it: OfferItem) => {
    const d1 = it.discount_1 ?? 0, d2 = it.discount_2 ?? 0, d3 = it.discount_3 ?? 0, d4 = it.discount_4 ?? 0, d5 = it.discount_5 ?? 0
    return it.line_discount || (d1 + d2 + d3 + d4 + d5)
  }

  const subtotal = form.items.reduce((s, it) => s + getItemRowTotal(it), 0)

  const canGoStep2 = form.date && form.order_no
  const hasNewCustomerPending = customerInput.trim() && !form.customer_id
  const hasNewContactPending = form.customer_id && contactInput.trim() && !form.contact_id

  return (
    <PageLayout
      title="Teklifler"
      description="Teklif listesini yönetin"
      backTo="/"
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
              placeholder="Ara (teklif no, müşteri, açıklama)..."
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
            <TooltipContent>Yeni teklif</TooltipContent>
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Teklif No</th>
                  <th className="text-left p-3 font-medium">Tarih</th>
                  <th className="text-left p-3 font-medium">Müşteri</th>
                  <th className="text-left p-3 font-medium">Açıklama</th>
                  <th className="text-left p-3 font-medium">Oluşturulma</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Yükleniyor...</td></tr>
                ) : data.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">{error || 'Henüz teklif yok.'}</td></tr>
                ) : (
                  data.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b hover:bg-muted/30 cursor-pointer"
                      onClick={() => openEdit(item)}
                    >
                      <td className="p-3 font-medium">{item.order_no || '—'}</td>
                      <td className="p-3">{item.date ? formatDate(item.date) : '—'}</td>
                      <td className="p-3">{item.customer_title || '—'}</td>
                      <td className="p-3 text-muted-foreground max-w-[200px] truncate">{item.description || '—'}</td>
                      <td className="p-3 text-muted-foreground">{item.created_at ? formatDate(item.created_at) : '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-w-4xl min-h-[70vh] max-h-[90vh] flex flex-col gap-6 overflow-hidden p-8">
          <DialogHeader className="shrink-0 space-y-1.5">
            <DialogTitle>{editingId ? 'Teklif Düzenle' : 'Yeni Teklif'}</DialogTitle>
            <DialogDescription>
              {modalStep === 1 ? '1. Adım: Teklif bilgilerini girin.' : '2. Adım: Ürün ve masrafları ekleyin.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1 overflow-hidden gap-6">
            {error && <p className="text-sm text-destructive shrink-0 mt-1">{error}</p>}

            {modalStep === 1 && (
              <div className="grid grid-cols-2 gap-5 shrink-0">
                <div className="space-y-2">
                  <Label htmlFor="date">Tarih</Label>
                  <Input id="date" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="order_no">Teklif No</Label>
                  <Input id="order_no" value={form.order_no} onChange={(e) => setForm((f) => ({ ...f, order_no: e.target.value }))} placeholder="OR-2026-0001" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customer_id">Müşteri</Label>
                  <div className="relative">
                    <Input
                      id="customer_id"
                      value={customerInput}
                      onChange={(e) => {
                        setCustomerInput(e.target.value)
                        setForm((f) => ({ ...f, customer_id: '', contact_id: '' }))
                        fetchCustomerSearch(e.target.value)
                      }}
                      onFocus={() => customerInput && fetchCustomerSearch(customerInput)}
                      onBlur={() => setTimeout(() => {
                        setCustomerSearchResults([])
                        checkSimilarCustomersOnBlur()
                      }, 150)}
                      placeholder="Firma ara veya yeni firma adı yazın..."
                      className={`h-9 ${!form.customer_id && customerInput.trim() ? 'pr-10' : ''}`}
                    />
                    {!form.customer_id && customerInput.trim() && (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-500/15 text-green-600 dark:text-green-400">
                        Yeni
                      </span>
                    )}
                    {customerSearchResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg z-20 max-h-48 overflow-y-auto">
                        {customerSearchResults.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
                            onMouseDown={(e) => {
                              e.preventDefault()
                              setForm((f) => ({ ...f, customer_id: c.id, contact_id: '' }))
                              setCustomerInput(`${c.title}${c.code ? ` (${c.code})` : ''}`)
                              setCustomerSearchResults([])
                              fetchContacts(c.id)
                            }}
                          >
                            {c.title} {c.code ? `(${c.code})` : ''}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact_id">İletişim Kişisi</Label>
                  <div className="relative">
                    <Input
                      id="contact_id"
                      value={contactInput}
                      onChange={(e) => {
                        setContactInput(e.target.value)
                        setForm((f) => ({ ...f, contact_id: '' }))
                        filterContactSearch(e.target.value)
                        setActiveContactSearch(true)
                      }}
                      onFocus={() => {
                        if (contactInput) filterContactSearch(contactInput)
                        setActiveContactSearch(true)
                      }}
                      onBlur={() => setTimeout(() => {
                        setContactSearchResults([])
                        setActiveContactSearch(false)
                        checkNewContactOnBlur()
                      }, 150)}
                      placeholder={form.customer_id ? 'İletişim kişisi ara veya yeni kişi adı yazın...' : 'Önce müşteri seçin'}
                      className={`h-9 ${!form.contact_id && contactInput.trim() ? 'pr-10' : ''}`}
                      disabled={!form.customer_id}
                    />
                    {!form.contact_id && contactInput.trim() && form.customer_id && (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-500/15 text-green-600 dark:text-green-400">
                        Yeni
                      </span>
                    )}
                    {activeContactSearch && contactSearchResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg z-20 max-h-48 overflow-y-auto">
                        {contactSearchResults.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
                            onMouseDown={(e) => {
                              e.preventDefault()
                              setForm((f) => ({ ...f, contact_id: c.id }))
                              setContactInput(`${c.full_name}${c.role ? ` (${c.role})` : ''}`)
                              setContactSearchResults([])
                              setActiveContactSearch(false)
                            }}
                          >
                            {c.full_name} {c.role ? `(${c.role})` : ''}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="description">Açıklama</Label>
                  <Input id="description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Teklif açıklaması" />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="notes">Notlar</Label>
                  <Input id="notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Ek notlar" />
                </div>
              </div>
            )}

            {modalStep === 2 && (
              <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-4">
                <div className="flex items-center gap-3 shrink-0 flex-wrap">
                  <Label className="shrink-0">Kalemler</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addExpenseRow}>
                    <Receipt className="h-4 w-4 mr-1" />
                    Masraf Ekle
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setForm((f) => ({ ...f, items: [...f.items, emptyItem()] }))}>
                    <Plus className="h-4 w-4 mr-1" />
                    Satır Ekle
                  </Button>
                </div>
                <div className="border rounded-md overflow-auto flex-1 min-h-[120px]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-2 font-medium">Ürün / Masraf</th>
                        <th className="text-right p-2 w-20">Miktar</th>
                        <th className="text-right p-2 w-24">Birim Fiyat</th>
                        <th className="text-right p-2 w-20">İskonto</th>
                        <th className="text-right p-2 w-24">Toplam</th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {form.items.map((it, idx) => (
                        <tr key={idx} className="border-b">
                            <td className="p-2">
                              {it.type === 'expense' ? (
                                <Input
                                  className="h-8 text-sm"
                                  value={it.description || ''}
                                  onChange={(e) => updateItem(idx, 'description', e.target.value)}
                                  placeholder="Masraf açıklaması"
                                />
                              ) : (
                                <div className="relative min-w-[180px]">
                                  <Input
                                    className="h-8 text-sm"
                                    value={activeProductSearchRow === idx ? productSearchQuery : (it.product_name || it.product_sku || '')}
                                    onChange={(e) => {
                                      setActiveProductSearchRow(idx)
                                      setProductSearchQuery(e.target.value)
                                      fetchProductSearch(e.target.value)
                                    }}
                                    onFocus={() => {
                                      setActiveProductSearchRow(idx)
                                      if (!it.product_id) setProductSearchQuery('')
                                      else setProductSearchQuery(it.product_name || it.product_sku || '')
                                      fetchProductSearch(it.product_name || it.product_sku || '')
                                    }}
                                    onBlur={() => setTimeout(() => setActiveProductSearchRow(null), 150)}
                                    placeholder="Ürün ara..."
                                  />
                                  {activeProductSearchRow === idx && productResults.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg z-20 max-h-48 overflow-y-auto">
                                      {productResults.map((p) => (
                                        <button
                                          key={p.id}
                                          type="button"
                                          className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
                                          onClick={() => selectProductForRow(idx, p)}
                                        >
                                          {p.name} {p.sku ? `(${p.sku})` : ''} — {formatPrice(p.price)}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="p-2 text-right">
                              <Input
                                type="text"
                                inputMode="decimal"
                                className="h-8 w-20 text-right"
                                value={it.amount === 0 ? '' : String(it.amount)}
                                onChange={(e) => updateItem(idx, 'amount', parseDecimal(e.target.value) || 0)}
                                placeholder="0"
                              />
                            </td>
                            <td className="p-2 text-right">
                              <Input
                                type="text"
                                inputMode="decimal"
                                className="h-8 w-24 text-right"
                                value={it.unit_price === 0 ? '' : it.unit_price.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                onChange={(e) => updateItem(idx, 'unit_price', parseDecimal(e.target.value))}
                                placeholder="0,00"
                              />
                            </td>
                            <td className="p-2 text-right">
                              <button
                                type="button"
                                className="text-sm text-muted-foreground hover:text-foreground underline"
                                onClick={() => setDiscountModalRow(idx)}
                              >
                                {formatPrice(getItemTotalDiscount(it))}
                              </button>
                            </td>
                            <td className="p-2 text-right font-medium">{formatPrice(getItemRowTotal(it))}</td>
                            <td className="p-2">
                              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeItem(idx)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-sm font-medium shrink-0">Ara Toplam: {formatPrice(subtotal)}</p>
              </div>
            )}

            <DialogFooter className="shrink-0 mt-auto pt-5 -mx-8 -mb-8 px-8 pb-8 border-t border-border bg-muted/30 flex flex-row justify-end gap-2">
              {modalStep === 1 ? (
                <>
                  {editingId && (
                    <Button type="button" variant="outline" className="text-destructive" onClick={() => handleDelete(editingId, closeModal)} disabled={saving}>
                      Sil
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (hasNewCustomerPending) {
                        setNewCustomerForm({ title: customerInput.trim(), email: '', phone: '', group_id: '', type_id: '', legal_type_id: '' })
                        setNewCustomerModalFromNextStep(true)
                        setNewCustomerModalOpen(true)
                      } else if (hasNewContactPending) {
                        setNewContactForm({ full_name: contactInput.trim(), phone: '', role: '' })
                        setNewContactModalFromNextStep(true)
                        setNewContactModalOpen(true)
                      } else {
                        setModalStep(2)
                      }
                    }}
                    disabled={!canGoStep2}
                  >
                    İleri <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </>
              ) : (
                <>
                  <Button type="button" variant="outline" onClick={() => setModalStep(1)}>
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Geri
                  </Button>
                  {editingId && (
                    <Button type="button" variant="outline" className="text-destructive" onClick={() => handleDelete(editingId, closeModal)} disabled={saving}>
                      Sil
                    </Button>
                  )}
                  <Button type="submit" disabled={saving}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Button>
                </>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={newCustomerModalOpen} onOpenChange={(open) => !open && (setNewCustomerModalOpen(false), setNewCustomerModalFromNextStep(false))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Yeni müşteri</DialogTitle>
            <DialogDescription>
              Müşteri bilgilerini girin.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new_customer_title">Firma adı *</Label>
              <CustomerTitleInput
                id="new_customer_title"
                value={newCustomerForm.title}
                onChange={(v) => setNewCustomerForm((f) => ({ ...f, title: v }))}
                placeholder="Firma adı"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="new_customer_group">Grup</Label>
                <select
                  id="new_customer_group"
                  value={newCustomerForm.group_id}
                  onChange={(e) => setNewCustomerForm((f) => ({ ...f, group_id: e.target.value === '' ? '' : Number(e.target.value) }))}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="">—</option>
                  {customerGroups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new_customer_type">Müşteri Tipi</Label>
                <select
                  id="new_customer_type"
                  value={newCustomerForm.type_id}
                  onChange={(e) => setNewCustomerForm((f) => ({ ...f, type_id: e.target.value === '' ? '' : Number(e.target.value) }))}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="">—</option>
                  {customerTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new_customer_legal_type">Yasal Tip</Label>
              <select
                id="new_customer_legal_type"
                value={newCustomerForm.legal_type_id}
                onChange={(e) => setNewCustomerForm((f) => ({ ...f, legal_type_id: e.target.value === '' ? '' : Number(e.target.value) }))}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="">—</option>
                {customerLegalTypes.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new_customer_email">E-posta</Label>
              <Input
                id="new_customer_email"
                type="email"
                value={newCustomerForm.email}
                onChange={(e) => setNewCustomerForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="ornek@firma.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new_customer_phone">Telefon</Label>
              <PhoneInput
                id="new_customer_phone"
                value={newCustomerForm.phone}
                onChange={(v) => setNewCustomerForm((f) => ({ ...f, phone: v }))}
                placeholder="212 123 45 67"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => (setNewCustomerModalOpen(false), setNewCustomerModalFromNextStep(false))}>
              İptal
            </Button>
            <Button
              type="button"
              onClick={createNewCustomer}
              disabled={newCustomerSaving || !newCustomerForm.title.trim()}
            >
              {newCustomerSaving ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={discountModalRow !== null} onOpenChange={(open) => !open && setDiscountModalRow(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>İskonto</DialogTitle>
            <DialogDescription>
              Satır için 5 iskonto alanını girin.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {discountModalRow !== null && form.items[discountModalRow] && (
              <>
                <p className="text-sm text-muted-foreground">
                  {form.items[discountModalRow].type === 'expense'
                    ? form.items[discountModalRow].description || 'Masraf'
                    : form.items[discountModalRow].product_name || form.items[discountModalRow].product_sku || `Satır ${discountModalRow + 1}`}
                </p>
                {[1, 2, 3, 4, 5].map((n) => (
                  <div key={n} className="flex items-center gap-3">
                    <Label className="w-8 shrink-0">%{n}</Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      className="text-right"
                      value={((form.items[discountModalRow] as unknown as Record<string, number>)[`discount_${n}`] ?? 0) === 0 ? '' : String((form.items[discountModalRow] as unknown as Record<string, number>)[`discount_${n}`])}
                      onChange={(e) => updateItem(discountModalRow, `discount_${n}` as keyof OfferItem, parseDecimal(e.target.value))}
                      placeholder="0"
                    />
                  </div>
                ))}
              </>
            )}
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setDiscountModalRow(null)}>
              Kapat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newContactModalOpen} onOpenChange={(open) => !open && setNewContactModalOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Yeni iletişim kişisi</DialogTitle>
            <DialogDescription>
              Telefon ve rol bilgilerini girin.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new_contact_name">Ad Soyad</Label>
              <Input
                id="new_contact_name"
                value={newContactForm.full_name}
                onChange={(e) => setNewContactForm((f) => ({ ...f, full_name: e.target.value }))}
                placeholder="Ad Soyad"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new_contact_phone">Telefon</Label>
              <PhoneInput
                id="new_contact_phone"
                value={newContactForm.phone}
                onChange={(v) => setNewContactForm((f) => ({ ...f, phone: v }))}
                placeholder="532 207 12 53"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new_contact_role">Rol</Label>
              <Input
                id="new_contact_role"
                value={newContactForm.role}
                onChange={(e) => setNewContactForm((f) => ({ ...f, role: e.target.value }))}
                placeholder="Örn: Satın Alma Müdürü"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNewContactModalOpen(false)}>
              İptal
            </Button>
            <Button
              type="button"
              onClick={createNewContact}
              disabled={newContactSaving || !newContactForm.full_name.trim()}
            >
              {newContactSaving ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={similarCustomersModalOpen} onOpenChange={setSimilarCustomersModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Benzer kayıtlar bulundu</DialogTitle>
            <DialogDescription>
              Aşağıdaki firmalardan birini seçin veya &quot;{customerInput}&quot; ile yeni kayıt oluşturun.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 max-h-64 overflow-y-auto py-2">
            {similarCustomersList.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 p-3 rounded-md border bg-muted/30 hover:bg-muted/50"
              >
                <span className="text-sm font-medium">{c.title} {c.code ? `(${c.code})` : ''}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setForm((f) => ({ ...f, customer_id: c.id, contact_id: '' }))
                    setCustomerInput(`${c.title}${c.code ? ` (${c.code})` : ''}`)
                    setSimilarCustomersModalOpen(false)
                    setSimilarCustomersList([])
                    fetchContacts(c.id)
                  }}
                >
                  Seç
                </Button>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSimilarCustomersModalOpen(false)
                setSimilarCustomersList([])
              }}
            >
              İptal
            </Button>
            <Button
              type="button"
              onClick={() => {
                setSimilarCustomersModalOpen(false)
                setSimilarCustomersList([])
                setNewCustomerForm({ title: customerInput.trim(), email: '', phone: '', group_id: '', type_id: '', legal_type_id: '' })
                setNewCustomerModalOpen(true)
              }}
            >
              Yeni kayıt oluştur (&quot;{customerInput}&quot;)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  )
}
