import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Search, Plus, Trash2, SquarePen, Save, ArrowDownToLine, ChevronDown, ChevronUp, Copy, ArrowUp, ArrowDown, FileDown, Check, X } from 'lucide-react'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toastSuccess, toastError } from '@/lib/toast'
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog'
import { API_URL, parseJsonResponse } from '@/lib/api'
import { formatDate, formatPrice, normalizeForSearch, parseDecimal, cn } from '@/lib/utils'
import { DecimalInput } from '@/components/DecimalInput'
import { PhoneInput } from '@/components/PhoneInput'
import { CustomerTitleInput } from '@/components/CustomerTitleInput'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import {
  type OfferItem,
  type Customer,
  type CustomerGroup,
  type CustomerType,
  type CustomerLegalType,
  type CustomerContact,
  type Product,
  type ProductCurrency,
  emptyForm,
  emptyItem,
  getOfferCurrencyInfo,
  getItemLineDiscount,
  getItemRowTotal,
  convertToOfferCurrency,
  convertBetweenCurrencies,
  groupProductsByItemGroup,
  filterCustomersByWords,
} from './teklif-common'

export function TeklifFormPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [dateEditMode, setDateEditMode] = useState(false)
  const [orderNoEditMode, setOrderNoEditMode] = useState(false)
  const [customerEditMode, setCustomerEditMode] = useState(false)
  const [expandedRowIndex, setExpandedRowIndex] = useState<number | null>(null)
  const [totalEditMode, setTotalEditMode] = useState(false)
  const [productTypeFilter] = useState<'' | number>('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: number | null; onSuccess?: () => void }>({ open: false, id: null })
  const [error, setError] = useState<string | null>(null)
  const [customerInput, setCustomerInput] = useState('')
  const [customerSearchResults, setCustomerSearchResults] = useState<Customer[]>([])
  const [customerSearchHighlightIndex, setCustomerSearchHighlightIndex] = useState(0)
  const [similarCustomersModalOpen, setSimilarCustomersModalOpen] = useState(false)
  const [similarCustomersList, setSimilarCustomersList] = useState<Customer[]>([])
  const [newCustomerModalOpen, setNewCustomerModalOpen] = useState(false)
  const [newCustomerSearchStep, setNewCustomerSearchStep] = useState<'search' | 'form'>('search')
  const [externalSearchInput, setExternalSearchInput] = useState('')
  const [externalSearchDebounced, setExternalSearchDebounced] = useState('')
  const [externalSearchResults, setExternalSearchResults] = useState<{ source: string; id: string; title: string; tax_no?: string; tax_office?: string; email?: string; phone?: string; code?: string }[]>([])
  const [externalSearchLoading, setExternalSearchLoading] = useState(false)
  const [newCustomerForm, setNewCustomerForm] = useState({ title: '', email: '', phone: '', tax_no: '', tax_office: '', group_id: '' as number | '', type_id: '' as number | '', legal_type_id: '' as number | '' })
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
  const [addRowFormOpen, setAddRowFormOpen] = useState(false)
  const [addRowExpanded, setAddRowExpanded] = useState(false)
  const [addRowDraft, setAddRowDraft] = useState<OfferItem>(() => emptyItem())
  const [addRowProductInput, setAddRowProductInput] = useState('')
  const [addRowProductDebounced, setAddRowProductDebounced] = useState('')
  const [addRowProductResults, setAddRowProductResults] = useState<Product[]>([])
  const [rowProductSearchInput, setRowProductSearchInput] = useState('')
  const [rowProductSearchDebounced, setRowProductSearchDebounced] = useState('')
  const [rowProductResults, setRowProductResults] = useState<Product[]>([])
  const [rowProductSearchHighlightIndex, setRowProductSearchHighlightIndex] = useState(0)
  const [addRowProductHighlightIndex, setAddRowProductHighlightIndex] = useState(0)
  const lastCommittedItemsRef = useRef<OfferItem[]>([])
  const customerInputRef = useRef<HTMLInputElement>(null)
  const [focusUnitPriceRow, setFocusUnitPriceRow] = useState<number | null>(null)
  const unitPriceFocusRef = useRef<HTMLInputElement>(null)
  const [currencyPopoverRow, setCurrencyPopoverRow] = useState<number | null>(null)
  const [currencies, setCurrencies] = useState<ProductCurrency[]>([])
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({})
  const [taxRates, setTaxRates] = useState<{ id: number; name: string; value: number }[]>([])
  const [teklifPriceTypeId, setTeklifPriceTypeId] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [offerNoteCategories, setOfferNoteCategories] = useState<{ id: number; code: string; label: string; options: { id: number; label: string; enabled_by_default: number }[] }[]>([])
  const [offerAttachments, setOfferAttachments] = useState<{ id: number; title: string; product_ids: number[] }[]>([])
  const [offerTags, setOfferTags] = useState<{ id: number; type: 'dahil' | 'haric'; label: string; description?: string | null }[]>([])
  const [firmaSectionOpen, setFirmaSectionOpen] = useState(false)

  const goBack = useCallback(() => navigate('/teklifler'), [navigate])

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
        const fullName = json.full_name || newContactForm.full_name.trim()
        setForm((f) => ({ ...f, contact_id: newId, authorized_name: fullName || f.authorized_name }))
        setContactInput(fullName)
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
        setExternalSearchInput(input)
        setNewCustomerForm({ title: input, email: '', phone: '', tax_no: '', tax_office: '', group_id: '', type_id: '', legal_type_id: '' })
        setNewCustomerSearchStep('search')
        setNewCustomerModalOpen(true)
      }
    } catch {
      setExternalSearchInput(input)
      setNewCustomerForm({ title: input, email: '', phone: '', tax_no: '', tax_office: '', group_id: '', type_id: '', legal_type_id: '' })
      setNewCustomerSearchStep('search')
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
          tax_no: newCustomerForm.tax_no.trim() || undefined,
          tax_office: newCustomerForm.tax_office.trim() || undefined,
          group_id: newCustomerForm.group_id === '' ? null : newCustomerForm.group_id,
          type_id: newCustomerForm.type_id === '' ? null : newCustomerForm.type_id,
          legal_type_id: newCustomerForm.legal_type_id === '' ? null : newCustomerForm.legal_type_id,
        }),
      })
      const json = await parseJsonResponse<{ id?: number; title?: string; code?: string; error?: string }>(res)
      if (!res.ok) throw new Error(json.error || 'Müşteri oluşturulamadı')
      const newId = json.id
      if (newId) {
        setForm((f) => ({
          ...f,
          customer_id: newId,
          contact_id: '',
          company_name: newCustomerForm.title.trim() || f.company_name,
          tax_office: newCustomerForm.tax_office?.trim() || f.tax_office,
          tax_no: newCustomerForm.tax_no?.trim() || f.tax_no,
          company_email: newCustomerForm.email?.trim() || f.company_email,
          company_phone: newCustomerForm.phone?.trim() || f.company_phone,
        }))
        setCustomerInput(json.title || newCustomerForm.title.trim())
        setNewCustomerModalOpen(false)
        setNewCustomerSearchStep('search')
        setNewCustomerForm({ title: '', email: '', phone: '', tax_no: '', tax_office: '', group_id: '', type_id: '', legal_type_id: '' })
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

  const fetchContacts = useCallback(async (customerId: number) => {
    try {
      const res = await fetch(`${API_URL}/api/customers/${customerId}/contacts`)
      const json = await parseJsonResponse<{ data?: CustomerContact[] }>(res)
      setContacts(json.data || [])
    } catch {
      setContacts([])
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setAddRowProductDebounced(addRowProductInput), 300)
    return () => clearTimeout(t)
  }, [addRowProductInput])

  useEffect(() => {
    const t = setTimeout(() => setRowProductSearchDebounced(rowProductSearchInput), 300)
    return () => clearTimeout(t)
  }, [rowProductSearchInput])

  useEffect(() => {
    if (!addRowFormOpen || !addRowProductDebounced.trim()) {
      setAddRowProductResults([])
      return
    }
    const params = new URLSearchParams({ search: addRowProductDebounced, limit: '10' })
    if (productTypeFilter !== '') params.set('filter_type_id', String(productTypeFilter))
    if (teklifPriceTypeId > 0) params.set('price_type_id', String(teklifPriceTypeId))
    fetch(`${API_URL}/api/products?${params}`)
      .then((r) => r.json())
      .then((json: { data?: Product[] }) => setAddRowProductResults(json.data || []))
      .catch(() => setAddRowProductResults([]))
  }, [addRowFormOpen, addRowProductDebounced, productTypeFilter, teklifPriceTypeId])

  useEffect(() => {
    if (addRowFormOpen || activeProductSearchRow == null || !rowProductSearchDebounced.trim()) {
      setRowProductResults([])
      return
    }
    const params = new URLSearchParams({ search: rowProductSearchDebounced, limit: '10' })
    if (productTypeFilter !== '') params.set('filter_type_id', String(productTypeFilter))
    if (teklifPriceTypeId > 0) params.set('price_type_id', String(teklifPriceTypeId))
    fetch(`${API_URL}/api/products?${params}`)
      .then((r) => r.json())
      .then((json: { data?: Product[] }) => setRowProductResults(json.data || []))
      .catch(() => setRowProductResults([]))
  }, [addRowFormOpen, activeProductSearchRow, rowProductSearchDebounced, productTypeFilter, teklifPriceTypeId])

  useEffect(() => {
    setCustomerSearchHighlightIndex(0)
  }, [customerSearchResults])

  useEffect(() => {
    if (customerEditMode) {
      const t = setTimeout(() => customerInputRef.current?.focus(), 100)
      return () => clearTimeout(t)
    }
  }, [customerEditMode])

  const customerSearchHighlightRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    customerSearchHighlightRef.current?.scrollIntoView({ block: 'nearest' })
  }, [customerSearchHighlightIndex])

  useEffect(() => { setRowProductSearchHighlightIndex(0) }, [rowProductResults])
  useEffect(() => { setAddRowProductHighlightIndex(0) }, [addRowProductResults])

  useEffect(() => {
    const t = setTimeout(() => setExternalSearchDebounced(externalSearchInput), 350)
    return () => clearTimeout(t)
  }, [externalSearchInput])

  const fetchExternalCustomerSearch = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed || trimmed.length < 2) {
      setExternalSearchResults([])
      return
    }
    setExternalSearchLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/customers/search-external?q=${encodeURIComponent(trimmed)}&limit=10`)
      const json = await parseJsonResponse<{ data?: { source: string; id: string; title: string; tax_no?: string; tax_office?: string; email?: string; phone?: string; code?: string }[] }>(res)
      setExternalSearchResults(json.data || [])
    } catch {
      setExternalSearchResults([])
    } finally {
      setExternalSearchLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!newCustomerModalOpen || newCustomerSearchStep !== 'search') return
    if (externalSearchDebounced.length >= 2) {
      fetchExternalCustomerSearch(externalSearchDebounced)
    } else {
      setExternalSearchResults([])
    }
  }, [newCustomerModalOpen, newCustomerSearchStep, externalSearchDebounced, fetchExternalCustomerSearch])

  const rowProductHighlightRef = useRef<HTMLDivElement>(null)
  const addRowProductHighlightRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    rowProductHighlightRef.current?.scrollIntoView({ block: 'nearest' })
  }, [rowProductSearchHighlightIndex])
  useEffect(() => {
    addRowProductHighlightRef.current?.scrollIntoView({ block: 'nearest' })
  }, [addRowProductHighlightIndex])

  useEffect(() => {
    if (focusUnitPriceRow == null) return
    const t = setTimeout(() => {
      if (unitPriceFocusRef.current) {
        unitPriceFocusRef.current.focus()
        unitPriceFocusRef.current.select()
      }
      setFocusUnitPriceRow(null)
    }, 50)
    return () => clearTimeout(t)
  }, [focusUnitPriceRow])

  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/api/product-currencies?limit=50`).then((r) => r.json()),
      fetch(`${API_URL}/api/app-settings?category=parabirimleri`).then((r) => r.json()),
      fetch(`${API_URL}/api/product-tax-rates?limit=50`).then((r) => r.json()),
      fetch(`${API_URL}/api/app-settings?category=offers`).then((r) => r.json()),
    ]).then(([curRes, ratesRes, taxRes, offersRes]) => {
      const curList = (curRes?.data || []).filter((c: ProductCurrency) => c.code)
      setCurrencies(curList)
      const rates = ratesRes?.exchange_rates ? (JSON.parse(ratesRes.exchange_rates) as Record<string, number>) : {}
      const ratesObj = typeof rates === 'object' && rates ? rates : {}
      setExchangeRates(ratesObj)
      setTaxRates((taxRes?.data || []).map((t: { id: number; name: string; value: number }) => ({ id: t.id, name: t.name, value: t.value })))
      const ptId = parseInt(offersRes?.teklif_fiyat_tipi_id || '0', 10)
      setTeklifPriceTypeId(Number.isNaN(ptId) || ptId < 1 ? 0 : ptId)
      if (id === 'yeni') {
        const eur = curList.find((c: ProductCurrency) => (c.code || '').toUpperCase() === 'EUR' || (c.code || '').toUpperCase() === 'EURO')
        if (eur) {
          const rate = (ratesObj['EUR'] ?? ratesObj['EURO']) ?? 1
          const rateNum = typeof rate === 'number' && !Number.isNaN(rate) ? rate : 1
          setForm((f) => (f.currency_id === '' ? { ...f, currency_id: eur.id, exchange_rate: rateNum } : f))
        }
      }
    }).catch(() => {
      setCurrencies([])
      setExchangeRates({})
      setTaxRates([])
      setTeklifPriceTypeId(0)
    })
  }, [id])

  const openNew = useCallback(async () => {
    setEditingId(null)
    setForm({ ...emptyForm, items: [emptyItem()], date: new Date().toISOString().slice(0, 10) })
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
    lastCommittedItemsRef.current = []
    setLoading(false)
  }, [])

  const loadOffer = useCallback(async (offerId: number) => {
    setLoading(true)
    setEditingId(offerId)
    setContacts([])
    setDateEditMode(false)
    setOrderNoEditMode(false)
    setCustomerEditMode(false)
    setTotalEditMode(false)
    try {
      const res = await fetch(`${API_URL}/api/offers/${offerId}`)
      const json = await parseJsonResponse<{ error?: string; items?: unknown[]; [k: string]: unknown }>(res)
      if (!res.ok) throw new Error(json.error || 'Yüklenemedi')
      const rawItems = (json.items || []).map((i: unknown) => {
        const row = i as Record<string, unknown>
        const it = emptyItem()
        it.type = (row.type as string) === 'expense' ? 'expense' : 'product'
        it.product_id = row.product_id as number | null
        it.product_name = row.product_name as string | null
        it.product_sku = row.product_sku as string | null
        it.unit_name = row.unit_name as string | null
        it.currency_id = (row.currency_id as number) ?? null
        it.currency_symbol = (row.currency_symbol as string) || null
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
      const items = rawItems.length > 0 ? rawItems : [emptyItem()]
      let noteSelections: Record<string, number[]> = {}
      try {
        const ns = json.note_selections as string | undefined
        if (ns) noteSelections = typeof ns === 'string' ? JSON.parse(ns) : ns
      } catch { /* ignore */ }
      let includeAttachmentIds: number[] = []
      try {
        const ia = json.include_attachment_ids as string | undefined
        if (ia) includeAttachmentIds = typeof ia === 'string' ? JSON.parse(ia) : ia
        if (!Array.isArray(includeAttachmentIds)) includeAttachmentIds = []
      } catch { /* ignore */ }
      let includeTagIds: number[] = []
      let excludeTagIds: number[] = []
      try {
        const it = json.include_tag_ids as string | undefined
        if (it) includeTagIds = typeof it === 'string' ? JSON.parse(it) : it
        if (!Array.isArray(includeTagIds)) includeTagIds = []
      } catch { /* ignore */ }
      try {
        const et = json.exclude_tag_ids as string | undefined
        if (et) excludeTagIds = typeof et === 'string' ? JSON.parse(et) : et
        if (!Array.isArray(excludeTagIds)) excludeTagIds = []
      } catch { /* ignore */ }
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
        company_name: (json.company_name as string) || '',
        authorized_name: (json.authorized_name as string) || '',
        company_phone: (json.company_phone as string) || '',
        company_email: (json.company_email as string) || '',
        tax_office: (json.tax_office as string) || '',
        tax_no: (json.tax_no as string) || '',
        project_name: (json.project_name as string) || 'Tanımsız Proje',
        project_description: (json.project_description as string) || '',
        note_selections: noteSelections,
        prepared_by_name: (json.prepared_by_name as string) || '',
        prepared_by_title: (json.prepared_by_title as string) || '',
        prepared_by_phone: (json.prepared_by_phone as string) || '',
        prepared_by_email: (json.prepared_by_email as string) || '',
        include_cover_page: !!(json.include_cover_page as number),
        include_attachment_ids: includeAttachmentIds,
        include_tag_ids: includeTagIds,
        exclude_tag_ids: excludeTagIds,
        items,
      })
      if (json.customer_id) fetchContacts(json.customer_id as number)
      setCustomerInput((json.customer_title as string) || '')
      setCustomerSearchResults([])
      lastCommittedItemsRef.current = items.map((i) => ({ ...i }))
    } catch (err) {
      toastError('Yüklenemedi', err instanceof Error ? err.message : 'Teklif yüklenemedi')
      goBack()
      return
    } finally {
      setLoading(false)
    }
  }, [fetchContacts, goBack])

  useEffect(() => {
    if (id === 'yeni') {
      openNew()
    } else if (id && /^\d+$/.test(id)) {
      loadOffer(parseInt(id, 10))
    } else if (id) {
      goBack()
    }
  }, [id, openNew, loadOffer, goBack])

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
    if (newCustomerModalOpen) fetchCustomerLookups()
  }, [newCustomerModalOpen, fetchCustomerLookups])

  useEffect(() => {
    if (form.contact_id && contacts.length > 0) {
      const c = contacts.find((x) => x.id === form.contact_id)
      if (c) {
        setContactInput(`${c.full_name}${c.role ? ` (${c.role})` : ''}`)
        setForm((f) => (f.authorized_name ? f : { ...f, authorized_name: c.full_name || '' }))
      }
    }
  }, [form.contact_id, contacts])

  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/api/offer-note-categories`).then((r) => r.json()),
      fetch(`${API_URL}/api/offer-attachments`).then((r) => r.json()),
      fetch(`${API_URL}/api/offer-tags`).then((r) => r.json()),
    ]).then(([catRes, attRes, tagsRes]) => {
      const cats = catRes.data || []
      setOfferNoteCategories(cats)
      setOfferAttachments(attRes.data || [])
      setOfferTags(tagsRes.data || [])
      if (id === 'yeni' && Object.keys(form.note_selections || {}).length === 0) {
        const defaults: Record<string, number[]> = {}
        for (const cat of cats) {
          const opts = (cat.options || []).filter((o: { enabled_by_default?: number }) => o.enabled_by_default)
          if (opts.length) defaults[String(cat.id)] = opts.map((o: { id: number }) => o.id)
        }
        if (Object.keys(defaults).length) setForm((f) => ({ ...f, note_selections: defaults }))
      }
    }).catch(() => {})
  }, [id])

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
        company_name: form.company_name?.trim() || undefined,
        authorized_name: form.authorized_name?.trim() || undefined,
        company_phone: form.company_phone?.trim() || undefined,
        company_email: form.company_email?.trim() || undefined,
        tax_office: form.tax_office?.trim() || undefined,
        tax_no: form.tax_no?.trim() || undefined,
        project_name: form.project_name?.trim() || 'Tanımsız Proje',
        project_description: form.project_description?.trim() || undefined,
        note_selections: Object.keys(form.note_selections || {}).length ? JSON.stringify(form.note_selections) : undefined,
        prepared_by_name: form.prepared_by_name?.trim() || undefined,
        prepared_by_title: form.prepared_by_title?.trim() || undefined,
        prepared_by_phone: form.prepared_by_phone?.trim() || undefined,
        prepared_by_email: form.prepared_by_email?.trim() || undefined,
        include_cover_page: form.include_cover_page ? 1 : 0,
        include_attachment_ids: (form.include_attachment_ids?.length ? JSON.stringify(form.include_attachment_ids) : undefined) as string | undefined,
        include_tag_ids: (form.include_tag_ids?.length ? JSON.stringify(form.include_tag_ids) : undefined) as string | undefined,
        exclude_tag_ids: (form.exclude_tag_ids?.length ? JSON.stringify(form.exclude_tag_ids) : undefined) as string | undefined,
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
      toastSuccess(editingId ? 'Teklif güncellendi' : 'Teklif eklendi')
      navigate('/teklifler')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi')
      toastError('Kaydetme hatası', err instanceof Error ? err.message : 'Kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  function openDeleteConfirm(offerId: number, onSuccess?: () => void) {
    setDeleteConfirm({ open: true, id: offerId, onSuccess })
  }

  async function executeDelete() {
    const { id: confirmId, onSuccess } = deleteConfirm
    if (!confirmId) return
    setDeleting(true)
    try {
      const res = await fetch(`${API_URL}/api/offers/${confirmId}`, { method: 'DELETE' })
      const json = await parseJsonResponse<{ error?: string }>(res)
      if (!res.ok) throw new Error(json.error || 'Silinemedi')
      toastSuccess('Teklif silindi')
      setDeleteConfirm({ open: false, id: null })
      onSuccess?.()
      navigate('/teklifler')
    } catch (err) {
      toastError('Silme hatası', err instanceof Error ? err.message : 'Silinemedi')
    } finally {
      setDeleting(false)
    }
  }

  const removeItem = (idx: number) => {
    setForm((f) => {
      if (idx < lastCommittedItemsRef.current.length) {
        lastCommittedItemsRef.current = lastCommittedItemsRef.current.filter((_, i) => i !== idx)
      }
      return { ...f, items: f.items.filter((_, i) => i !== idx) }
    })
    if (expandedRowIndex === idx) setExpandedRowIndex(null)
    else if (expandedRowIndex != null && expandedRowIndex > idx) setExpandedRowIndex(expandedRowIndex - 1)
    if (activeProductSearchRow === idx) setActiveProductSearchRow(null)
    else if (activeProductSearchRow != null && activeProductSearchRow > idx) setActiveProductSearchRow(activeProductSearchRow - 1)
    if (currencyPopoverRow === idx) setCurrencyPopoverRow(null)
    else if (currencyPopoverRow != null && currencyPopoverRow > idx) setCurrencyPopoverRow(currencyPopoverRow - 1)
  }

  const copyItem = (idx: number) => {
    setForm((f) => {
      const item = f.items[idx]
      if (!item) return f
      const copy = { ...item }
      const newItems = [...f.items]
      newItems.splice(idx + 1, 0, copy)
      return { ...f, items: newItems }
    })
    if (expandedRowIndex != null && expandedRowIndex > idx) setExpandedRowIndex(expandedRowIndex + 1)
    if (activeProductSearchRow != null && activeProductSearchRow > idx) setActiveProductSearchRow(activeProductSearchRow + 1)
    if (currencyPopoverRow != null && currencyPopoverRow > idx) setCurrencyPopoverRow(currencyPopoverRow + 1)
  }

  const moveItemUp = (idx: number) => {
    if (idx <= 0) return
    setForm((f) => {
      const newItems = [...f.items]
      ;[newItems[idx - 1], newItems[idx]] = [newItems[idx], newItems[idx - 1]]
      return { ...f, items: newItems }
    })
    setExpandedRowIndex((prev) => (prev === idx ? idx - 1 : prev === idx - 1 ? idx : prev))
    setActiveProductSearchRow((prev) => (prev === idx ? idx - 1 : prev === idx - 1 ? idx : prev))
    setCurrencyPopoverRow((prev) => (prev === idx ? idx - 1 : prev === idx - 1 ? idx : prev))
  }

  const moveItemDown = (idx: number) => {
    if (idx >= form.items.length - 1) return
    setForm((f) => {
      const newItems = [...f.items]
      ;[newItems[idx], newItems[idx + 1]] = [newItems[idx + 1], newItems[idx]]
      return { ...f, items: newItems }
    })
    setExpandedRowIndex((prev) => (prev === idx ? idx + 1 : prev === idx + 1 ? idx : prev))
    setActiveProductSearchRow((prev) => (prev === idx ? idx + 1 : prev === idx + 1 ? idx : prev))
    setCurrencyPopoverRow((prev) => (prev === idx ? idx + 1 : prev === idx + 1 ? idx : prev))
  }

  const updateItem = (idx: number, field: keyof OfferItem, value: number | string | null) => {
    setForm((f) => ({
      ...f,
      items: f.items.map((it, i) => (i === idx ? { ...it, [field]: value } : it)),
    }))
  }

  const toOffer = (amount: number, it: OfferItem) =>
    convertToOfferCurrency(amount, it.currency_id, form.currency_id, currencies, exchangeRates)
  const grossTotal = form.items.reduce((s, it) => s + toOffer(it.amount * it.unit_price, it), 0)
  const lineDiscountTotal = form.items.reduce((s, it) => s + toOffer(getItemLineDiscount(it), it), 0)
  const subtotal = grossTotal - lineDiscountTotal
  const offerDiscountPercent = form.discount_1 ?? 0
  const offerDiscountAmount = subtotal * (offerDiscountPercent / 100)
  const araToplam = subtotal - offerDiscountAmount
  const hasLineDiscount = lineDiscountTotal > 0
  const totalVat = form.items.reduce((s, it) => {
    const itemNet = toOffer(getItemRowTotal(it), it)
    const itemShare = subtotal > 0 ? itemNet / subtotal : 0
    const itemAfterDiscount = itemNet - offerDiscountAmount * itemShare
    return s + itemAfterDiscount * ((it.tax_rate ?? 0) / 100)
  }, 0)
  const grandTotal = araToplam + totalVat
  const offerCurrencySymbol = form.currency_id === '' ? '₺' : (currencies.find((c) => c.id === form.currency_id)?.symbol || currencies.find((c) => c.id === form.currency_id)?.code || '₺')
  const isTry = form.currency_id === ''

  const hasNewCustomerPending = customerInput.trim() && !form.customer_id
  const hasNewContactPending = form.customer_id && contactInput.trim() && !form.contact_id

  if (loading) {
    return (
      <PageLayout title={editingId ? 'Teklif Düzenle' : 'Yeni Teklif'} backTo="/teklifler">
        <div className="flex items-center justify-center p-8 text-muted-foreground">Yükleniyor...</div>
      </PageLayout>
    )
  }

  return (
    <PageLayout
      backTo="/teklifler"
      title={editingId ? 'Teklif Düzenle' : 'Yeni Teklif'}
    >
      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
          <CardContent className="p-6 flex flex-col gap-6">
            {error && <p className="text-sm text-destructive shrink-0 mt-1">{error}</p>}

            {/* Üst bilgiler */}
            <div className="shrink-0 border rounded-lg p-4 bg-muted/20 space-y-4">
              <div className="flex gap-4 w-full">
                <div className="flex-1 min-w-0 space-y-1.5">
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
                <div className="flex-1 min-w-0 space-y-1.5">
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
                <div className="flex-1 min-w-0 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Para Birimi / Döviz Kuru</Label>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <select
                      className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm flex-1 min-w-0"
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
                      <div className="flex">
                        <Input
                          type="text"
                          inputMode="decimal"
                          className="h-9 w-24 rounded-r-none border-r-0"
                          value={form.exchange_rate === 1 ? '' : form.exchange_rate.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                          onChange={(e) => setForm((f) => ({ ...f, exchange_rate: parseDecimal(e.target.value) ?? 1 }))}
                          placeholder="1=X ₺"
                        />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-9 w-9 shrink-0 rounded-l-none px-0"
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
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1 border-t">
                <Switch
                  id="include-cover-top"
                  checked={form.include_cover_page}
                  onCheckedChange={(c) => setForm((f) => ({ ...f, include_cover_page: !!c }))}
                />
                <Label htmlFor="include-cover-top" className="text-sm cursor-pointer">Ön sayfa ekle (PDF'de firma tanıtım sayfası gösterilir)</Label>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Müşteri</Label>
                <div className="flex items-center gap-2">
                  {(customerEditMode || !editingId) ? (
                    <div className="flex gap-2 flex-1 min-w-0">
                      <Popover open={customerSearchResults.length > 0}>
                        <PopoverAnchor asChild>
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
                              onKeyDown={(e) => {
                                if (customerSearchResults.length === 0) return
                                if (e.key === 'ArrowDown') {
                                  e.preventDefault()
                                  setCustomerSearchHighlightIndex((i) => (i + 1) % customerSearchResults.length)
                                } else if (e.key === 'ArrowUp') {
                                  e.preventDefault()
                                  setCustomerSearchHighlightIndex((i) => (i - 1 + customerSearchResults.length) % customerSearchResults.length)
                                } else if (e.key === 'Enter') {
                                  const c = customerSearchResults[customerSearchHighlightIndex]
                                  if (c) {
                                    e.preventDefault()
                                    setForm((f) => ({
                                      ...f,
                                      customer_id: c.id,
                                      contact_id: '',
                                      company_name: c.title || f.company_name,
                                      tax_office: c.tax_office || f.tax_office,
                                      tax_no: c.tax_no || f.tax_no,
                                      company_email: c.email || c.phone_mobile || f.company_email,
                                      company_phone: c.phone || c.phone_mobile || f.company_phone,
                                    }))
                                    setCustomerInput(`${c.title}${c.code ? ` (${c.code})` : ''}`)
                                    setCustomerSearchResults([])
                                    fetchContacts(c.id)
                                  }
                                }
                              }}
                              placeholder="Müşteri ara..."
                              className="h-9"
                            />
                          </div>
                        </PopoverAnchor>
                        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0 max-h-[min(12rem,var(--radix-popover-content-available-height))] overflow-y-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
                          {customerSearchResults.map((c, i) => (
                            <button
                              key={c.id}
                              ref={i === customerSearchHighlightIndex ? customerSearchHighlightRef : undefined}
                              type="button"
                              className={cn('w-full text-left px-3 py-2 text-sm', i === customerSearchHighlightIndex ? 'bg-muted' : 'hover:bg-muted/70')}
                              onMouseDown={(e) => {
                                e.preventDefault()
                                setForm((f) => ({
                                  ...f,
                                  customer_id: c.id,
                                  contact_id: '',
                                  company_name: c.title || f.company_name,
                                  tax_office: c.tax_office || f.tax_office,
                                  tax_no: c.tax_no || f.tax_no,
                                  company_email: c.email || c.phone_mobile || f.company_email,
                                  company_phone: c.phone || c.phone_mobile || f.company_phone,
                                }))
                                setCustomerInput(`${c.title}${c.code ? ` (${c.code})` : ''}`)
                                setCustomerSearchResults([])
                                fetchContacts(c.id)
                              }}
                              onMouseEnter={() => setCustomerSearchHighlightIndex(i)}
                            >
                              {c.title} {c.code ? `(${c.code})` : ''}
                            </button>
                          ))}
                        </PopoverContent>
                      </Popover>
                      <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => { setForm((f) => ({ ...f, customer_id: '', contact_id: '' })); setCustomerInput('') }}>
                        İsimsiz
                      </Button>
                    </div>
                  ) : (
                    <div className="h-9 px-3 flex items-center rounded-md border bg-muted/50 text-sm flex-1 min-w-0">{customerInput || '—'}</div>
                  )}
                  {editingId && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => setCustomerEditMode((v) => !v)}>
                          {customerEditMode ? <Save className="h-4 w-4" /> : <SquarePen className="h-4 w-4" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{customerEditMode ? 'Kaydet' : 'Düzenle'}</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>
            </div>

            {/* Firma Bilgileri, Teklif Notları, Hazırlayan, Ön Sayfa, Ekler */}
            <Collapsible open={firmaSectionOpen} onOpenChange={setFirmaSectionOpen}>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="w-full justify-between">
                  Firma Bilgileri, Teklif Notları, Hazırlayan
                  {firmaSectionOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="border rounded-lg p-4 mt-2 space-y-4 bg-muted/10">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs">Firma Adı</Label>
                      <Input value={form.company_name || ''} onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))} placeholder="Firma adı" className="h-9" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Yetkili Adı</Label>
                      <Input value={form.authorized_name || ''} onChange={(e) => setForm((f) => ({ ...f, authorized_name: e.target.value }))} placeholder="Yetkili adı" className="h-9" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Telefon</Label>
                      <Input value={form.company_phone || ''} onChange={(e) => setForm((f) => ({ ...f, company_phone: e.target.value }))} placeholder="Telefon" className="h-9" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">E-posta</Label>
                      <Input type="email" value={form.company_email || ''} onChange={(e) => setForm((f) => ({ ...f, company_email: e.target.value }))} placeholder="E-posta" className="h-9" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Vergi Dairesi</Label>
                      <Input value={form.tax_office || ''} onChange={(e) => setForm((f) => ({ ...f, tax_office: e.target.value }))} placeholder="Vergi dairesi" className="h-9" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Vergi No</Label>
                      <Input value={form.tax_no || ''} onChange={(e) => setForm((f) => ({ ...f, tax_no: e.target.value }))} placeholder="Vergi no" className="h-9" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label className="text-xs">Proje Adı</Label>
                      <Input value={form.project_name || ''} onChange={(e) => setForm((f) => ({ ...f, project_name: e.target.value }))} placeholder="Tanımsız Proje" className="h-9" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label className="text-xs">Proje Açıklaması</Label>
                      <Input value={form.project_description || ''} onChange={(e) => setForm((f) => ({ ...f, project_description: e.target.value }))} placeholder="Proje açıklaması" className="h-9" />
                    </div>
                  </div>
                  <div className="border-t pt-4">
                    <Label className="text-xs mb-2 block">Teklifi Hazırlayan</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs">Ad Soyad</Label>
                        <Input value={form.prepared_by_name || ''} onChange={(e) => setForm((f) => ({ ...f, prepared_by_name: e.target.value }))} placeholder="Ad Soyad" className="h-9" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Ünvan</Label>
                        <Input value={form.prepared_by_title || ''} onChange={(e) => setForm((f) => ({ ...f, prepared_by_title: e.target.value }))} placeholder="Ünvan" className="h-9" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Telefon</Label>
                        <Input value={form.prepared_by_phone || ''} onChange={(e) => setForm((f) => ({ ...f, prepared_by_phone: e.target.value }))} placeholder="Telefon" className="h-9" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">E-posta</Label>
                        <Input type="email" value={form.prepared_by_email || ''} onChange={(e) => setForm((f) => ({ ...f, prepared_by_email: e.target.value }))} placeholder="E-posta" className="h-9" />
                      </div>
                    </div>
                  </div>
                  <div className="border-t pt-4">
                    <Label className="text-xs mb-2 block">Teklif Notları (çıktıda gösterilecek)</Label>
                    <div className="flex flex-wrap gap-4">
                      {offerNoteCategories.map((cat) => (
                        <div key={cat.id} className="space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground">{cat.label}</p>
                          <div className="flex flex-col gap-1">
                            {(cat.options || []).map((opt) => {
                              const sel = (form.note_selections || {})[String(cat.id)] || []
                              const checked = sel.includes(opt.id)
                              return (
                                <label key={opt.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={(c) => {
                                      setForm((f) => {
                                        const prev = (f.note_selections || {})[String(cat.id)] || []
                                        const next = c ? [...prev, opt.id] : prev.filter((id) => id !== opt.id)
                                        return { ...f, note_selections: { ...(f.note_selections || {}), [String(cat.id)]: next } }
                                      })
                                    }}
                                  />
                                  {opt.label}
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="border-t pt-4">
                    <Label className="text-xs mb-2 block">Dahil olanlar / Hariç olanlar</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Dahil olanlar</p>
                        <div className="flex flex-wrap gap-1.5">
                          {offerTags.filter((t) => t.type === 'dahil').map((tag) => {
                            const selected = (form.include_tag_ids || []).includes(tag.id)
                            return (
                              <Tooltip key={tag.id}>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setForm((f) => {
                                        const prev = f.include_tag_ids || []
                                        const next = selected ? prev.filter((id) => id !== tag.id) : [...prev, tag.id]
                                        return { ...f, include_tag_ids: next }
                                      })
                                    }}
                                    className={cn(
                                      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm transition-colors',
                                      selected ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
                                    )}
                                  >
                                    <Check className="h-3 w-3" />
                                    {tag.label}
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>{tag.description || tag.label}</TooltipContent>
                              </Tooltip>
                            )
                          })}
                          {offerTags.filter((t) => t.type === 'dahil').length === 0 && (
                            <span className="text-sm text-muted-foreground">Etiket tanımlanmamış</span>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Hariç olanlar</p>
                        <div className="flex flex-wrap gap-1.5">
                          {offerTags.filter((t) => t.type === 'haric').map((tag) => {
                            const selected = (form.exclude_tag_ids || []).includes(tag.id)
                            return (
                              <Tooltip key={tag.id}>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setForm((f) => {
                                        const prev = f.exclude_tag_ids || []
                                        const next = selected ? prev.filter((id) => id !== tag.id) : [...prev, tag.id]
                                        return { ...f, exclude_tag_ids: next }
                                      })
                                    }}
                                    className={cn(
                                      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm transition-colors',
                                      selected ? 'bg-destructive text-destructive-foreground' : 'bg-muted hover:bg-muted/80'
                                    )}
                                  >
                                    <X className="h-3 w-3" />
                                    {tag.label}
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>{tag.description || tag.label}</TooltipContent>
                              </Tooltip>
                            )
                          })}
                          {offerTags.filter((t) => t.type === 'haric').length === 0 && (
                            <span className="text-sm text-muted-foreground">Etiket tanımlanmamış</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="border-t pt-4">
                    <Label className="text-xs mb-2 block">Ekler</Label>
                    <div className="flex flex-wrap gap-2">
                      {offerAttachments.map((att) => {
                        const checked = (form.include_attachment_ids || []).includes(att.id)
                        return (
                          <label key={att.id} className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(c) => {
                                setForm((f) => {
                                  const prev = f.include_attachment_ids || []
                                  const next = c ? [...prev, att.id] : prev.filter((id) => id !== att.id)
                                  return { ...f, include_attachment_ids: next }
                                })
                              }}
                            />
                            {att.title}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Teklif kalemleri */}
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-3">
              <div className="border rounded-md overflow-auto flex-1 min-h-[140px]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-2 font-medium">Ürün Adı</th>
                      <th className="text-right p-2 w-20">Miktar</th>
                      <th className="text-center p-2 w-16">Birim</th>
                      <th className="text-right p-2 w-24">Birim Fiyat</th>
                      <th className="text-right p-2 w-24">Tutar</th>
                      <th className="w-48">
                        <div className="flex items-center justify-end gap-1">
                          <span className="w-px h-4 bg-border" aria-hidden />
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button type="button" variant="outline" size="sm" className="h-8 gap-1" onClick={() => { setAddRowFormOpen(true); setAddRowDraft(emptyItem()); setAddRowProductInput(''); setAddRowProductResults([]); setAddRowExpanded(false); }}>
                                <Plus className="h-3.5 w-3.5" /> Satır ekle
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Yeni satır ekle</TooltipContent>
                          </Tooltip>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.items.map((it, idx) => (
                      <React.Fragment key={idx}>
                        <tr className="border-b">
                          <td className="p-2">
                            {!it.product_id ? (
                              <Popover open={activeProductSearchRow === idx && rowProductResults.length > 0}>
                                <PopoverAnchor asChild>
                                  <div className="relative" onFocus={() => { setActiveProductSearchRow(idx); setRowProductSearchInput(it.description || ''); }}>
                                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                      placeholder="Ürün ara veya açıklama..."
                                      value={activeProductSearchRow === idx ? rowProductSearchInput : (it.description || '')}
                                      onChange={(e) => {
                                        setActiveProductSearchRow(idx)
                                        const v = e.target.value
                                        setRowProductSearchInput(v)
                                        updateItem(idx, 'description', v || null)
                                      }}
                                      onKeyDown={(e) => {
                                        if (activeProductSearchRow !== idx || rowProductResults.length === 0) return
                                        if (e.key === 'ArrowDown') {
                                          e.preventDefault()
                                          setRowProductSearchHighlightIndex((i) => (i + 1) % rowProductResults.length)
                                        } else if (e.key === 'ArrowUp') {
                                          e.preventDefault()
                                          setRowProductSearchHighlightIndex((i) => (i - 1 + rowProductResults.length) % rowProductResults.length)
                                        } else if (e.key === 'Enter') {
                                          const p = rowProductResults[rowProductSearchHighlightIndex]
                                          if (p) {
                                            e.preventDefault()
                                            setForm((f) => {
                                              const oc = getOfferCurrencyInfo(f, currencies)
                                              const curId = p.currency_id ?? oc.currency_id
                                              const curSym = p.currency_symbol || (curId ? (currencies.find((c) => c.id === curId)?.symbol || currencies.find((c) => c.id === curId)?.code) : null) || oc.currency_symbol
                                              return {
                                                ...f,
                                                items: f.items.map((item, i) =>
                                                  i === idx ? { ...item, product_id: p.id, product_name: p.name, product_sku: p.sku || null, unit_name: p.unit_name || null, currency_id: curId, currency_symbol: curSym, unit_price: p.price, amount: 1, description: null, tax_rate: p.tax_rate ?? 0 } : item
                                                ),
                                              }
                                            })
                                            setRowProductSearchInput('')
                                            setRowProductResults([])
                                            setActiveProductSearchRow(null)
                                            setFocusUnitPriceRow(idx)
                                          }
                                        }
                                      }}
                                      onBlur={() => setTimeout(() => setActiveProductSearchRow(null), 200)}
                                      className="pl-8 h-8 text-sm"
                                    />
                                  </div>
                                </PopoverAnchor>
                                <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0 max-h-[min(16rem,var(--radix-popover-content-available-height))] overflow-y-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
                                  {groupProductsByItemGroup(rowProductResults).map((grp) => (
                                    <div key={grp.groupKey} className="border-b border-border last:border-b-0">
                                      <div
                                        className={cn('px-3 py-1.5 text-xs font-medium sticky top-0 flex items-center gap-2', !grp.groupColor && 'bg-muted/50 text-muted-foreground')}
                                        style={{
                                          ...(grp.groupColor && { backgroundColor: `${grp.groupColor}15`, borderLeft: `3px solid ${grp.groupColor}` }),
                                        }}
                                      >
                                        <span className="shrink-0 w-2.5 h-2.5 rounded-full border border-muted" style={{ backgroundColor: grp.groupColor || 'transparent' }} />
                                        {grp.groupName}
                                      </div>
                                      {grp.items.map(({ product: p, flatIndex: i }) => (
                                        <div
                                          key={p.id}
                                          ref={i === rowProductSearchHighlightIndex ? rowProductHighlightRef : undefined}
                                          className={cn('flex items-center gap-2 px-3 py-2 text-sm cursor-pointer', i === rowProductSearchHighlightIndex ? 'bg-muted' : 'hover:bg-muted/70')}
                                          onMouseDown={(e) => {
                                            e.preventDefault()
                                            setForm((f) => {
                                              const oc = getOfferCurrencyInfo(f, currencies)
                                              const curId = p.currency_id ?? oc.currency_id
                                              const curSym = p.currency_symbol || (curId ? (currencies.find((c) => c.id === curId)?.symbol || currencies.find((c) => c.id === curId)?.code) : null) || oc.currency_symbol
                                              return {
                                                ...f,
                                                items: f.items.map((item, ii) =>
                                                  ii === idx ? { ...item, product_id: p.id, product_name: p.name, product_sku: p.sku || null, unit_name: p.unit_name || null, currency_id: curId, currency_symbol: curSym, unit_price: p.price, amount: 1, description: null, tax_rate: p.tax_rate ?? 0 } : item
                                                ),
                                              }
                                            })
                                            setRowProductSearchInput('')
                                            setRowProductResults([])
                                            setActiveProductSearchRow(null)
                                            setFocusUnitPriceRow(idx)
                                          }}
                                          onMouseEnter={() => setRowProductSearchHighlightIndex(i)}
                                        >
                                          <span
                                            className="shrink-0 w-2.5 h-2.5 rounded-full border border-muted"
                                            style={{ backgroundColor: grp.groupColor || 'transparent' }}
                                          />
                                          <span className="min-w-0 truncate">
                                            {p.name} {p.sku ? `(${p.sku})` : ''} — {formatPrice(p.price)} {p.currency_symbol || '₺'}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  ))}
                                </PopoverContent>
                              </Popover>
                            ) : (
                              <span className="font-medium">{it.product_name || it.product_sku || it.description || '—'}</span>
                            )}
                          </td>
                          <td className="p-2">
                            <DecimalInput className="h-8 w-full min-w-14 text-right" value={it.amount} onChange={(n) => updateItem(idx, 'amount', n || 0)} placeholder="0" />
                          </td>
                          <td className="p-2 text-center text-muted-foreground text-sm">{it.unit_name || 'Adet'}</td>
                          <td className="p-2">
                            <div className="relative">
                              <DecimalInput
                                ref={idx === focusUnitPriceRow ? unitPriceFocusRef : undefined}
                                className="h-8 w-full min-w-20 text-right pr-8"
                                value={it.unit_price}
                                onChange={(n) => updateItem(idx, 'unit_price', n ?? 0)}
                                placeholder="0,00"
                                maxDecimals={2}
                              />
                              <Popover open={currencyPopoverRow === idx} onOpenChange={(open) => setCurrencyPopoverRow(open ? idx : null)}>
                                <PopoverAnchor asChild>
                                  <button
                                    type="button"
                                    title="Para birimini değiştir"
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm hover:text-foreground cursor-pointer min-w-[1.5rem] text-right"
                                  >
                                    {it.currency_symbol || '₺'}
                                  </button>
                                </PopoverAnchor>
                                <PopoverContent align="end" className="w-36 p-2">
                                  <div className="space-y-1.5">
                                    <p className="text-xs font-medium text-muted-foreground px-1">Para birimi</p>
                                    <select
                                      className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                                      value={it.currency_id ?? ''}
                                      onChange={(e) => {
                                        const val = e.target.value === '' ? null : Number(e.target.value)
                                        const cur = val ? currencies.find((c) => c.id === val) : null
                                        const symbol = cur?.symbol || cur?.code || (val ? null : '₺')
                                        const oldId = it.currency_id
                                        const newUnitPrice = convertBetweenCurrencies(it.unit_price, oldId, val, currencies, exchangeRates)
                                        const newDiscountValue = it.discount_type === 'fixed' && it.discount_value != null
                                          ? convertBetweenCurrencies(it.discount_value, oldId, val, currencies, exchangeRates)
                                          : it.discount_value
                                        setForm((f) => ({
                                          ...f,
                                          items: f.items.map((item, i) =>
                                            i === idx
                                              ? { ...item, currency_id: val, currency_symbol: symbol, unit_price: newUnitPrice, discount_value: newDiscountValue }
                                              : item
                                          ),
                                        }))
                                        setCurrencyPopoverRow(null)
                                      }}
                                    >
                                      <option value="">TRY (₺)</option>
                                      {currencies.filter((c) => (c.code || '').toUpperCase() !== 'TRY' && (c.code || '').toUpperCase() !== 'TL').map((c) => (
                                        <option key={c.id} value={c.id}>{c.name} ({c.symbol || c.code})</option>
                                      ))}
                                    </select>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            </div>
                          </td>
                          <td className="p-2 text-right font-medium tabular-nums">{formatPrice(getItemRowTotal(it))} {it.currency_symbol || '₺'}</td>
                          <td className="p-2">
                            <div className="flex items-center justify-end gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => copyItem(idx)}>
                                    <Copy className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Satırı kopyala</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => moveItemUp(idx)} disabled={idx === 0}>
                                    <ArrowUp className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Yukarı taşı</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => moveItemDown(idx)} disabled={idx === form.items.length - 1}>
                                    <ArrowDown className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Aşağı taşı</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => setExpandedRowIndex(expandedRowIndex === idx ? null : idx)}>
                                    {expandedRowIndex === idx ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{expandedRowIndex === idx ? 'Detayları kapat' : 'KDV, İskonto, Satır notu'}</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button type="button" variant="outline" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeItem(idx)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Satırı sil</TooltipContent>
                              </Tooltip>
                            </div>
                          </td>
                        </tr>
                        {expandedRowIndex === idx && (
                          <tr className="border-b bg-muted/20">
                            <td colSpan={6} className="p-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="space-y-2">
                                  <Label className="text-xs">Para Birimi</Label>
                                  <select
                                    className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                                    value={it.currency_id ?? ''}
                                    onChange={(e) => {
                                      const val = e.target.value === '' ? null : Number(e.target.value)
                                      const cur = val ? currencies.find((c) => c.id === val) : null
                                      const symbol = cur?.symbol || cur?.code || (val ? null : '₺')
                                      const oldId = it.currency_id
                                      const newUnitPrice = convertBetweenCurrencies(it.unit_price, oldId, val, currencies, exchangeRates)
                                      const newDiscountValue = it.discount_type === 'fixed' && it.discount_value != null
                                        ? convertBetweenCurrencies(it.discount_value, oldId, val, currencies, exchangeRates)
                                        : it.discount_value
                                      setForm((f) => ({
                                        ...f,
                                        items: f.items.map((item, i) =>
                                          i === idx
                                            ? { ...item, currency_id: val, currency_symbol: symbol, unit_price: newUnitPrice, discount_value: newDiscountValue }
                                            : item
                                        ),
                                      }))
                                    }}
                                  >
                                    <option value="">TRY (₺)</option>
                                    {currencies.filter((c) => (c.code || '').toUpperCase() !== 'TRY' && (c.code || '').toUpperCase() !== 'TL').map((c) => (
                                      <option key={c.id} value={c.id}>{c.name} ({c.symbol || c.code})</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-xs">KDV (%)</Label>
                                  <select
                                    className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                                    value={it.tax_rate != null ? String(it.tax_rate) : ''}
                                    onChange={(e) => updateItem(idx, 'tax_rate', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                                  >
                                    <option value="">Seçin</option>
                                    {taxRates.map((tr) => (
                                      <option key={tr.id} value={String(tr.value)}>{tr.name} ({tr.value}%)</option>
                                    ))}
                                    {it.tax_rate != null && !taxRates.some((tr) => tr.value === it.tax_rate) && (
                                      <option value={String(it.tax_rate)}>{it.tax_rate}%</option>
                                    )}
                                  </select>
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-xs">İskonto</Label>
                                  <div className="flex items-center gap-2">
                                    <select className="h-8 rounded-md border border-input bg-transparent px-2 text-sm w-24 shrink-0" value={it.discount_type ?? ''} onChange={(e) => updateItem(idx, 'discount_type', e.target.value === '' ? null : (e.target.value as 'percent' | 'fixed'))}>
                                      <option value="">—</option>
                                      <option value="percent">Yüzde</option>
                                      <option value="fixed">Sabit</option>
                                    </select>
                                    <div className="relative flex-1 min-w-0">
                                      <DecimalInput className="h-8 text-right pr-8" value={it.discount_value ?? 0} onChange={(n) => updateItem(idx, 'discount_value', n ?? 0)} placeholder="0" maxDecimals={2} />
                                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{it.discount_type === 'percent' ? '%' : it.discount_type === 'fixed' ? (it.currency_symbol || '₺') : ''}</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="space-y-2 sm:col-span-1">
                                  <Label className="text-xs">Satır notu</Label>
                                  <Input className="h-8 text-sm" value={it.description || ''} onChange={(e) => updateItem(idx, 'description', e.target.value)} placeholder="Satır notu" />
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                    {addRowFormOpen && (
                      <tr className="border-b bg-muted/20">
                        <td className="p-2">
                          <Popover open={addRowProductResults.length > 0}>
                            <PopoverAnchor asChild>
                              <div className="relative">
                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                  placeholder="Ürün ara veya açıklama..."
                                  value={addRowProductInput || addRowDraft.product_name || addRowDraft.description || ''}
                                  onChange={(e) => {
                                    const v = e.target.value
                                    setAddRowProductInput(v)
                                    setAddRowDraft((d) => ({ ...d, description: v || null, ...(v ? { product_id: null, product_name: null, product_sku: null } : {}) }))
                                  }}
                                  onKeyDown={(e) => {
                                    if (addRowProductResults.length === 0) return
                                    if (e.key === 'ArrowDown') {
                                      e.preventDefault()
                                      setAddRowProductHighlightIndex((i) => (i + 1) % addRowProductResults.length)
                                    } else if (e.key === 'ArrowUp') {
                                      e.preventDefault()
                                      setAddRowProductHighlightIndex((i) => (i - 1 + addRowProductResults.length) % addRowProductResults.length)
                                    } else if (e.key === 'Enter') {
                                      const p = addRowProductResults[addRowProductHighlightIndex]
                                      if (p) {
                                        e.preventDefault()
                                        setForm((f) => {
                                          const oc = getOfferCurrencyInfo(f, currencies)
                                          const curId = p.currency_id ?? oc.currency_id
                                          const curSym = p.currency_symbol || (curId ? (currencies.find((c) => c.id === curId)?.symbol || currencies.find((c) => c.id === curId)?.code) : null) || oc.currency_symbol
                                          const newItem: OfferItem = { ...emptyItem(), product_id: p.id, product_name: p.name, product_sku: p.sku || null, unit_name: p.unit_name || null, currency_id: curId, currency_symbol: curSym, unit_price: p.price, amount: 1, tax_rate: p.tax_rate ?? 0 }
                                          const newIdx = f.items.length
                                          queueMicrotask(() => setFocusUnitPriceRow(newIdx))
                                          return { ...f, items: [...f.items, newItem] }
                                        })
                                        setAddRowDraft(emptyItem())
                                        setAddRowProductInput('')
                                        setAddRowProductResults([])
                                        setAddRowExpanded(false)
                                      } else if (addRowDraft.product_id || addRowDraft.description) {
                                        e.preventDefault()
                                        const name = addRowDraft.product_name || addRowDraft.description || 'Yeni satır'
                                        const newItem = { ...addRowDraft, product_name: addRowDraft.product_name || name, description: addRowDraft.description || (addRowDraft.product_id ? null : name) }
                                        setForm((f) => ({ ...f, items: [...f.items, newItem] }))
                                        setAddRowDraft(emptyItem())
                                        setAddRowProductInput('')
                                        setAddRowProductResults([])
                                        setAddRowExpanded(false)
                                      }
                                    }
                                  }}
                                  className="pl-8 h-8 text-sm"
                                />
                              </div>
                            </PopoverAnchor>
                            <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0 max-h-[min(16rem,var(--radix-popover-content-available-height))] overflow-y-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
                              {groupProductsByItemGroup(addRowProductResults).map((grp) => (
                                <div key={grp.groupKey} className="border-b border-border last:border-b-0">
                                  <div
                                    className={cn('px-3 py-1.5 text-xs font-medium sticky top-0 flex items-center gap-2', !grp.groupColor && 'bg-muted/50 text-muted-foreground')}
                                    style={{
                                      ...(grp.groupColor && { backgroundColor: `${grp.groupColor}15`, borderLeft: `3px solid ${grp.groupColor}` }),
                                    }}
                                  >
                                    <span className="shrink-0 w-2.5 h-2.5 rounded-full border border-muted" style={{ backgroundColor: grp.groupColor || 'transparent' }} />
                                    {grp.groupName}
                                  </div>
                                  {grp.items.map(({ product: p, flatIndex: i }) => (
                                    <div
                                      key={p.id}
                                      ref={i === addRowProductHighlightIndex ? addRowProductHighlightRef : undefined}
                                      className={cn('flex items-center gap-2 px-3 py-2 text-sm cursor-pointer', i === addRowProductHighlightIndex ? 'bg-muted' : 'hover:bg-muted/70')}
                                      onMouseDown={(e) => {
                                        e.preventDefault()
                                        setForm((f) => {
                                          const oc = getOfferCurrencyInfo(f, currencies)
                                          const curId = p.currency_id ?? oc.currency_id
                                          const curSym = p.currency_symbol || (curId ? (currencies.find((c) => c.id === curId)?.symbol || currencies.find((c) => c.id === curId)?.code) : null) || oc.currency_symbol
                                          const newItem: OfferItem = { ...emptyItem(), product_id: p.id, product_name: p.name, product_sku: p.sku || null, unit_name: p.unit_name || null, currency_id: curId, currency_symbol: curSym, unit_price: p.price, amount: 1, tax_rate: p.tax_rate ?? 0 }
                                          const newIdx = f.items.length
                                          queueMicrotask(() => setFocusUnitPriceRow(newIdx))
                                          return { ...f, items: [...f.items, newItem] }
                                        })
                                        setAddRowDraft(emptyItem())
                                        setAddRowProductInput('')
                                        setAddRowProductResults([])
                                        setAddRowExpanded(false)
                                      }}
                                      onMouseEnter={() => setAddRowProductHighlightIndex(i)}
                                    >
                                      <span
                                        className="shrink-0 w-2.5 h-2.5 rounded-full border border-muted"
                                        style={{ backgroundColor: grp.groupColor || 'transparent' }}
                                      />
                                      <span className="min-w-0 truncate">
                                        {p.name} {p.sku ? `(${p.sku})` : ''} — {formatPrice(p.price)} {p.currency_symbol || '₺'}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </PopoverContent>
                          </Popover>
                        </td>
                        <td className="p-2">
                          <DecimalInput className="h-8 w-full min-w-14 text-right" value={addRowDraft.amount} onChange={(n) => setAddRowDraft((d) => ({ ...d, amount: n || 0 }))} placeholder="1" />
                        </td>
                        <td className="p-2 text-center text-muted-foreground text-sm">{addRowDraft.unit_name || 'Adet'}</td>
                        <td className="p-2">
                          <div className="relative">
                            <DecimalInput className="h-8 w-full min-w-20 text-right pr-8" value={addRowDraft.unit_price} onChange={(n) => setAddRowDraft((d) => ({ ...d, unit_price: n ?? 0 }))} placeholder="0,00" maxDecimals={2} />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{addRowDraft.currency_symbol || '₺'}</span>
                          </div>
                        </td>
                        <td className="p-2 text-right font-medium tabular-nums">{formatPrice(getItemRowTotal(addRowDraft))} {addRowDraft.currency_symbol || '₺'}</td>
                        <td className="p-2">
                          <div className="flex items-center justify-end gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => setAddRowExpanded((v) => !v)}>
                                  {addRowExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{addRowExpanded ? 'Detayları kapat' : 'KDV, İskonto, Satır notu'}</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button type="button" variant="outline" size="icon" className="h-8 w-8 text-destructive" onClick={() => { setAddRowFormOpen(false); setAddRowDraft(emptyItem()); setAddRowProductInput(''); setAddRowProductResults([]); setAddRowExpanded(false); }}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Satırı sil</TooltipContent>
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                    )}
                    {addRowFormOpen && addRowExpanded && (
                      <tr className="border-b bg-muted/20">
                        <td colSpan={6} className="p-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="space-y-2">
                              <Label className="text-xs">Para Birimi</Label>
                              <select
                                className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                                value={addRowDraft.currency_id ?? ''}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? null : Number(e.target.value)
                                  const cur = val ? currencies.find((c) => c.id === val) : null
                                  const symbol = cur?.symbol || cur?.code || (val ? null : '₺')
                                  const oldId = addRowDraft.currency_id
                                  const newUnitPrice = convertBetweenCurrencies(addRowDraft.unit_price, oldId, val, currencies, exchangeRates)
                                  const newDiscountValue = addRowDraft.discount_type === 'fixed' && addRowDraft.discount_value != null
                                    ? convertBetweenCurrencies(addRowDraft.discount_value, oldId, val, currencies, exchangeRates)
                                    : addRowDraft.discount_value
                                  setAddRowDraft((d) => ({ ...d, currency_id: val, currency_symbol: symbol, unit_price: newUnitPrice, discount_value: newDiscountValue }))
                                }}
                              >
                                <option value="">TRY (₺)</option>
                                {currencies.filter((c) => (c.code || '').toUpperCase() !== 'TRY' && (c.code || '').toUpperCase() !== 'TL').map((c) => (
                                  <option key={c.id} value={c.id}>{c.name} ({c.symbol || c.code})</option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs">KDV (%)</Label>
                              <select
                                className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                                value={addRowDraft.tax_rate != null ? String(addRowDraft.tax_rate) : ''}
                                onChange={(e) => setAddRowDraft((d) => ({ ...d, tax_rate: e.target.value === '' ? 0 : parseFloat(e.target.value) }))}
                              >
                                <option value="">Seçin</option>
                                {taxRates.map((tr) => (
                                  <option key={tr.id} value={String(tr.value)}>{tr.name} ({tr.value}%)</option>
                                ))}
                                {addRowDraft.tax_rate != null && !taxRates.some((tr) => tr.value === addRowDraft.tax_rate) && (
                                  <option value={String(addRowDraft.tax_rate)}>{addRowDraft.tax_rate}%</option>
                                )}
                              </select>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs">İskonto</Label>
                              <div className="flex items-center gap-2">
                                <select className="h-8 rounded-md border border-input bg-transparent px-2 text-sm w-24 shrink-0" value={addRowDraft.discount_type ?? ''} onChange={(e) => setAddRowDraft((d) => ({ ...d, discount_type: e.target.value === '' ? null : (e.target.value as 'percent' | 'fixed') }))}>
                                  <option value="">—</option>
                                  <option value="percent">Yüzde</option>
                                  <option value="fixed">Sabit</option>
                                </select>
                                <div className="relative flex-1 min-w-0">
                                  <DecimalInput className="h-8 text-right pr-8" value={addRowDraft.discount_value ?? 0} onChange={(n) => setAddRowDraft((d) => ({ ...d, discount_value: n ?? 0 }))} placeholder="0" maxDecimals={2} />
                                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{addRowDraft.discount_type === 'percent' ? '%' : addRowDraft.discount_type === 'fixed' ? (addRowDraft.currency_symbol || '₺') : ''}</span>
                                </div>
                              </div>
                            </div>
                            <div className="space-y-2 sm:col-span-1">
                              <Label className="text-xs">Satır notu</Label>
                              <Input className="h-8 text-sm" value={addRowDraft.description || ''} onChange={(e) => setAddRowDraft((d) => ({ ...d, description: e.target.value || null }))} placeholder="Satır notu" />
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Toplamlar */}
              <div className="shrink-0 border rounded-lg p-4 bg-muted/10 space-y-2 max-w-xs ml-auto">
                {hasLineDiscount ? (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Toplam</span>
                      <span className="font-medium tabular-nums">{formatPrice(grossTotal)} {offerCurrencySymbol}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">İskonto</span>
                      <span className="font-medium tabular-nums text-destructive">-{formatPrice(lineDiscountTotal)} {offerCurrencySymbol}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Ara Toplam</span>
                      <span className="font-medium tabular-nums">{formatPrice(subtotal)} {offerCurrencySymbol}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Toplam</span>
                    <span className="font-medium tabular-nums">{formatPrice(subtotal)} {offerCurrencySymbol}</span>
                  </div>
                )}
                {(offerDiscountPercent > 0 || totalEditMode) && (
                  <>
                    <div className="flex justify-between text-sm items-center gap-2">
                      <span className="text-muted-foreground">İskonto (Yüzde)</span>
                      {totalEditMode ? (
                        <div className="flex items-center gap-1">
                          <Input type="text" inputMode="decimal" className="h-8 w-16 text-right" value={offerDiscountPercent === 0 ? '' : String(offerDiscountPercent)} onChange={(e) => setForm((f) => ({ ...f, discount_1: parseDecimal(e.target.value) ?? 0 }))} placeholder="0" />
                          <span className="text-muted-foreground">%</span>
                        </div>
                      ) : (
                        <span className="font-medium tabular-nums">%{offerDiscountPercent}</span>
                      )}
                    </div>
                    {offerDiscountPercent > 0 && (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">İskonto Miktarı</span>
                          <span className="font-medium tabular-nums text-destructive">-{formatPrice(offerDiscountAmount)} {offerCurrencySymbol}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Ara Toplam</span>
                          <span className="font-medium tabular-nums">{formatPrice(araToplam)} {offerCurrencySymbol}</span>
                        </div>
                      </>
                    )}
                  </>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">K.D.V.</span>
                  <span className="font-medium tabular-nums">{formatPrice(totalVat)} {offerCurrencySymbol}</span>
                </div>
                <div className="flex justify-between text-sm pt-2 border-t">
                  <span className="font-bold text-destructive">Genel Toplam</span>
                  {totalEditMode ? (
                    <div className="flex items-center gap-1">
                      <Input type="text" inputMode="decimal" className="h-8 w-28 text-right font-medium" value={grandTotal === 0 ? '' : grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} onChange={(e) => {
                        const v = parseDecimal(e.target.value)
                        if (v != null && subtotal > 0) {
                          const pct = Math.max(0, Math.min(100, (1 - (v - totalVat) / subtotal) * 100))
                          setForm((f) => ({ ...f, discount_1: pct }))
                        }
                      }} placeholder="0,00" />
                      <span>{offerCurrencySymbol}</span>
                    </div>
                  ) : (
                    <span className="font-bold text-destructive tabular-nums">{formatPrice(grandTotal)} {offerCurrencySymbol}</span>
                  )}
                </div>
                {!isTry && (
                  <div className="flex justify-between text-xs pt-1 text-muted-foreground">
                    <span>Yaklaşık TL karşılığı</span>
                    <span className="tabular-nums">≈ {formatPrice(grandTotal * (form.exchange_rate || 1))} ₺</span>
                  </div>
                )}
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

            <div className="sticky bottom-0 flex flex-row justify-between items-center border-t border-border bg-muted/30 p-4 pt-4 -mx-6 px-6 pb-6">
              <div className="flex items-center gap-2">
                {editingId && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button type="button" variant="outline" size="icon" className="text-destructive" onClick={() => openDeleteConfirm(editingId!, goBack)} disabled={saving}>
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
                      setExternalSearchInput(customerInput.trim())
                      setNewCustomerForm({ title: customerInput.trim(), email: '', phone: '', tax_no: '', tax_office: '', group_id: '', type_id: '', legal_type_id: '' })
                      setNewCustomerSearchStep('search')
                      setNewCustomerModalOpen(true)
                    } else if (hasNewContactPending) {
                      setNewContactForm({ full_name: contactInput.trim(), phone: '', role: '' })
                      setNewContactModalOpen(true)
                    }
                  }}>
                    Yeni {hasNewCustomerPending ? 'müşteri' : 'iletişim'} oluştur
                  </Button>
                )}
                {editingId && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => window.open(`${API_URL}/api/offers/${editingId}/pdf`, '_blank', 'noopener')}
                  >
                    <FileDown className="h-4 w-4 mr-2" />
                    PDF
                  </Button>
                )}
                <Button type="submit" disabled={saving || !form.date || !form.order_no?.trim()}>
                  {saving ? 'Kaydediliyor...' : 'Kaydet'}
                </Button>
              </div>
            </div>
          </CardContent>
        </form>
      </Card>

      <ConfirmDeleteDialog
        open={deleteConfirm.open}
        onOpenChange={(o) => setDeleteConfirm((p) => ({ ...p, open: o }))}
        description="Bu teklifi silmek istediğinize emin misiniz?"
        onConfirm={executeDelete}
        loading={deleting}
      />

      <Dialog open={newCustomerModalOpen} onOpenChange={(open) => {
        if (!open) {
          setNewCustomerModalOpen(false)
          setNewCustomerSearchStep('search')
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Yeni müşteri</DialogTitle>
            <DialogDescription>
              {newCustomerSearchStep === 'search'
                ? 'DIA ve Paraşüt\'ten ara veya manuel giriş yapın.'
                : 'Müşteri bilgilerini kontrol edip kaydedin.'}
            </DialogDescription>
          </DialogHeader>
          {newCustomerSearchStep === 'search' ? (
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Ara (DIA, Paraşüt)</Label>
                <Input
                  value={externalSearchInput}
                  onChange={(e) => setExternalSearchInput(e.target.value)}
                  placeholder="Firma adı, vergi no, e-posta..."
                  className="h-9"
                  autoFocus
                />
              </div>
              {externalSearchLoading && (
                <p className="text-sm text-muted-foreground">Aranıyor...</p>
              )}
              {externalSearchResults.length > 0 && (
                <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto border rounded-md p-2">
                  {externalSearchResults.map((r) => (
                    <button
                      key={`${r.source}-${r.id}`}
                      type="button"
                      className="flex items-center justify-between gap-2 p-2 text-left text-sm rounded hover:bg-muted"
                      onClick={() => {
                        setNewCustomerForm({
                          title: r.title,
                          email: r.email || '',
                          phone: r.phone || '',
                          tax_no: r.tax_no || '',
                          tax_office: r.tax_office || '',
                          group_id: '',
                          type_id: '',
                          legal_type_id: '',
                        })
                        setNewCustomerSearchStep('form')
                      }}
                    >
                      <span className="min-w-0 truncate">{r.title} {r.tax_no ? `(${r.tax_no})` : ''}</span>
                      <span className={cn('shrink-0 text-xs px-1.5 py-0.5 rounded', r.source === 'dia' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300')}>
                        {r.source === 'dia' ? 'DIA' : 'Paraşüt'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {externalSearchDebounced.length >= 2 && !externalSearchLoading && externalSearchResults.length === 0 && (
                <p className="text-sm text-muted-foreground">Sonuç bulunamadı.</p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setNewCustomerModalOpen(false)}>
                  İptal
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    const title = externalSearchInput.trim() || newCustomerForm.title
                    setNewCustomerForm((f) => ({ ...f, title: title || f.title }))
                    setNewCustomerSearchStep('form')
                  }}
                >
                  Manuel giriş
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="grid gap-4 py-4">
              <Button type="button" variant="ghost" size="sm" className="w-fit -mt-2 -ml-2" onClick={() => setNewCustomerSearchStep('search')}>
                ← Aramaya dön
              </Button>
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
                  <Label htmlFor="new_customer_tax_no">Vergi No</Label>
                  <Input
                    id="new_customer_tax_no"
                    value={newCustomerForm.tax_no}
                    onChange={(e) => setNewCustomerForm((f) => ({ ...f, tax_no: e.target.value }))}
                    placeholder="Vergi numarası"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new_customer_tax_office">Vergi Dairesi</Label>
                  <Input
                    id="new_customer_tax_office"
                    value={newCustomerForm.tax_office}
                    onChange={(e) => setNewCustomerForm((f) => ({ ...f, tax_office: e.target.value }))}
                    placeholder="Vergi dairesi"
                  />
                </div>
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
            </div>
          )}
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
                    setForm((f) => ({
                      ...f,
                      customer_id: c.id,
                      contact_id: '',
                      company_name: c.title || f.company_name,
                      tax_office: c.tax_office || f.tax_office,
                      tax_no: c.tax_no || f.tax_no,
                      company_email: c.email || c.phone_mobile || f.company_email,
                      company_phone: c.phone || c.phone_mobile || f.company_phone,
                    }))
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
                setExternalSearchInput(customerInput.trim())
                setNewCustomerForm({ title: customerInput.trim(), email: '', phone: '', tax_no: '', tax_office: '', group_id: '', type_id: '', legal_type_id: '' })
                setNewCustomerSearchStep('search')
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
