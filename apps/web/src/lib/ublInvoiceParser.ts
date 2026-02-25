/**
 * UBL-TR e-fatura XML üst bilgisi parser
 * Fatura numarası, tarih, satıcı, alıcı, toplam tutar çıkarır
 */

import { Xslt, XmlParser } from 'xslt-processor'

/** Native XSLTProcessor hâlâ mevcut tarayıcılarda gelen/giden için çalışıyor; xslt-processor fallback */
const HAS_NATIVE_XSLT = typeof XSLTProcessor !== 'undefined'

/** Fatura tipi: gelen e-fatura, giden e-fatura, giden e-arşiv */
export type InvoiceType = 'gelen' | 'giden' | 'earsiv'

export interface InvoiceHeaderInfo {
  fileName: string
  invoiceId?: string
  issueDate?: string
  currency?: string
  supplierName?: string
  supplierId?: string
  customerName?: string
  customerId?: string
  payableAmount?: string
  taxValue?: string
  taxRate?: string
  uuid?: string
  rawError?: string
  /** Fatura tipi: alıcı/satıcı VKN ve ProfileID'ye göre belirlenir */
  invoiceType?: InvoiceType
}

/** Şirket VKN - alıcı VKN eşleşirse gelen, satıcı VKN eşleşirse giden */
const COMPANY_VKN = '4620132726'

function normalizeVkn(v?: string): string {
  return (v ?? '').replace(/\s/g, '').trim()
}

function getFirstText(doc: Document, localName: string): string {
  const els = doc.getElementsByTagName('*')
  for (let i = 0; i < els.length; i++) {
    if (els[i].localName === localName) {
      return els[i].textContent?.trim() ?? ''
    }
  }
  return ''
}

/** 10 haneli sayı VKN olarak kabul edilir */
function looksLikeVkn(s: string): boolean {
  const n = s.replace(/\D/g, '')
  return n.length === 10 && /^\d+$/.test(n)
}

/** Party (Supplier/Customer) bloğundan isim ve ID çıkar. VKN (10 hane) tercih edilir. */
function extractPartyInfo(partyEl: Element | null): { name?: string; id?: string } {
  if (!partyEl) return {}
  const all = partyEl.getElementsByTagName('*')
  let name = ''
  let idVkn = ''
  const ids: string[] = []
  for (let i = 0; i < all.length; i++) {
    const el = all[i]
    if (el.localName === 'RegistrationName') name = el.textContent?.trim() ?? ''
    if (el.localName === 'Name' && !name) name = el.textContent?.trim() ?? ''
    if (el.localName === 'ID') {
      const val = el.textContent?.trim() ?? ''
      if (val) {
        ids.push(val)
        const schemeId = (el.getAttribute('schemeID') || el.getAttribute('SchemeID') || '').toUpperCase()
        if ((schemeId === 'VKN' || schemeId === 'VERGIKIMLIKNO') && looksLikeVkn(val)) {
          idVkn = val
        }
      }
    }
  }
  const id = idVkn || ids.find(looksLikeVkn) || ids[ids.length - 1] || ''
  return { name: name || undefined, id: id || undefined }
}

/**
 * UBL-TR Invoice XML'den üst bilgileri parse eder
 */
