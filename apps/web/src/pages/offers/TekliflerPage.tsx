import React, { useState, useEffect, useCallback, useRef } from 'react'
import { usePersistedListState } from '@/hooks/usePersistedListState'
import { Search, Plus, X, Trash2, SquarePen, Save, ArrowDownToLine } from 'lucide-react'
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
  customer_title?: string | null
  customer_code?: string | null
  total_amount?: number
  total_tl_offer?: number
  total_tl_current?: number
  currency_code?: string | null
  currency_symbol?: string | null
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
  /** UI: indirim tipi (yüzde/sabit) */
  discount_type?: 'percent' | 'fixed' | null
  /** UI: indirim değeri */
  discount_value?: number
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

interface ProductCurrency {
  id: number
  name: string
  code: string
  symbol?: string
}

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
  currency_id: '' as number | '',
  exchange_rate: 1,
  items: [] as OfferItem[],
}

const offersListDefaults = { search: '', page: 1, pageSize: 'fit' as PageSizeValue, fitLimit: 10 }

function getItemRowTotal(it: OfferItem): number {
  let totalDiscount = it.line_discount
  if (it.discount_type && it.discount_value != null) {
    const gross = it.amount * it.unit_price
    totalDiscount = it.discount_type === 'percent' ? gross * (it.discount_value / 100) : it.discount_value
  } else {
    const d1 = it.discount_1 ?? 0, d2 = it.discount_2 ?? 0, d3 = it.discount_3 ?? 0, d4 = it.discount_4 ?? 0, d5 = it.discount_5 ?? 0
    totalDiscount = totalDiscount || (d1 + d2 + d3 + d4 + d5)
  }
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
  const [dateEditMode, setDateEditMode] = useState(false)
  const [orderNoEditMode, setOrderNoEditMode] = useState(false)
  const [customerEditMode, setCustomerEditMode] = useState(false)
  const [expandedRowIndex, setExpandedRowIndex] = useState<number | null>(null)
  const [totalEditMode, setTotalEditMode] = useState(false)
  const [productSearchInput, setProductSearchInput] = useState('')
  const [productSearchDebounced, setProductSearchDebounced] = useState('')
  const [productTypeFilter, setProductTypeFilter] = useState<'' | number>('')
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
  const [contacts, setContacts] = useState<CustomerContact[]>([])
  const [contactInput, setContactInput] = useState('')
  const [newContactModalOpen, setNewContactModalOpen] = useState(false)
  const [newContactForm, setNewContactForm] = useState({ full_name: '', phone: '', role: '' })
  const [newContactSaving, setNewContactSaving] = useState(false)
  const [activeProductSearchRow, setActiveProductSearchRow] = useState<number | null>(null)
  const [, setProductSearchQuery] = useState('')
  const customerInputRef = useRef<HTMLInputElement>(null)
  const [productResults, setProductResults] = useState<Product[]>([])
  const [currencies, setCurrencies] = useState<ProductCurrency[]>([])
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({})
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

  useEffect(() => {
    const t = setTimeout(() => setProductSearchDebounced(productSearchInput), 300)
    return () => clearTimeout(t)
  }, [productSearchInput])

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
      }
    } catch (err) {
      toastError('Hata', err instanceof Error ? err.message : 'Oluşturulamadı')
    } finally {
      setNewContactSaving(false)
    }
  }, [form.customer_id, newContactForm])

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
        setNewCustomerModalOpen(true)
      }
    } catch {
      setNewCustomerForm({ title: input, email: '', phone: '', group_id: '', type_id: '', legal_type_id: '' })
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
      }
    } catch (err) {
      toastError('Hata', err instanceof Error ? err.message : 'Müşteri oluşturulamadı')
    } finally {
      setNewCustomerSaving(false)
    }
  }, [newCustomerForm])

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
      const params = new URLSearchParams()
      params.set('search', q)
      params.set('limit', '10')
      if (productTypeFilter !== '') params.set('filter_type_id', String(productTypeFilter))
      const res = await fetch(`${API_URL}/api/products?${params}`)
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
  }, [productTypeFilter])

  useEffect(() => {
    if (modalOpen && productSearchDebounced.trim()) {
      fetchProductSearch(productSearchDebounced)
    } else {
      setProductResults([])
    }
  }, [modalOpen, productSearchDebounced, fetchProductSearch])

  useEffect(() => {
    if (modalOpen && customerEditMode) {
      const t = setTimeout(() => customerInputRef.current?.focus(), 100)
      return () => clearTimeout(t)
    }
  }, [modalOpen, customerEditMode])

  useEffect(() => {
    if (modalOpen) {
      Promise.all([
        fetch(`${API_URL}/api/product-currencies?limit=50`).then((r) => r.json()),
        fetch(`${API_URL}/api/app-settings?category=parabirimleri`).then((r) => r.json()),
      ]).then(([curRes, ratesRes]) => {
        setCurrencies((curRes?.data || []).filter((c: ProductCurrency) => c.code))
        const rates = ratesRes?.exchange_rates ? (JSON.parse(ratesRes.exchange_rates) as Record<string, number>) : {}
        setExchangeRates(typeof rates === 'object' && rates ? rates : {})
      }).catch(() => {
        setCurrencies([])
        setExchangeRates({})
      })
    }
  }, [modalOpen])

  const openNew = async () => {
    setEditingId(null)
    setForm(emptyForm)
    setForm((f) => ({ ...f, date: new Date().toISOString().slice(0, 10) }))
    setContacts([])
    setCustomerInput('')
    setCustomerSearchResults([])
    setContactInput('')
    setDateEditMode(false)
    setOrderNoEditMode(false)
    setCustomerEditMode(false)
    setTotalEditMode(false)
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
    setDateEditMode(false)
    setOrderNoEditMode(false)
    setCustomerEditMode(false)
    setTotalEditMode(false)
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
        currency_id: (json.currency_id as number) ?? '',
        exchange_rate: (json.exchange_rate as number) ?? 1,
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

  const addProductToItems = (p: Product) => {
    setForm((f) => ({
      ...f,
      items: [...f.items, {
        ...emptyItem(),
        product_id: p.id,
        product_name: p.name,
        product_sku: p.sku || null,
        unit_name: p.unit_name || null,
        amount: 1,
        unit_price: p.price,
      }],
    }))
    setProductSearchInput('')
    setProductResults([])
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingId(null)
    setForm(emptyForm)
    setDateEditMode(false)
    setOrderNoEditMode(false)
    setCustomerEditMode(false)
    setTotalEditMode(false)
    setExpandedRowIndex(null)
    setActiveProductSearchRow(null)
    setProductSearchQuery('')
    setProductSearchInput('')
    setProductTypeFilter('')
    setProductResults([])
    setCustomerInput('')
    setCustomerSearchResults([])
    setSimilarCustomersModalOpen(false)
    setSimilarCustomersList([])
    setNewCustomerModalOpen(false)
    setNewCustomerForm({ title: '', email: '', phone: '', group_id: '', type_id: '', legal_type_id: '' })
    setContactInput('')
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
    const orderNo = form.order_no?.trim()
    if (!orderNo) {
      setError('Teklif numarası gerekli')
      return
    }
    const available = await checkOrderNo(orderNo)
    if (!available) {
      setError('Bu teklif numarası zaten kullanılıyor')
      return
    }
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
        currency_id: form.currency_id === '' ? null : form.currency_id,
        exchange_rate: form.exchange_rate,
        items: form.items.map((it) => {
          let lineDiscount = it.line_discount
          if (it.discount_type && it.discount_value != null) {
            const gross = it.amount * it.unit_price
            lineDiscount = it.discount_type === 'percent' ? gross * (it.discount_value / 100) : it.discount_value
          } else {
            const d1 = it.discount_1 ?? 0, d2 = it.discount_2 ?? 0, d3 = it.discount_3 ?? 0, d4 = it.discount_4 ?? 0, d5 = it.discount_5 ?? 0
            lineDiscount = lineDiscount || (d1 + d2 + d3 + d4 + d5)
          }
          return {
            type: it.type || 'product',
            product_id: it.type === 'expense' ? null : it.product_id,
            description: (it.type === 'expense' || !it.product_id) ? (it.description || undefined) : undefined,
            amount: it.amount,
            unit_price: it.unit_price,
            line_discount: lineDiscount,
            discount_1: it.discount_1 ?? 0,
            discount_2: it.discount_2 ?? 0,
            discount_3: it.discount_3 ?? 0,
            discount_4: it.discount_4 ?? 0,
            discount_5: it.discount_5 ?? 0,
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

  const removeItem = (idx: number) => {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
    if (expandedRowIndex === idx) setExpandedRowIndex(null)
    else if (expandedRowIndex != null && expandedRowIndex > idx) setExpandedRowIndex(expandedRowIndex - 1)
    if (activeProductSearchRow === idx) setActiveProductSearchRow(null)
    else if (activeProductSearchRow != null && activeProductSearchRow > idx) setActiveProductSearchRow(activeProductSearchRow - 1)
  }

  const updateItem = (idx: number, field: keyof OfferItem, value: number | string | null) => {
    setForm((f) => ({
      ...f,
      items: f.items.map((it, i) => (i === idx ? { ...it, [field]: value } : it)),
    }))
  }

  const subtotal = form.items.reduce((s, it) => s + getItemRowTotal(it), 0)
  const offerDiscountPercent = form.discount_1 ?? 0
  const offerDiscountAmount = subtotal * (offerDiscountPercent / 100)
  const grandTotal = subtotal - offerDiscountAmount

  const hasNewCustomerPending = customerInput.trim() && !form.customer_id
  const hasNewContactPending = form.customer_id && contactInput.trim() && !form.contact_id

  const checkOrderNo = useCallback(async (orderNo: string): Promise<boolean> => {
    if (!orderNo.trim()) return true
    try {
      const params = new URLSearchParams({ order_no: orderNo.trim() })
      if (editingId) params.set('exclude_id', String(editingId))
      const res = await fetch(`${API_URL}/api/offers/check-order-no?${params}`)
      const json = await parseJsonResponse<{ available?: boolean }>(res)
      return json.available === true
    } catch {
      return false
    }
  }, [editingId])

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
                  <th className="text-right p-3 font-medium">Teklif Toplamı</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Yükleniyor...</td></tr>
                ) : data.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">{error || 'Henüz teklif yok.'}</td></tr>
                ) : (
                  data.map((item) => {
                    const isTry = !item.currency_code || item.currency_code === 'TRY' || item.currency_code === 'TL'
                    return (
                      <tr
                        key={item.id}
                        className="border-b hover:bg-muted/30 cursor-pointer"
                        onClick={() => openEdit(item)}
                      >
                        <td className="p-3 font-medium">{item.order_no || '—'}</td>
                        <td className="p-3">{item.date ? formatDate(item.date) : '—'}</td>
                        <td className="p-3">{item.customer_title || '—'}</td>
                        <td className="p-3 text-muted-foreground max-w-[200px] truncate">{item.description || '—'}</td>
                        <td className="p-3 text-right">
                          <div className="flex flex-col items-end gap-0.5 text-sm">
                            <span className="tabular-nums">
                              <span className="font-medium">{formatPrice(item.total_tl_offer ?? 0)} ₺</span>
                              {!isTry && item.currency_symbol && (
                                <span className="text-muted-foreground ml-1">
                                  ({formatPrice(item.total_amount ?? 0)} {item.currency_symbol} — teklif kuru)
                                </span>
                              )}
                            </span>
                            {!isTry && item.total_tl_current != null && (
                              <span className="text-xs text-muted-foreground tabular-nums">
                                Anlık TL: {formatPrice(item.total_tl_current)} ₺
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col gap-4 overflow-hidden p-6">
          <DialogHeader className="shrink-0 space-y-1.5 text-left">
            <DialogTitle>{editingId ? 'Teklif Düzenle' : 'Yeni Teklif'}</DialogTitle>
            <DialogDescription>Teklif bilgilerini görüntüleyin ve düzenleyin.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1 overflow-hidden gap-6">
            {error && <p className="text-sm text-destructive shrink-0 mt-1">{error}</p>}

            {/* Üst bilgiler: 1. satır tarih + teklif no + döviz kuru, 2. satır müşteri */}
            <div className="shrink-0 border rounded-lg p-4 bg-muted/20 space-y-4">
              {/* 1. satır: Tarih, Teklif No, Döviz (eşit genişlik, satırı kaplar) */}
              <div className="grid grid-cols-3 gap-4 w-full">
                <div className="space-y-1.5 min-w-0">
                  <Label className="text-xs text-muted-foreground">Teklif Tarihi</Label>
                  <div className="flex items-center gap-2">
                    {dateEditMode ? (
                      <Input id="date" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="h-9 flex-1 min-w-0" />
                    ) : (
                      <div className="h-9 px-3 flex items-center rounded-md border bg-muted/50 text-sm flex-1 min-w-0">{form.date ? formatDate(form.date) : '—'}</div>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => setDateEditMode((v) => !v)}>
                          {dateEditMode ? <Save className="h-4 w-4" /> : <SquarePen className="h-4 w-4" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{dateEditMode ? 'Kaydet' : 'Düzenle'}</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
                <div className="space-y-1.5 min-w-0">
                  <Label className="text-xs text-muted-foreground">Teklif No</Label>
                  <div className="flex items-center gap-2">
                    {orderNoEditMode ? (
                      <Input id="order_no" value={form.order_no} onChange={(e) => setForm((f) => ({ ...f, order_no: e.target.value }))} placeholder="Teklif no" className="h-9 flex-1 min-w-0" />
                    ) : (
                      <div className="h-9 px-3 flex items-center rounded-md border bg-muted/50 text-sm flex-1 min-w-0">{form.order_no || '—'}</div>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => setOrderNoEditMode((v) => !v)}>
                          {orderNoEditMode ? <Save className="h-4 w-4" /> : <SquarePen className="h-4 w-4" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{orderNoEditMode ? 'Kaydet' : 'Düzenle'}</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
                <div className="space-y-1.5 min-w-0">
                  <Label className="text-xs text-muted-foreground">Para Birimi / Döviz Kuru</Label>
                  <div className="flex flex-col gap-2">
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                      value={form.currency_id === '' ? '' : form.currency_id}
                      onChange={(e) => {
                        const val = e.target.value === '' ? '' : Number(e.target.value)
                        const cur = currencies.find((c) => c.id === val)
                        const rate = cur?.code && exchangeRates[cur.code.toUpperCase()] != null ? exchangeRates[cur.code.toUpperCase()] : 1
                        setForm((f) => ({ ...f, currency_id: val, exchange_rate: rate }))
                      }}
                    >
                      <option value="">TRY (₺)</option>
                      {currencies.filter((c) => (c.code || '').toUpperCase() !== 'TRY' && (c.code || '').toUpperCase() !== 'TL').map((c) => (
                        <option key={c.id} value={c.id}>{c.name} ({c.symbol || c.code})</option>
                      ))}
                    </select>
                    {form.currency_id !== '' && form.currency_id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type="text"
                          inputMode="decimal"
                          className="h-9 flex-1 min-w-0"
                          value={form.exchange_rate === 1 ? '' : form.exchange_rate.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                          onChange={(e) => setForm((f) => ({ ...f, exchange_rate: parseDecimal(e.target.value) ?? 1 }))}
                          placeholder="1 birim = X ₺"
                        />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="shrink-0"
                              onClick={() => setForm((f) => ({
                                ...f,
                                exchange_rate: Math.floor((f.exchange_rate || 1) * 100) / 100,
                              }))}
                            >
                              <ArrowDownToLine className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Virgülden sonrasını aşağı yuvarla (2 basamak)</TooltipContent>
                        </Tooltip>
                        <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                          Anlık: {(() => {
                            const cur = currencies.find((c) => c.id === form.currency_id)
                            const anlikKur = cur?.code ? exchangeRates[cur.code.toUpperCase()] : null
                            return anlikKur != null ? formatPrice(anlikKur) : '—'
                          })()} ₺
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              {/* 2. satır: Müşteri */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Müşteri</Label>
                <div className="flex items-center gap-2">
                  {customerEditMode ? (
                    <div className="flex gap-2 flex-1 min-w-0">
                      <div className="relative flex-1 min-w-0">
                        <Input
                          ref={customerInputRef}
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
                          placeholder="Müşteri ara..."
                          className="h-9"
                        />
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
                      <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => { setForm((f) => ({ ...f, customer_id: '', contact_id: '' })); setCustomerInput('') }}>
                        İsimsiz
                      </Button>
                    </div>
                  ) : (
                    <div className="h-9 px-3 flex items-center rounded-md border bg-muted/50 text-sm flex-1 min-w-0">{customerInput || '—'}</div>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => setCustomerEditMode((v) => !v)}>
                        {customerEditMode ? <Save className="h-4 w-4" /> : <SquarePen className="h-4 w-4" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{customerEditMode ? 'Kaydet' : 'Düzenle'}</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </div>

            {/* Teklif kalemleri */}
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-3">
              <div className="flex items-center gap-2 shrink-0">
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Ürün ara ve ekle..."
                    value={productSearchInput}
                    onChange={(e) => setProductSearchInput(e.target.value)}
                    onFocus={() => productSearchDebounced && fetchProductSearch(productSearchDebounced)}
                    className="pl-9 h-9"
                  />
                  {productResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg z-20 max-h-48 overflow-y-auto">
                      {productResults.map((p) => (
                        <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-muted text-sm">
                          <span>{p.name} {p.sku ? `(${p.sku})` : ''} — {formatPrice(p.price)} ₺</span>
                          <Button type="button" size="sm" variant="outline" onClick={() => addProductToItems(p)}>Ekle</Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="outline" size="sm" disabled={form.items.length === 0} onClick={() => setForm((f) => ({ ...f, items: [...f.items, { ...emptyItem(), type: 'expense', description: 'Yeni satır' }] }))}>
                      <Plus className="h-4 w-4 mr-1" /> Satır ekle
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{form.items.length === 0 ? 'Önce ürün ekleyin' : 'Yeni satır ekle'}</TooltipContent>
                </Tooltip>
              </div>
              <div className="border rounded-md overflow-auto flex-1 min-h-[140px]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-2 font-medium">Ürün / Açıklama</th>
                      <th className="text-right p-2 w-16">Adet</th>
                      <th className="text-right p-2 w-24">Fiyat</th>
                      <th className="text-right p-2 w-24">Tutar</th>
                      <th className="w-24" />
                    </tr>
                  </thead>
                  <tbody>
                    {form.items.map((it, idx) => (
                      <React.Fragment key={idx}>
                        <tr className="border-b">
                          <td className="p-2 font-medium">{it.product_name || it.product_sku || it.description || '—'}</td>
                          <td className="p-2 text-right tabular-nums">{expandedRowIndex === idx ? (
                            <Input type="text" inputMode="decimal" className="h-8 w-16 text-right" value={it.amount === 0 ? '' : String(it.amount)} onChange={(e) => updateItem(idx, 'amount', parseDecimal(e.target.value) || 0)} placeholder="0" />
                          ) : (
                            it.amount
                          )}</td>
                          <td className="p-2 text-right tabular-nums">{expandedRowIndex === idx ? (
                            <Input type="text" inputMode="decimal" className="h-8 w-24 text-right" value={it.unit_price === 0 ? '' : it.unit_price.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} onChange={(e) => updateItem(idx, 'unit_price', parseDecimal(e.target.value))} placeholder="0,00" />
                          ) : (
                            it.unit_price.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
                          )} ₺</td>
                          <td className="p-2 text-right font-medium tabular-nums">{formatPrice(getItemRowTotal(it))} ₺</td>
                          <td className="p-2">
                            <div className="flex items-center justify-end gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => setExpandedRowIndex(expandedRowIndex === idx ? null : idx)}>
                                    {expandedRowIndex === idx ? <Save className="h-3.5 w-3.5" /> : <SquarePen className="h-3.5 w-3.5" />}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{expandedRowIndex === idx ? 'Kaydet' : 'Düzenle'}</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button type="button" variant="outline" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeItem(idx)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Sil</TooltipContent>
                              </Tooltip>
                            </div>
                          </td>
                        </tr>
                        {expandedRowIndex === idx && (
                          <tr className="border-b bg-muted/20">
                            <td colSpan={5} className="p-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label className="text-xs">Açıklama</Label>
                                  <Input className="h-8 text-sm" value={it.description || ''} onChange={(e) => updateItem(idx, 'description', e.target.value)} placeholder="Satır açıklaması" />
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-xs">İndirim</Label>
                                  <div className="flex items-center gap-2">
                                    <select className="h-8 rounded-md border border-input bg-transparent px-2 text-sm w-24" value={it.discount_type ?? ''} onChange={(e) => updateItem(idx, 'discount_type', e.target.value === '' ? null : (e.target.value as 'percent' | 'fixed'))}>
                                      <option value="">—</option>
                                      <option value="percent">Yüzde</option>
                                      <option value="fixed">Sabit</option>
                                    </select>
                                    <div className="relative flex-1">
                                      <Input type="text" inputMode="decimal" className="h-8 text-right pr-8" value={it.discount_value != null && it.discount_value !== 0 ? String(it.discount_value) : ''} onChange={(e) => updateItem(idx, 'discount_value', parseDecimal(e.target.value))} placeholder="0" />
                                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{it.discount_type === 'percent' ? '%' : it.discount_type === 'fixed' ? '₺' : ''}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Toplamlar */}
              <div className="shrink-0 border rounded-lg p-4 bg-muted/10 space-y-2 max-w-xs ml-auto">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Ara Toplam</span>
                  <span className="font-medium tabular-nums">{formatPrice(subtotal)} ₺</span>
                </div>
                <div className="flex justify-between text-sm items-center gap-2">
                  <span className="text-muted-foreground">İskonto</span>
                  {totalEditMode ? (
                    <div className="flex items-center gap-1">
                      <Input type="text" inputMode="decimal" className="h-8 w-16 text-right" value={offerDiscountPercent === 0 ? '' : String(offerDiscountPercent)} onChange={(e) => setForm((f) => ({ ...f, discount_1: parseDecimal(e.target.value) ?? 0 }))} placeholder="0" />
                      <span className="text-muted-foreground">%</span>
                    </div>
                  ) : (
                    <span className="font-medium tabular-nums">{offerDiscountPercent > 0 ? `%${offerDiscountPercent} (-${formatPrice(offerDiscountAmount)} ₺)` : '—'}</span>
                  )}
                </div>
                <div className="flex justify-between text-sm pt-2 border-t">
                  <span className="font-medium">Genel Toplam</span>
                  {totalEditMode ? (
                    <div className="flex items-center gap-1">
                      <Input type="text" inputMode="decimal" className="h-8 w-28 text-right font-medium" value={grandTotal === 0 ? '' : grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} onChange={(e) => {
                        const v = parseDecimal(e.target.value)
                        if (v != null && subtotal > 0) {
                          const pct = Math.max(0, Math.min(100, (1 - v / subtotal) * 100))
                          setForm((f) => ({ ...f, discount_1: pct }))
                        }
                      }} placeholder="0,00" />
                      <span>₺</span>
                    </div>
                  ) : (
                    <span className="font-semibold tabular-nums">{formatPrice(grandTotal)} ₺</span>
                  )}
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="h-7 text-xs -mt-1" onClick={() => setTotalEditMode((v) => !v)}>
                      {totalEditMode ? <Save className="h-3 w-3 mr-1" /> : <SquarePen className="h-3 w-3 mr-1" />} {totalEditMode ? 'Kaydet' : 'Toplam düzenle'}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Genel toplam veya iskonto oranını düzenle</TooltipContent>
                </Tooltip>
              </div>
            </div>

            <DialogFooter className="shrink-0 pt-4 -mx-6 px-6 pb-6 border-t border-border bg-muted/30 flex flex-row justify-between items-center">
              <div className="flex items-center gap-2">
                {editingId && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button type="button" variant="outline" size="icon" className="text-destructive" onClick={() => handleDelete(editingId, closeModal)} disabled={saving}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Sil</TooltipContent>
                  </Tooltip>
                )}
              </div>
              <div className="flex items-center gap-2">
                {customerEditMode && (hasNewCustomerPending || hasNewContactPending) && (
                  <Button type="button" variant="outline" onClick={() => {
                    if (hasNewCustomerPending) {
                      setNewCustomerForm({ title: customerInput.trim(), email: '', phone: '', group_id: '', type_id: '', legal_type_id: '' })
                      setNewCustomerModalOpen(true)
                    } else if (hasNewContactPending) {
                      setNewContactForm({ full_name: contactInput.trim(), phone: '', role: '' })
                      setNewContactModalOpen(true)
                    }
                  }}>
                    Yeni {hasNewCustomerPending ? 'müşteri' : 'iletişim'} oluştur
                  </Button>
                )}
                <Button type="submit" disabled={saving || !form.date || !form.order_no?.trim()}>
                  {saving ? 'Kaydediliyor...' : 'Kaydet'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={newCustomerModalOpen} onOpenChange={(open) => !open && setNewCustomerModalOpen(false)}>
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
            <Button type="button" variant="outline" onClick={() => setNewCustomerModalOpen(false)}>
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
