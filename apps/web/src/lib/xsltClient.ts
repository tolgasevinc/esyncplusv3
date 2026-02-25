/**
 * Client-side XSLT: XML + XSLT -> HTML dönüşümü tarayıcıda.
 * Cloudflare Workers server-side XSLT yerine XSLTProcessor kullanır.
 */

import DOMPurify from 'dompurify'
import { transformXmlWithXslt as transformXmlWithXsltAsync } from './ublInvoiceParser'

const DEBUG = import.meta.env.DEV

export type DocumentType =
  | 'EArsivFatura'
  | 'Invoice'
  | 'ApplicationResponse'
  | 'CreditNote'
  | 'DespatchAdvice'
  | 'Unknown'

export interface ContentApiResponse {
  xml: string
  xslt?: string
  xsltUrl?: string
  gibTemplate?: boolean
  html?: string
  error?: string
}

export type InvoiceType = 'EFATURA' | 'EARSIV' | 'UNKNOWN'

/** BOM temizleme + EmbeddedDocumentBinaryObject truncate (parser donması önlemi) */
export function normalizeXml(xmlText: string): string {
  let s = xmlText.replace(/^\uFEFF/, '')
  if (s.charCodeAt(0) === 0xef && s.charCodeAt(1) === 0xbb && s.charCodeAt(2) === 0xbf) {
    s = s.slice(3)
  }
  s = s.replace(
    /(<[^>]*EmbeddedDocumentBinaryObject[^>]*>)([A-Za-z0-9+/=\s]{50000,})(<\/[^>]*>)/gi,
    (_, open, content, close) => `${open}${content.slice(0, 100)}...[truncated]${close}`
  )
  return s
}

/** API content response'tan XSLT metnini çözümler */
export async function resolveXslt(
  _xml: string,
  api: ContentApiResponse,
  baseUrl: string = window.location.origin
): Promise<string | null> {
  if (api.xslt) return api.xslt
  if (api.xsltUrl) {
    const url = api.xsltUrl.startsWith('http') ? api.xsltUrl : `${baseUrl.replace(/\/$/, '')}${api.xsltUrl}`
    const res = await fetch(url)
    if (!res.ok) {
      log('xsltClient', 'error', `XSLT fetch failed: ${url}`, res.status)
      return null
    }
    return res.text()
  }
  if (api.gibTemplate) {
    const url = `${baseUrl.replace(/\/$/, '')}/earsiv/general.xslt`
    const res = await fetch(url)
    if (!res.ok) {
      log('xsltClient', 'error', `GİB template fetch failed: ${url}`, res.status)
      return null
    }
    return res.text()
  }
  return null
}

/** ProfileID ve namespace ile fatura tipi: EFATURA | EARSIV | UNKNOWN */
export function detectInvoiceType(xmlText: string): InvoiceType {
  const profileMatch = xmlText.match(/<[^>]*:?ProfileID[^>]*>([^<]*)</i)
  const profileId = (profileMatch?.[1] ?? '').toUpperCase()
  if (profileId.includes('EARSIV')) return 'EARSIV'
  if (/TICARIFATURA|TEMELFATURA|IHRACAT|OZELFATURA|HKS|YATIRIMTESVIK|STDKODFATURA/.test(profileId)) return 'EFATURA'
  try {
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml')
    const root = doc.documentElement
    if (root?.localName === 'Invoice' && (root.namespaceURI ?? '').includes('ubl')) return 'EFATURA'
  } catch {
    /* ignore */
  }
  return 'UNKNOWN'
}

/**
 * XML'den belge tipini tespit eder (root, namespace, ProfileID).
 * E-Arşiv, E-Fatura, ApplicationResponse vb.
 */
export function detectDocumentType(xml: string): DocumentType {
  const trimmed = xml.trim()
  if (!trimmed) return 'Unknown'

  // 1) xml-stylesheet varsa - tipi XML içeriğinden çıkar
  const stylesheetMatch = trimmed.match(/<\?xml-stylesheet[^?]*\?>/)
  if (stylesheetMatch) {
    log('xsltClient', 'debug', 'xml-stylesheet bulundu, root/namespace ile devam')
  }

  // 2) ProfileID (UBL-TR)
  const profileMatch = trimmed.match(/<[^>]*:?ProfileID[^>]*>([^<]*)</i)
  const profileId = (profileMatch?.[1] ?? '').toUpperCase()

  if (profileId.includes('EARSIV')) return 'EArsivFatura'
  if (profileId.includes('TICARIFATURA') || profileId.includes('TEMELFATURA')) return 'Invoice'
  if (profileId.includes('APPLICATIONRESPONSE')) return 'ApplicationResponse'

  // 3) Root element ve namespace
  const rootMatch = trimmed.match(/<([^:>\s]+):?(\w+)[\s>]/)
  const localName = (rootMatch?.[2] ?? rootMatch?.[1] ?? '').toLowerCase()

  if (localName === 'invoice') return 'Invoice'
  if (localName === 'creditnote') return 'CreditNote'
  if (localName === 'applicationresponse') return 'ApplicationResponse'
  if (localName === 'despatchadvice') return 'DespatchAdvice'

  // 4) Namespace URI
  if (trimmed.includes('urn:oasis:names:specification:ubl:schema:xsd:Invoice')) return 'Invoice'
  if (trimmed.includes('efatura.gov.tr') && trimmed.includes('EARSIV')) return 'EArsivFatura'

  log('xsltClient', 'warn', 'Belge tipi tespit edilemedi', { profileId, localName })
  return 'Unknown'
}