export function parseInvoiceHeader(xmlText: string, fileName: string): InvoiceHeaderInfo {
  const result: InvoiceHeaderInfo = { fileName }
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xmlText, 'text/xml')
    const parseError = doc.querySelector('parsererror')
    if (parseError) {
      result.rawError = 'XML parse hatası'
      return result
    }

    const root = doc.documentElement
    if (!root) return result

    result.invoiceId = getFirstText(doc, 'ID') || undefined
    result.issueDate = getFirstText(doc, 'IssueDate') || undefined
    result.currency = getFirstText(doc, 'DocumentCurrencyCode') || undefined
    result.payableAmount = getFirstText(doc, 'PayableAmount') || undefined
    result.taxValue = getFirstText(doc, 'TaxAmount') || undefined
    result.taxRate = getFirstText(doc, 'Percent') || undefined
    result.uuid = getFirstText(doc, 'UUID') || undefined

    const supplierParties = root.getElementsByTagName('*')
    let supplierParty: Element | null = null
    let customerParty: Element | null = null
    for (let i = 0; i < supplierParties.length; i++) {
      const el = supplierParties[i]
      if (el.localName === 'AccountingSupplierParty') {
        supplierParty = el
        break
      }
    }
    for (let i = 0; i < supplierParties.length; i++) {
      const el = supplierParties[i]
      if (el.localName === 'AccountingCustomerParty') {
        customerParty = el
        break
      }
    }

    const supplier = extractPartyInfo(supplierParty)
    const customer = extractPartyInfo(customerParty)
    result.supplierName = supplier.name
    result.supplierId = supplier.id
    result.customerName = customer.name
    result.customerId = customer.id

    const profileId = getFirstText(doc, 'ProfileID').toUpperCase()
    const supplierVkn = normalizeVkn(supplier.id)
    const customerVkn = normalizeVkn(customer.id)

    if (profileId.includes('EARSIV')) {
      result.invoiceType = 'earsiv'
    } else if (customerVkn === COMPANY_VKN) {
      result.invoiceType = 'gelen'
    } else if (supplierVkn === COMPANY_VKN) {
      result.invoiceType = 'giden'
    } else {
      result.invoiceType = undefined
    }
  } catch (err) {
    result.rawError = err instanceof Error ? err.message : 'Parse hatası'
  }
  return result
}

/** XSLT namespace */
const XSLT_NS = 'http://www.w3.org/1999/XSL/Transform'

/**
 * XML içinde gömülü xsl:stylesheet veya xsl:transform elementini bulur ve serileştirilmiş string olarak döner.
 * Bulunamazsa null.
 */
export function extractEmbeddedXslt(xmlText: string): string | null {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xmlText, 'text/xml')
    const parseError = doc.querySelector('parsererror')
    if (parseError) return null

    const walk = (node: Node): Element | null => {
      if (node.nodeType !== Node.ELEMENT_NODE) {
        for (let i = 0; i < node.childNodes.length; i++) {
          const found = walk(node.childNodes[i])
          if (found) return found
        }
        return null
      }
      const el = node as Element
      const ns = el.namespaceURI ?? ''
      const local = el.localName ?? ''
      if (
        (ns.includes('xsl') || ns === XSLT_NS) &&
        (local === 'stylesheet' || local === 'transform')
      ) {
        return el
      }
      for (let i = 0; i < node.childNodes.length; i++) {
        const found = walk(node.childNodes[i])
        if (found) return found
      }
      return null
    }

    const xslEl = walk(doc)
    if (!xslEl) return null
    return new XMLSerializer().serializeToString(xslEl)
  } catch {
    return null
  }
}

/**
 * Native XSLTProcessor ile dönüşüm dener; başarısızsa xslt-processor (pure JS) kullanılır.
 * Gelen/giden faturalar native ile çalışır; e-arşiv bazı tarayıcılarda null döndüğü için fallback gerekir.
 */
async function transformWithXsltProcessor(xmlText: string, xsltText: string): Promise<string> {
  const xmlParser = new XmlParser()
  const xslt = new Xslt({ outputMethod: 'html' })
  const xmlDoc = xmlParser.xmlParse(xmlText)
  const xsltDoc = xmlParser.xmlParse(xsltText)
  const result = await xslt.xsltProcess(xmlDoc, xsltDoc)
  if (!result || typeof result !== 'string') {
    throw new Error('XSLT dönüşümü geçerli çıktı üretmedi')
  }
  return result
}

function transformWithNative(xmlText: string, xsltText: string): string {
  const parser = new DOMParser()
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml')
  const xsltDoc = parser.parseFromString(xsltText, 'text/xml')
  const processor = new XSLTProcessor()
  processor.importStylesheet(xsltDoc)
  let result: Node | null = processor.transformToDocument(xmlDoc)
  if (!result || !(result instanceof Node)) {
    const ownerDoc = xmlDoc.implementation.createHTMLDocument('')
    result = processor.transformToFragment(xmlDoc, ownerDoc)
  }
  if (!result || !(result instanceof Node)) {
    throw new Error('XSLT dönüşümü geçerli çıktı üretmedi')
  }
  return new XMLSerializer().serializeToString(result)
}

