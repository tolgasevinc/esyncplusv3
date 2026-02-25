# E-Documents: Client-Side XSLT Önizleme

Cloudflare Workers ortamında server-side XSLT güvenilmez olduğu için render tarayıcıda yapılıyor.

## 1) Hono Route (API)

```typescript
// GET /api/e-documents/content?key=e-documents/giden/2025/02/fatura.xml
app.get('/api/e-documents/content', async (c) => {
  const key = (c.req.query('key') || '').trim();
  const xmlObj = await c.env.STORAGE.get(key);
  const xml = await readXmlWithEncoding(xmlObj); // ISO-8859-9 desteği

  // XSLT: R2'den, embedded, veya GİB şablonu
  let xslt: string | undefined;
  // ... xslt bulma mantığı ...

  if (xslt) {
    return c.json({ xml, xslt }, 200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, max-age=60',
    });
  }
  if (isEarsiv) {
    return c.json({ xml, gibTemplate: true, xsltUrl: '/earsiv/general.xslt' }, 200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, max-age=60',
    });
  }
  return c.json({ html: buildServerFallbackHtml(header) }, 200, { ... });
});
```

**Encoding:** `readXmlWithEncoding()` XML declaration'dan `encoding="iso-8859-9"` okur, gerekirse decode eder.

## 2) Tarayıcı TS (xsltClient.ts)

```typescript
// Fetch XML + XSLT
const res = await fetch(`${API_URL}/api/e-documents/content?key=${key}`);
const api: ContentApiResponse = await res.json();

// Dönüşüm + sanitize
const { html, error } = await renderXmlToHtml(api.xml, api);

// Mount
iframe.srcDoc = wrapInvoiceHtmlWithFallbacks(html);
```

**renderXmlToHtml** akışı:
1. `xml-stylesheet` href varsa fetch et
2. Gömülü `xsl:stylesheet` varsa çıkar
3. API'dan `xslt` / `xsltUrl` / `gibTemplate` ile XSLT al
4. `XSLTProcessor.transformToDocument()` ile dönüştür
5. `DOMPurify.sanitize()` ile sanitize et

## 3) Belge Tipi Tespiti (detectDocumentType)

```typescript
export function detectDocumentType(xml: string): DocumentType {
  // 1) ProfileID (UBL-TR)
  const profileId = xml.match(/ProfileID[^>]*>([^<]*)</i)?.[1]?.toUpperCase() ?? '';
  if (profileId.includes('EARSIV')) return 'EArsivFatura';
  if (profileId.includes('TICARIFATURA') || profileId.includes('TEMELFATURA')) return 'Invoice';
  if (profileId.includes('APPLICATIONRESPONSE')) return 'ApplicationResponse';

  // 2) Root element
  const localName = xml.match(/<[^:>\s]+:?(\w+)[\s>]/)?.[1]?.toLowerCase() ?? '';
  if (localName === 'invoice') return 'Invoice';
  if (localName === 'creditnote') return 'CreditNote';
  if (localName === 'applicationresponse') return 'ApplicationResponse';

  // 3) Namespace URI
  if (xml.includes('urn:oasis:names:specification:ubl:schema:xsd:Invoice')) return 'Invoice';
  return 'Unknown';
}
```

## 4) Hata Yönetimi ve Debug

```typescript
// xsltClient.ts - DEBUG log (sadece dev)
const DEBUG = import.meta.env.DEV;
function log(scope: string, level: string, msg: string, data?: unknown) {
  if (!DEBUG && level === 'debug') return;
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(`[${scope}]`, msg, data ?? '');
}

// Kullanım
log('xsltClient', 'debug', 'renderXmlToHtml başladı', { hasXml: !!xml });
log('xsltClient', 'error', 'XSLT dönüşüm hatası', err);
```

**Fallback:** XSLT başarısız veya boş çıktı → `buildFallbackInvoiceHtml(header)` ile basit fatura özeti.

## 5) XSLT Seçim Önceliği

1. `<?xml-stylesheet href="..."?>` → fetch
2. Gömülü `<xsl:stylesheet>` → extract
3. API `xslt` → doğrudan
4. API `xsltUrl` veya `gibTemplate` → fetch `/earsiv/general.xslt`

## 6) Web Worker (Opsiyonel)

Büyük XML'lerde UI donmasını önlemek için `transformXmlWithXslt` bir Web Worker'a taşınabilir. Şu an senkron `XSLTProcessor` kullanılıyor; 1MB+ XML'lerde `requestIdleCallback` veya Worker ile chunk işlenebilir.