/** Tip'e göre GİB XSLT URL'i döner; fetch ile metni alır. EFATURA/EARSIV/UNKNOWN için general.xslt kullanılır. */
export async function pickStylesheet(
  _type: InvoiceType,
  baseUrl: string = window.location.origin
): Promise<string | null> {
  const url = `${baseUrl.replace(/\/$/, '')}/earsiv/general.xslt`
  const res = await fetch(url)
  if (!res.ok) {
    log('xsltClient', 'error', `pickStylesheet fetch failed: ${url}`, res.status)
    return null
  }
  return res.text()
}

/** xml-stylesheet PI'dan href (XSLT URL) çıkarır */
export function extractXmlStylesheetHref(xml: string): string | null {
  const m = xml.match(/<\?xml-stylesheet[^?]*href\s*=\s*["']([^"']+)["'][^?]*\?>/i)
  return m?.[1]?.trim() ?? null
}

/** Gömülü xsl:stylesheet/transform çıkarır (XML içinde metin olarak) */
export function extractEmbeddedXslt(xml: string): string | null {
  const m = xml.match(/<xsl:(?:stylesheet|transform)[^>]*>[\s\S]*?<\/xsl:(?:stylesheet|transform)>/i)
  return m?.[0] ?? null
}

/**
 * UBL AdditionalDocumentReference/cac:Attachment/cbc:EmbeddedDocumentBinaryObject içindeki
 * base64 XSLT'yi çıkarır. E-arşiv ve e-fatura XML'lerinde XSLT bu şekilde gömülü olabilir.
 * NOT: Ham XML kullanılmalı (normalizeXml truncate etmeden önce).
 */
export function extractEmbeddedXsltFromBinaryObject(xml: string): string | null {
  const regex = /<[^>]*EmbeddedDocumentBinaryObject[^>]*>([\s\S]*?)<\/[^>]*EmbeddedDocumentBinaryObject>/gi
  let m: RegExpExecArray | null
  while ((m = regex.exec(xml)) !== null) {
    const b64 = (m[1] ?? '').replace(/\s/g, '').trim()
    if (b64.length < 100) continue
    try {
      const decoded = atob(b64)
      const bytes = new Uint8Array(decoded.length)
      for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i)
      const str = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
      if (/<\?xml|<\s*xsl:stylesheet|<\s*xsl:transform/i.test(str)) {
        log('xsltClient', 'debug', 'Base64 EmbeddedDocumentBinaryObject\'dan XSLT çıkarıldı')
        return str
      }
    } catch {
      /* base64 decode hatası veya XSLT değil, sonrakine geç */
    }
  }
  return null
}

/**
 * XSLT 2.0/4.0 -> 1.0 ve tarayıcı uyumsuz elementleri temizler.
 * - version="2.0"/"4.0" -> "1.0"
 * - xsl:character-map (XSLT 2.0): tarayıcı XSLTProcessor'ı bunu görünce dönüşümü iptal eder
 * - use-character-maps özniteliği xsl:output'tan kaldırılır
 */