export async function transformXmlWithXslt(xmlText: string, xsltText: string): Promise<string> {
  if (HAS_NATIVE_XSLT) {
    try {
      return transformWithNative(xmlText, xsltText)
    } catch {
      /* native başarısız, xslt-processor dene */
    }
  }
  return transformWithXsltProcessor(xmlText, xsltText)
}

/** XSLT çıktısının HTML olup olmadığını kontrol eder. XML dönerse false. */
export function isHtmlOutput(s: string): boolean {
  const t = s.trim()
  return t.startsWith('<!DOCTYPE') || t.toLowerCase().startsWith('<html')
}

/**
 * XSLT olmadan veya XSLT hatasında fatura üst bilgisinden basit HTML önizleme üretir.
 * E-arşiv ve diğer faturalar için fallback.
 */
export function buildFallbackInvoiceHtml(header: InvoiceHeaderInfo): string {
  const typeLabel =
    header.invoiceType === 'earsiv'
      ? 'E-Arşiv Fatura'
      : header.invoiceType === 'gelen'
        ? 'Gelen E-Fatura'
        : header.invoiceType === 'giden'
          ? 'Giden E-Fatura'
          : 'Fatura'
  const rows: string[] = []
  if (header.invoiceId) rows.push(`<tr><th>Fatura No</th><td>${escapeHtml(header.invoiceId)}</td></tr>`)
  if (header.issueDate) rows.push(`<tr><th>Tarih</th><td>${escapeHtml(header.issueDate)}</td></tr>`)
  if (header.supplierName)
    rows.push(
      `<tr><th>Satıcı</th><td>${escapeHtml(header.supplierName)}${header.supplierId ? ` (${escapeHtml(header.supplierId)})` : ''}</td></tr>`
    )
  if (header.customerName)
    rows.push(
      `<tr><th>Alıcı</th><td>${escapeHtml(header.customerName)}${header.customerId ? ` (${escapeHtml(header.customerId)})` : ''}</td></tr>`
    )
  if (header.payableAmount != null)
    rows.push(
      `<tr><th>Toplam</th><td><strong>${escapeHtml(header.payableAmount)} ${escapeHtml(header.currency || 'TRY')}</strong></td></tr>`
    )
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${escapeHtml(header.fileName)}</title>
<style>body{font-family:system-ui,sans-serif;padding:24px;max-width:600px;margin:0 auto}
table{width:100%;border-collapse:collapse}th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #eee}
th{color:#666;font-weight:500;width:120px}.badge{padding:4px 8px;border-radius:4px;font-size:12px;font-weight:600}
.badge-earsiv{background:#fef3c7;color:#92400e}.badge-gelen{background:#dbeafe;color:#1e40af}
.badge-giden{background:#d1fae5;color:#065f46}</style>
</head>
<body>
<div class="badge badge-${header.invoiceType || 'giden'}">${escapeHtml(typeLabel)}</div>
<h2 style="margin:16px 0 24px">${escapeHtml(header.fileName)}</h2>
<table>${rows.join('')}</table>
</body>
</html>`
}

/**
 * Fatura tipi ve tarihten R2 storage path üretir.
 * e-documents/{gelen|giden|arsiv}/{YYYY}/{MM}/
 */
export function getEdocumentStoragePath(invoiceType: InvoiceType | undefined, issueDate?: string): string {
  const folder = invoiceType === 'earsiv' ? 'arsiv' : invoiceType === 'gelen' ? 'gelen' : 'giden'
  let year = new Date().getFullYear()
  let month = String(new Date().getMonth() + 1).padStart(2, '0')
  if (issueDate) {
    const d = issueDate.trim()
    const isoMatch = d.match(/^(\d{4})-(\d{1,2})/)
    const trMatch = d.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/)
    if (isoMatch) {
      year = parseInt(isoMatch[1], 10)
      month = String(parseInt(isoMatch[2], 10)).padStart(2, '0')
    } else if (trMatch) {
      year = parseInt(trMatch[3], 10)
      month = String(parseInt(trMatch[2], 10)).padStart(2, '0')
    }
  }
  return `e-documents/${folder}/${year}/${month}/`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