export function normalizeXsltVersion(xslt: string): string {
  return xslt
    .replace(/version\s*=\s*["']2\.0["']/gi, 'version="1.0"')
    .replace(/version\s*=\s*["']4\.0["']/gi, 'version="1.0"')
    .replace(/\s+use-character-maps\s*=\s*["'][^"']*["']/gi, '')
    .replace(/<xsl:character-map\b[^>]*>[\s\S]*?<\/xsl:character-map>/gi, '')
}

/**
 * Tarayıcıda XSLTProcessor ile XML -> HTML dönüşümü.
 * normalizeXml + normalizeXsltVersion uygulanır.
 */
export function transformInBrowser(xmlText: string, xsltText: string): string | null {
  const xmlNorm = normalizeXml(xmlText)
  const xsltNorm = normalizeXsltVersion(xsltText)
  return transformXmlWithXslt(xmlNorm, xsltNorm)
}

/**
 * XSLTProcessor ile XML -> HTML dönüşümü.
 * Başarısızsa null döner.
 */
export function transformXmlWithXslt(xmlText: string, xsltText: string): string | null {
  if (typeof XSLTProcessor === 'undefined') {
    log('xsltClient', 'error', 'XSLTProcessor yok')
    return null
  }
  try {
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml')
    const parseErr = xmlDoc.querySelector('parsererror')
    if (parseErr) {
      log('xsltClient', 'error', 'XML parse hatası', parseErr.textContent)
      return null
    }

    const xsltNorm = normalizeXsltVersion(xsltText)
    const xsltDoc = parser.parseFromString(xsltNorm, 'text/xml')
    const xsltErr = xsltDoc.querySelector('parsererror')
    if (xsltErr) {
      log('xsltClient', 'error', 'XSLT parse hatası', xsltErr.textContent)
      return null
    }

    const proc = new XSLTProcessor()
    proc.importStylesheet(xsltDoc)
    const result = proc.transformToDocument(xmlDoc)
    if (!result) return null

    const html = new XMLSerializer().serializeToString(result)
    if (!isHtmlOutput(html)) {
      log('xsltClient', 'warn', 'XSLT çıktısı HTML değil')
      return null
    }
    return html
  } catch (err) {
    log('xsltClient', 'error', 'XSLT dönüşüm hatası', err)
    return null
  }
}

function isHtmlOutput(s: string): boolean {
  const t = s.trim()
  return t.startsWith('<!DOCTYPE') || t.toLowerCase().startsWith('<html')
}

/**
 * HTML'i DOMPurify ile sanitize eder.
 * script, iframe, object, embed yasak; style izinli.
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'rel', 'charset'],
    ADD_TAGS: ['style'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed'],
    FORCE_BODY: true,
    ALLOW_UNKNOWN_PROTOCOLS: false,
  })
}

/** Debug log */
function log(scope: string, level: string, msg: string, data?: unknown) {
  if (!DEBUG && level === 'debug') return
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  fn(`[${scope}]`, msg, data ?? '')
}

/**
 * XML + API response ile HTML önizleme üretir.
 * 1) normalizeXml (BOM, BinaryObject)
 * 2) xml-stylesheet varsa onu kullan
 * 3) Gömülü XSLT veya API'dan xslt/xsltUrl/gibTemplate
 * 4) detectInvoiceType + pickStylesheet (XSLT yoksa)
 * 5) transformInBrowser + sanitize
 */
export async function renderXmlToHtml(
  xml: string,
  api: ContentApiResponse,
  baseUrl?: string
): Promise<{ html: string; error?: string }> {
  const origin = baseUrl ?? window.location.origin
  const xmlNorm = normalizeXml(xml)
  log('xsltClient', 'debug', 'renderXmlToHtml başladı', { hasXml: !!xml, hasXslt: !!api.xslt, gibTemplate: api.gibTemplate })

  if (api.html) {
    return { html: sanitizeHtml(api.html) }
  }

  let xslt: string | null = null

  // 1) xml-stylesheet href varsa fetch et
  const stylesheetHref = extractXmlStylesheetHref(xmlNorm)
  if (stylesheetHref) {
    try {
      const url = stylesheetHref.startsWith('http') ? stylesheetHref : `${origin.replace(/\/$/, '')}${stylesheetHref}`
      const res = await fetch(url)
      if (res.ok) xslt = await res.text()
    } catch (e) {
      log('xsltClient', 'warn', 'xml-stylesheet fetch hatası', e)
    }
  }

  // 2) Gömülü XSLT (metin veya base64)
  if (!xslt) xslt = extractEmbeddedXslt(xmlNorm)
  if (!xslt) xslt = extractEmbeddedXsltFromBinaryObject(xml) // Ham XML - truncate öncesi

  // 3) API'dan
  if (!xslt) xslt = await resolveXslt(xmlNorm, api, origin)

  // 4) XSLT yoksa detectInvoiceType + pickStylesheet (EARSIV/EFATURA için GİB şablonu)
  if (!xslt) {
    const invType = detectInvoiceType(xmlNorm)
    xslt = await pickStylesheet(invType, origin)
  }

  if (!xslt) {
    const docType = detectDocumentType(xmlNorm)
    return { html: '', error: `XSLT bulunamadı (tip: ${docType})` }
  }

  const xsltNorm = normalizeXsltVersion(xslt)
  let transformed: string | null = null
  try {
    transformed = await transformXmlWithXsltAsync(xmlNorm, xsltNorm)
  } catch (err) {
    log('xsltClient', 'error', 'XSLT dönüşüm hatası', err)
  }
  if (!transformed || !isHtmlOutput(transformed)) {
    return { html: '', error: 'XSLT dönüşümü başarısız' }
  }

  const sanitized = sanitizeHtml(transformed)
  const hasContent = (sanitized.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? '').replace(/<script[\s\S]*?<\/script>/gi, '').trim().length > 50

  if (!hasContent) {
    log('xsltClient', 'warn', 'XSLT çıktısı boş veya çok kısa')
  }

  return { html: sanitized }
}
