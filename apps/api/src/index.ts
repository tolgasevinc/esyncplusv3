import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createConnection } from 'mysql2/promise';

/** Türkçe karakterleri arama için ASCII karşılıklarına çevirir (ı→i, ş→s, ğ→g, ü→u, ö→o, ç→c, İ→i) */
function normalizeForSearch(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/İ/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c');
}

/** SQLite'da sütun değerini normalize eden ifade (Türkçe karakter eşleşmesi için).
 * SQLite LOWER() sadece ASCII dönüştürür, Ü/Ö/Ğ/Ş/Ç/İ değişmez - bu yüzden hepsini REPLACE ile yapıyoruz. */
function sqlNormalizeCol(col: string): string {
  return `LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(${col}, ''), 'İ', 'i'), 'ı', 'i'), 'Ü', 'u'), 'ü', 'u'), 'Ö', 'o'), 'ö', 'o'), 'Ğ', 'g'), 'ğ', 'g'), 'Ş', 's'), 'ş', 's'), 'Ç', 'c'), 'ç', 'c'))`;
}


type Bindings = {
  DB: D1Database;
  STORAGE: R2Bucket;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('/*', cors());

app.get('/health', (c) => c.json({ status: 'ok' }));

app.get('/tables', async (c) => {
  try {
    if (!c.env.DB) {
      return c.json(
        { error: 'Veritabanı bağlantısı (Binding) bulunamadı!' },
        500,
      );
    }

    const { results } = await c.env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    ).all();

    const tables = (results as { name: string }[]).map((r) => r.name);
    return c.json(tables);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return c.json({ error: message }, 500);
  }
});

app.get('/tables/info', async (c) => {
  try {
    if (!c.env.DB) {
      return c.json(
        { error: 'Veritabanı bağlantısı (Binding) bulunamadı!' },
        500,
      );
    }

    const { results } = await c.env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'd1_%' ORDER BY name",
    ).all();

    const tables = results as { name: string }[];
    const tableInfos = await Promise.all(
      tables.map(async (t) => {
        try {
          const countResult = await c.env.DB.prepare(
            `SELECT COUNT(*) as count FROM "${t.name}"`,
          ).first<{ count: number }>();
          return {
            name: t.name,
            rowCount: countResult?.count ?? 0,
            size: '-',
          };
        } catch {
          return { name: t.name, rowCount: 0, size: '-' };
        }
      }),
    );

    return c.json(tableInfos);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return c.json({ error: message }, 500);
  }
});

app.get('/', (c) =>
  c.json({
    message: 'Project V3 API',
    endpoints: ['/health', '/tables', '/tables/info', '/storage/folders', '/storage/list'],
  }),
);

// R2 Storage - Klasör tanımları (DB'den)
app.get('/storage/folders', async (c) => {
  try {
    if (!c.env.DB) {
      return c.json({ error: 'Veritabanı bağlantısı bulunamadı!' }, 500);
    }

    const { results } = await c.env.DB.prepare(
      `SELECT id, name, path, type, sort_order FROM storage_folders 
       WHERE is_deleted = 0 AND status = 1 ORDER BY sort_order`
    ).all();

    return c.json(results);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return c.json({ error: message }, 500);
  }
});

// R2 Storage - Yeni klasör ekle
app.post('/storage/folders', async (c) => {
  try {
    if (!c.env.DB) {
      return c.json({ error: 'Veritabanı bağlantısı bulunamadı!' }, 500);
    }

    const body = await c.req.json<{ name: string; path: string; type?: string }>();
    const { name, path } = body;
    const type = body.type || 'document';

    if (!name?.trim() || !path?.trim()) {
      return c.json({ error: 'name ve path gerekli' }, 400);
    }

    const normalizedPath = path.endsWith('/') ? path : `${path}/`;

    const existing = await c.env.DB.prepare(
      `SELECT id FROM storage_folders WHERE path = ? AND is_deleted = 0`
    ).bind(normalizedPath).first();
    if (existing) {
      return c.json({ error: 'Bu klasör zaten tanımlı' }, 409);
    }

    await c.env.DB.prepare(
      `INSERT INTO storage_folders (name, path, type) VALUES (?, ?, ?)`
    ).bind(name.trim(), normalizedPath, type).run();

    const { results } = await c.env.DB.prepare(
      `SELECT id, name, path, type, sort_order FROM storage_folders 
       WHERE path = ? AND is_deleted = 0`
    ).bind(normalizedPath).all();

    return c.json(results[0], 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return c.json({ error: message }, 500);
  }
});

// R2 Storage - Klasör içeriği listele (cursor ile tüm dosyalar alınır)
app.get('/storage/list', async (c) => {
  try {
    if (!c.env.STORAGE) {
      return c.json({ error: 'R2 Storage bağlantısı bulunamadı!' }, 500);
    }

    let prefix = (c.req.query('prefix') || '').trim();
    if (prefix && !prefix.endsWith('/')) prefix = `${prefix}/`;
    const allObjects: { key: string; size: number; uploaded?: string }[] = []
    const LIST_PAGE_SIZE = 1000
    const MAX_PAGES = 100
    let cursor: string | undefined
    let truncated = true
    let pageCount = 0
    while (truncated && pageCount < MAX_PAGES) {
      pageCount++
      const listOpts: { prefix: string; limit: number; cursor?: string } = { prefix, limit: LIST_PAGE_SIZE }
      if (cursor) listOpts.cursor = cursor
      const listed = await c.env.STORAGE.list(listOpts)

      for (const o of listed.objects) {
        const uploaded = o.uploaded instanceof Date ? o.uploaded.toISOString() : (o.uploaded as string | undefined)
        allObjects.push({ key: o.key, size: o.size, uploaded })
      }
      truncated = !!listed.truncated
      cursor = truncated && 'cursor' in listed ? (listed as { cursor: string }).cursor : undefined
    }

    return c.json(allObjects);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return c.json({ error: message }, 500);
  }
});

// R2 Storage - Mevcut prefix'leri listele (klasör seçimi için, cursor ile tüm sonuçlar alınır)
// prefix: belirtilirse sadece o prefix altındaki alt klasörleri döner
// r2_only=1: sadece R2'de gerçekten var olan prefix'leri döner (storage_folders eklenmez)
app.get('/storage/prefixes', async (c) => {
  try {
    if (!c.env.STORAGE) {
      return c.json({ error: 'R2 Storage bağlantısı bulunamadı!' }, 500);
    }

    const basePrefix = (c.req.query('prefix') || '').replace(/\/+$/, '');
    const r2Only = c.req.query('r2_only') === '1';
    const searchPrefix = basePrefix ? `${basePrefix}/` : '';
    const prefixes = new Set<string>()
    const LIST_PAGE_SIZE = 1000
    const MAX_PAGES = 100
    let cursor: string | undefined
    let truncated = true
    let pageCount = 0
    while (truncated && pageCount < MAX_PAGES) {
      pageCount++
      const listOpts: { prefix: string; limit: number; cursor?: string } = { prefix: searchPrefix, limit: LIST_PAGE_SIZE }
      if (cursor) listOpts.cursor = cursor
      const listed = await c.env.STORAGE.list(listOpts)

      for (const o of listed.objects) {
        const rest = o.key.slice(searchPrefix.length)
        const idx = rest.indexOf('/')
        if (idx > 0) {
          prefixes.add(searchPrefix + rest.slice(0, idx + 1))
        } else if (rest && !rest.includes('/')) {
          prefixes.add(searchPrefix)
        }
      }
      truncated = !!listed.truncated
      cursor = truncated && 'cursor' in listed ? (listed as { cursor: string }).cursor : undefined
    }

    if (!basePrefix && !r2Only && c.env.DB) {
      const { results } = await c.env.DB.prepare(
        `SELECT path FROM storage_folders WHERE is_deleted = 0 AND status = 1 ORDER BY sort_order`
      ).all();
      for (const r of results as { path: string }[]) {
        if (r.path) prefixes.add(r.path);
      }
    }
    return c.json(Array.from(prefixes).sort());
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return c.json({ error: message }, 500);
  }
});

// ========== E-DOCUMENTS (D1'den liste) ==========
app.get('/api/e-documents', async (c) => {
  try {
    if (!c.env.DB) return c.json({ data: [], total: 0, total_amount_try: 0 });
    const filter = (c.req.query('filter') || 'tumu').trim();
    const search = (c.req.query('search') || '').trim();
    const sortBy = (c.req.query('sort_by') || 'date').trim();
    const sortOrder = (c.req.query('sort_order') || 'desc').trim();
    const page = Math.max(1, parseInt(c.req.query('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '10')));
    const offset = (page - 1) * limit;

    const validSort: Record<string, string> = {
      date: 'date',
      amount: 'total_price',
      invoice_no: 'invoice_no',
      description: 'file_name',
    };
    const orderCol = validSort[sortBy] || 'date';
    const orderDir = sortOrder === 'asc' ? 'ASC' : 'DESC';

    let where = 'WHERE is_deleted = 0';
    const params: (string | number)[] = [];
    if (filter !== 'tumu') {
      where += ' AND directory LIKE ?';
      params.push(`e-documents/${filter}/%`);
    }
    if (search) {
      const n = normalizeForSearch(search);
      const pat = `%${n}%`;
      where += ` AND (${sqlNormalizeCol('invoice_no')} LIKE ? OR ${sqlNormalizeCol('seller_title')} LIKE ? OR ${sqlNormalizeCol('buyer_title')} LIKE ? OR ${sqlNormalizeCol('file_name')} LIKE ?)`;
      params.push(pat, pat, pat, pat);
    }

    const countRes = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM e_documents ${where}`
    ).bind(...params).first<{ total: number }>();

    let totalAmountTry = 0;
    try {
      const sumRes = await c.env.DB.prepare(
        `SELECT COALESCE(SUM(total_price), 0) as sum_try FROM e_documents ${where}`
      ).bind(...params).first<{ sum_try: number }>();
      totalAmountTry = sumRes?.sum_try ?? 0;
    } catch {
      /* ignore */
    }

    const selectCols = 'id, date, uuid, invoice_no, seller_title, buyer_title, directory, file_name, total_price, tax_value, tax_rate, status, created_at';
    const { results } = await c.env.DB.prepare(
      `SELECT ${selectCols} FROM e_documents ${where}
       ORDER BY ${orderCol} ${orderDir}, id DESC LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all();

    const rows = results as { id: number; date: string | null; directory: string; file_name: string; seller_title: string | null; buyer_title: string | null; invoice_no: string | null; total_price: number | null; tax_value: number | null; tax_rate: number | null }[];
    const data = rows.map((r) => {
      const segs = r.directory.replace(/^e-documents\//, '').split('/');
      const folder = segs[0] || 'giden';
      const type = folder;
      // Gelen: satıcı (gönderen) gösterilir. Giden/Arşiv: alıcı (müşteri) gösterilir.
      const sender = r.seller_title ?? undefined;
      const receiver = r.buyer_title ?? undefined;
      return {
        id: r.id,
        type,
        date: r.date || '—',
        sender,
        receiver,
        amount: r.total_price ?? undefined,
        currency: undefined,
        description: r.file_name,
        invoice_no: r.invoice_no ?? undefined,
        status: r.status ?? 1,
        directory: r.directory,
        file_name: r.file_name,
      };
    });
    return c.json({ data, total: countRes?.total ?? 0, total_amount_try: totalAmountTry });
  } catch (err: unknown) {
    return c.json({ data: [], total: 0, total_amount_try: 0 });
  }
});

function extractXmlHeader(xml: string, fileName: string): Record<string, string> {
  const getFirst = (localName: string) => {
    const re = new RegExp(`<[^>]*:?${localName}[^>]*>([^<]*)<`, 'i');
    const m = xml.match(re);
    return m ? m[1].trim() : '';
  };
  const allRegNames = [...xml.matchAll(/<[^>]*:?RegistrationName[^>]*>([^<]*)</gi)];
  const allNames = [...xml.matchAll(/<[^>]*:?Name[^>]*>([^<]*)</gi)];
  const supplierName = allRegNames[0]?.[1]?.trim() || allNames[0]?.[1]?.trim() || '';
  const customerName = allRegNames[1]?.[1]?.trim() || allNames[1]?.[1]?.trim() || '';
  return {
    invoiceId: getFirst('ID') || '',
    issueDate: getFirst('IssueDate') || '',
    currency: getFirst('DocumentCurrencyCode') || 'TRY',
    payableAmount: getFirst('PayableAmount') || '',
    supplierName,
    customerName,
    fileName: fileName || 'fatura.xml',
  };
}

function buildServerFallbackHtml(h: Record<string, string>): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const rows: string[] = [];
  if (h.invoiceId) rows.push(`<tr><th>Fatura No</th><td>${esc(h.invoiceId)}</td></tr>`);
  if (h.issueDate) rows.push(`<tr><th>Tarih</th><td>${esc(h.issueDate)}</td></tr>`);
  if (h.supplierName) rows.push(`<tr><th>Satıcı</th><td>${esc(h.supplierName)}</td></tr>`);
  if (h.customerName) rows.push(`<tr><th>Alıcı</th><td>${esc(h.customerName)}</td></tr>`);
  if (h.payableAmount) rows.push(`<tr><th>Toplam</th><td><strong>${esc(h.payableAmount)} ${esc(h.currency || 'TRY')}</strong></td></tr>`);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(h.fileName)}</title>
<style>body{font-family:system-ui,sans-serif;padding:24px;max-width:600px;margin:0 auto}
table{width:100%;border-collapse:collapse}th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #eee}
th{color:#666;font-weight:500;width:120px}</style></head><body>
<h2 style="margin:0 0 24px">${esc(h.fileName)}</h2><table>${rows.join('')}</table></body></html>`;
}

async function transformXmlToHtml(
  xml: string,
  xslt: string,
  fetchFn?: (uri: string) => Promise<string>
): Promise<{ html?: string; error?: string }> {
  try {
    const { Xslt, XmlParser } = await import('xslt-processor');
    const xmlParser = new XmlParser();
    const xsltProc = new Xslt({
      outputMethod: 'html',
      fetchFunction: fetchFn ?? (async (uri: string) => {
        if (uri.startsWith('http://') || uri.startsWith('https://')) {
          const res = await fetch(uri);
          if (!res.ok) throw new Error(`Fetch failed: ${uri}`);
          return res.text();
        }
        throw new Error(`Harici yükleme desteklenmiyor: ${uri}`);
      }),
    });
    const xmlDoc = xmlParser.xmlParse(xml);
    const xsltDoc = xmlParser.xmlParse(xslt);
    const html = await xsltProc.xsltProcess(xmlDoc, xsltDoc);
    if (html && typeof html === 'string' && (html.trim().startsWith('<!DOCTYPE') || html.trim().toLowerCase().startsWith('<html'))) {
      return { html };
    }
    return { error: 'XSLT çıktısı HTML değil' };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'XSLT hatası' };
  }
}

/** XML dosyasını okurken encoding desteği (windows-1254 / ISO-8859-9 → UTF-8) + BOM temizleme */
async function readXmlWithEncoding(obj: R2ObjectBody): Promise<string> {
  const buf = await obj.arrayBuffer();
  let bytes = new Uint8Array(buf);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    bytes = bytes.subarray(3);
  }
  const declMatch = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 200)).match(/encoding\s*=\s*["']([^"']+)["']/i);
  const enc = declMatch?.[1]?.toLowerCase();
  if (enc === 'iso-8859-9' || enc === 'windows-1254') {
    return new TextDecoder('iso-8859-9').decode(bytes);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

/** UBL EmbeddedDocumentBinaryObject içindeki base64 XSLT'yi çıkarır */
function extractXsltFromEmbeddedBinaryObject(xml: string): string | undefined {
  const regex = /<[^>]*EmbeddedDocumentBinaryObject[^>]*>([\s\S]*?)<\/[^>]*EmbeddedDocumentBinaryObject>/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(xml)) !== null) {
    const b64 = (m[1] ?? '').replace(/\s/g, '').trim();
    if (b64.length < 100) continue;
    try {
      const decoded = atob(b64);
      const bytes = new Uint8Array(decoded.length);
      for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
      const str = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      if (/<\?xml|<\s*xsl:stylesheet|<\s*xsl:transform/i.test(str)) return str;
    } catch {
      /* skip */
    }
  }
  return undefined;
}

/** XSLT 2.0 elementlerini temizler; xsl:character-map tarayıcıyı ve xslt-processor'ı kırıyor */
function normalizeXslt(xslt: string): string {
  return xslt
    .replace(/version\s*=\s*["']2\.0["']/gi, 'version="1.0"')
    .replace(/version\s*=\s*["']4\.0["']/gi, 'version="1.0"')
    .replace(/\s+use-character-maps\s*=\s*["'][^"']*["']/gi, '')
    .replace(/<xsl:character-map\b[^>]*>[\s\S]*?<\/xsl:character-map>/gi, '');
}

/** XML'e data URI ile XSLT enjekte eder - tarayıcı otomatik render eder (Gemini önerisi) */
function injectXsltAsDataUri(xml: string, xslt: string): string {
  const bytes = new TextEncoder().encode(xslt);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  const xsltBase64 = btoa(binary);
  const cleanXml = xml.replace(/<\?xml-stylesheet.*?\?>/g, '').trim();
  const stylesheetTag = `<?xml-stylesheet type="text/xsl" href="data:text/xml;base64,${xsltBase64}"?>`;
  const insertPos = cleanXml.indexOf('?>');
  if (insertPos >= 0) {
    return cleanXml.slice(0, insertPos + 2) + '\n' + stylesheetTag + cleanXml.slice(insertPos + 2);
  }
  return stylesheetTag + '\n' + cleanXml;
}

// E-Documents - XML + data URI XSLT döndür (tarayıcı native render - beyaz sayfa önlemi)
app.get('/api/e-documents/preview-xml', async (c) => {
  try {
    if (!c.env.STORAGE) return c.json({ error: 'R2 Storage bulunamadı' }, 500);
    const key = (c.req.query('key') || '').trim();
    const baseUrl = (c.req.query('baseUrl') || '').trim();
    if (!key || !key.startsWith('e-documents/') || !key.endsWith('.xml')) {
      return c.json({ error: 'Geçersiz key' }, 400);
    }
    const xmlObj = await c.env.STORAGE.get(key);
    if (!xmlObj) return c.json({ error: 'Dosya bulunamadı' }, 404);
    const xml = await readXmlWithEncoding(xmlObj);

    const dir = key.slice(0, key.lastIndexOf('/') + 1);
    const fileBase = key.split('/').pop()?.replace(/\.xml$/i, '') || 'file';
    let xslt: string | undefined;
    for (const ext of ['.xslt', '.xsl']) {
      const xsltKey = `${dir}${fileBase}${ext}`;
      const xsltObj = await c.env.STORAGE.get(xsltKey);
      if (xsltObj) {
        xslt = await xsltObj.text();
        break;
      }
    }
    if (!xslt) {
      const embeddedMatch = xml.match(/<xsl:(?:stylesheet|transform)[^>]*>[\s\S]*?<\/xsl:(?:stylesheet|transform)>/i);
      if (embeddedMatch) xslt = embeddedMatch[0];
    }
    if (!xslt) xslt = extractXsltFromEmbeddedBinaryObject(xml);
    if (!xslt) {
      const isEarsiv = /ProfileID[^>]*>([^<]*)</i.exec(xml)?.[1]?.toUpperCase().includes('EARSIV');
      if (isEarsiv && baseUrl) {
        const gibUrl = baseUrl.replace(/\/$/, '') + '/earsiv/general.xslt';
        const res = await fetch(gibUrl);
        if (res.ok) xslt = await res.text();
      }
    }
    if (!xslt) {
      const header = extractXmlHeader(xml, fileBase + '.xml');
      return c.html(buildServerFallbackHtml(header), 200, {
        'Content-Type': 'text/html; charset=utf-8',
      });
    }
    const xsltNorm = normalizeXslt(xslt);
    const isEarsiv = /ProfileID[^>]*>([^<]*)</i.exec(xml)?.[1]?.toUpperCase().includes('EARSIV');
    const isGiden = key.includes('/giden/');
    // Giden ve e-arşiv: data URI bazen başarısız (xsl:include, XSLT deprecation). Önce sunucuda dene.
    if (isEarsiv || isGiden) {
      const fetchFn = async (uri: string) => {
        if (uri.startsWith('http://') || uri.startsWith('https://')) {
          const res = await fetch(uri);
          if (!res.ok) throw new Error(`Fetch failed: ${uri}`);
          return res.text();
        }
        const relKey = dir + uri.replace(/^\.\//, '');
        const obj = await c.env.STORAGE.get(relKey);
        if (!obj) throw new Error(`Dosya bulunamadı: ${uri}`);
        return obj.text();
      };
      const result = await transformXmlToHtml(xml, xsltNorm, fetchFn);
      if (result.html) {
        return c.html(result.html, 200, { 'Content-Type': 'text/html; charset=utf-8' });
      }
    }
    // Gelen veya sunucu dönüşüm başarısız: data URI ile tarayıcıya bırak
    const finalXml = injectXsltAsDataUri(xml, xsltNorm);
    return new Response(finalXml, {
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

// E-Documents - R2'den XML + XSLT getir. XSLT varsa { xml, xslt } döndür (client-side native XSLT için).
// XSLT yoksa sunucuda fallback HTML üret. Gelen/giden native XSLTProcessor ile düzgün çalışır.
app.get('/api/e-documents/content', async (c) => {
  try {
    if (!c.env.STORAGE) return c.json({ error: 'R2 Storage bulunamadı' }, 500);
    const key = (c.req.query('key') || '').trim();
    if (!key || !key.startsWith('e-documents/') || !key.endsWith('.xml')) {
      return c.json({ error: 'Geçersiz key' }, 400);
    }
    const xmlObj = await c.env.STORAGE.get(key);
    if (!xmlObj) return c.json({ error: 'Dosya bulunamadı' }, 404);
    const xml = await readXmlWithEncoding(xmlObj);

    const dir = key.slice(0, key.lastIndexOf('/') + 1);
    const fileBase = key.split('/').pop()?.replace(/\.xml$/i, '') || 'file';
    let xslt: string | undefined;
    for (const ext of ['.xslt', '.xsl']) {
      const xsltKey = `${dir}${fileBase}${ext}`;
      const xsltObj = await c.env.STORAGE.get(xsltKey);
      if (xsltObj) {
        xslt = await xsltObj.text();
        break;
      }
    }
    if (!xslt) {
      const embeddedMatch = xml.match(/<xsl:(?:stylesheet|transform)[^>]*>[\s\S]*?<\/xsl:(?:stylesheet|transform)>/i);
      if (embeddedMatch) xslt = embeddedMatch[0];
    }
    if (!xslt) xslt = extractXsltFromEmbeddedBinaryObject(xml);
    if (xslt) {
      return c.json({ xml, xslt: normalizeXslt(xslt) }, 200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'private, max-age=60',
      });
    }
    // E-arşiv (XSLT yok): GİB şablonu - frontend xsltUrl ile fetch eder
    const isEarsiv = /ProfileID[^>]*>([^<]*)</i.exec(xml)?.[1]?.toUpperCase().includes('EARSIV');
    if (isEarsiv) {
      return c.json({ xml, gibTemplate: true, xsltUrl: '/earsiv/general.xslt' }, 200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'private, max-age=60',
      });
    }
    const header = extractXmlHeader(xml, fileBase + '.xml');
    const fallbackHtml = buildServerFallbackHtml(header);
    return c.json({ html: fallbackHtml }, 200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, max-age=60',
    });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

// E-Documents - Yükleme önizlemesi (sunucuda XSLT)
app.post('/api/e-documents/preview', async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body.file;
    const xsltFile = body.xsltFile;
    if (!file || typeof file === 'string') return c.json({ error: 'XML dosyası gerekli' }, 400);
    const f = file as File;
    const xml = await f.text();
    let xslt: string | undefined;
    if (xsltFile && typeof xsltFile !== 'string') {
      xslt = await (xsltFile as File).text();
    } else {
      const embeddedMatch = xml.match(/<xsl:(?:stylesheet|transform)[^>]*>[\s\S]*?<\/xsl:(?:stylesheet|transform)>/i);
      if (embeddedMatch) xslt = embeddedMatch[0];
    }
    if (xslt) {
      const result = await transformXmlToHtml(xml, xslt);
      if (result.html) return c.json({ html: result.html });
    }
    const header = extractXmlHeader(xml, f.name);
    const fallbackHtml = buildServerFallbackHtml(header);
    return c.json({ html: fallbackHtml });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Önizleme hatası' }, 500);
  }
});

/** e-documents directory path: e-documents/{gelen|giden|arsiv}/{YYYY}/{MM}/ */
function getEdocumentDirectory(invoiceType: string | undefined, issueDate?: string): string {
  const folder = invoiceType === 'earsiv' ? 'arsiv' : invoiceType === 'gelen' ? 'gelen' : 'giden';
  let year = new Date().getFullYear();
  let month = String(new Date().getMonth() + 1).padStart(2, '0');
  if (issueDate) {
    const d = (issueDate || '').trim();
    const isoMatch = d.match(/^(\d{4})-(\d{1,2})/);
    const trMatch = d.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (isoMatch) {
      year = parseInt(isoMatch[1], 10);
      month = String(parseInt(isoMatch[2], 10)).padStart(2, '0');
    } else if (trMatch) {
      year = parseInt(trMatch[3], 10);
      month = String(parseInt(trMatch[2], 10)).padStart(2, '0');
    }
  }
  return `e-documents/${folder}/${year}/${month}/`;
}

// ========== E-DOCUMENTS UPLOAD (R2 + D1) ==========
app.post('/api/e-documents/upload', async (c) => {
  try {
    if (!c.env.STORAGE) return c.json({ error: 'R2 Storage bulunamadı' }, 500);
    if (!c.env.DB) return c.json({ error: 'Veritabanı bulunamadı' }, 500);
    const body = await c.req.parseBody();
    const file = body.file;
    const xsltFile = body.xsltFile;
    const metadataStr = body.metadata as string | undefined;
    if (!file || typeof file === 'string') return c.json({ error: 'Dosya gerekli' }, 400);

    const meta = metadataStr ? (JSON.parse(metadataStr) as Record<string, unknown>) : {};
    const invoiceType = meta.invoiceType as string | undefined;
    const issueDate = meta.issueDate as string | undefined;
    const directory = getEdocumentDirectory(invoiceType, issueDate);

    const f = file as File;
    const baseName = f.name.replace(/\.[^.]+$/, '');
    const ext = f.name.split('.').pop()?.toLowerCase() || 'xml';
    const safeName = baseName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'file';
    const fileName = `${safeName}.${ext}`;
    const key = `${directory}${fileName}`;

    const buf = await f.arrayBuffer();
    await c.env.STORAGE.put(key, buf, {
      httpMetadata: { contentType: f.type || 'application/xml' },
    });

    if (xsltFile && typeof xsltFile !== 'string') {
      const xf = xsltFile as File;
      const xsltExt = xf.name.split('.').pop()?.toLowerCase() || 'xslt';
      const xsltFileName = `${safeName}.${xsltExt}`;
      const xsltKey = `${directory}${xsltFileName}`;
      const xsltBuf = await xf.arrayBuffer();
      await c.env.STORAGE.put(xsltKey, xsltBuf, {
        httpMetadata: { contentType: xf.type || 'application/xml' },
      });
    }

    const totalPrice = meta.payableAmount != null ? parseFloat(String(meta.payableAmount)) : null;
    const taxValue = meta.taxValue != null ? parseFloat(String(meta.taxValue)) : null;
    const taxRate = meta.taxRate != null ? parseFloat(String(meta.taxRate)) : null;
    const dateNorm = issueDate ? (issueDate.includes('.') ? issueDate.split('.').reverse().join('-') : issueDate) : null;

    const currency = (meta.currency as string) || 'TRY';
    await c.env.DB.prepare(
      `INSERT OR REPLACE INTO e_documents (date, uuid, invoice_no, seller_title, buyer_title, directory, file_name, total_price, tax_value, tax_rate, currency, status, is_deleted, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, datetime('now'))`
    ).bind(
      dateNorm ?? null,
      (meta.uuid as string) ?? null,
      (meta.invoiceId as string) ?? null,
      (meta.supplierName as string) ?? null,
      (meta.customerName as string) ?? null,
      directory,
      fileName,
      totalPrice,
      taxValue,
      taxRate,
      currency
    ).run();

    return c.json({ path: key });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Yükleme hatası' }, 500);
  }
});

// E-Documents - Toplu silme (D1 soft delete + R2 dosya silme)
app.delete('/api/e-documents', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'Veritabanı bulunamadı' }, 500);
    const body = await c.req.json<{ ids?: number[] }>().catch(() => ({}));
    const ids = Array.isArray(body?.ids) ? body.ids.filter((id) => typeof id === 'number' && id > 0) : [];
    if (ids.length === 0) return c.json({ error: 'Geçerli id gerekli' }, 400);
    const placeholders = ids.map(() => '?').join(',');
    const { results } = await c.env.DB.prepare(
      `SELECT directory, file_name FROM e_documents WHERE id IN (${placeholders}) AND is_deleted = 0`
    ).bind(...ids).all();
    const rows = results as { directory: string; file_name: string }[];
    if (c.env.STORAGE && rows.length > 0) {
      for (const r of rows) {
        const dir = (r.directory || '').replace(/\/+$/, '') + '/';
        const xmlKey = dir + r.file_name;
        await c.env.STORAGE.delete(xmlKey);
        const baseName = r.file_name.replace(/\.xml$/i, '');
        await c.env.STORAGE.delete(dir + baseName + '.xslt');
        await c.env.STORAGE.delete(dir + baseName + '.xsl');
      }
    }
    const res = await c.env.DB.prepare(
      `UPDATE e_documents SET is_deleted = 1, status = 0, updated_at = datetime('now') WHERE id IN (${placeholders}) AND is_deleted = 0`
    ).bind(...ids).run();
    return c.json({ deleted: res.meta.changes });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Silme hatası' }, 500);
  }
});

// ========== PRODUCT BRANDS ==========
app.get('/api/product-brands', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const search = (c.req.query('search') || '').trim();
    const page = Math.max(1, parseInt(c.req.query('page') || '1'));
    const limit = Math.min(9999, Math.max(1, parseInt(c.req.query('limit') || '10')));
    const offset = (page - 1) * limit;

    let where = 'WHERE is_deleted = 0';
    const params: (string | number)[] = [];
    if (search) {
      const n = normalizeForSearch(search);
      const pat = `%${n}%`;
      where += ' AND (name LIKE ? OR code LIKE ?)';
      params.push(pat, pat);
    }

    const countRes = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM product_brands ${where}`
    ).bind(...params).first<{ total: number }>();

    const { results } = await c.env.DB.prepare(
      `SELECT id, name, code, slug, image, description, website, country, sort_order, status, created_at
       FROM product_brands ${where}
       ORDER BY sort_order, name LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all();

    return c.json({
      data: results,
      total: countRes?.total ?? 0,
      page,
      limit,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Hata';
    return c.json({ error: message }, 500);
  }
});

app.get('/api/product-brands/next-sort-order', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const row = await c.env.DB.prepare(
      `SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM product_brands WHERE is_deleted = 0`
    ).first<{ next: number }>();
    return c.json({ next: row?.next ?? 1 });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.get('/api/product-brands/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const row = await c.env.DB.prepare(
      `SELECT id, name, code, slug, image, description, website, country, sort_order, status, created_at, updated_at
       FROM product_brands WHERE id = ? AND is_deleted = 0`
    ).bind(id).first();
    if (!row) return c.json({ error: 'Marka bulunamadı' }, 404);
    return c.json(row);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Hata';
    return c.json({ error: message }, 500);
  }
});

app.post('/api/product-brands', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req.json<{
      name: string; code?: string; slug?: string; image?: string;
      description?: string; website?: string; country?: string; sort_order?: number; status?: number;
    }>();
    const name = (body.name || '').trim();
    if (!name) return c.json({ error: 'Marka adı gerekli' }, 400);

    const code = (body.code || name.slice(0, 2).toUpperCase()).trim().slice(0, 3);
    const slug = (body.slug || name.toLowerCase().replace(/\s+/g, '-')).trim();
    const image = body.image?.trim() || null;
    const description = body.description?.trim() || null;
    const website = body.website?.trim() || null;
    const country = body.country?.trim() || null;
    const sort_order = body.sort_order ?? 0;
    const status = body.status ? 1 : 0;

    const existing = await c.env.DB.prepare(
      `SELECT id FROM product_brands WHERE code = ? AND is_deleted = 0`
    ).bind(code).first();
    if (existing) return c.json({ error: 'Bu kod zaten kullanılıyor' }, 409);

    await c.env.DB.prepare(
      `INSERT INTO product_brands (name, code, slug, image, description, website, country, sort_order, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(name, code, slug, image, description, website, country, sort_order, status).run();

    const { results } = await c.env.DB.prepare(
      `SELECT id, name, code, slug, image, description, website, country, sort_order, created_at
       FROM product_brands WHERE id = last_insert_rowid()`
    ).all();
    return c.json(results![0], 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Hata';
    return c.json({ error: message }, 500);
  }
});

app.put('/api/product-brands/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const body = await c.req.json<{
      name?: string; code?: string; slug?: string; image?: string;
      description?: string; website?: string; country?: string; sort_order?: number; status?: number;
    }>();

    const existing = await c.env.DB.prepare(
      `SELECT id FROM product_brands WHERE id = ? AND is_deleted = 0`
    ).bind(id).first();
    if (!existing) return c.json({ error: 'Marka bulunamadı' }, 404);

    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name.trim()); }
    if (body.code !== undefined) { updates.push('code = ?'); values.push(body.code.trim().slice(0, 3)); }
    if (body.slug !== undefined) { updates.push('slug = ?'); values.push(body.slug?.trim() || null); }
    if (body.image !== undefined) { updates.push('image = ?'); values.push(body.image?.trim() || null); }
    if (body.description !== undefined) { updates.push('description = ?'); values.push(body.description?.trim() || null); }
    if (body.website !== undefined) { updates.push('website = ?'); values.push(body.website?.trim() || null); }
    if (body.country !== undefined) { updates.push('country = ?'); values.push(body.country?.trim() || null); }
    if (body.sort_order !== undefined) { updates.push('sort_order = ?'); values.push(body.sort_order); }
    if (body.status !== undefined) { updates.push('status = ?'); values.push(body.status ? 1 : 0); }

    if (updates.length === 0) return c.json({ error: 'Güncellenecek alan yok' }, 400);

    updates.push("updated_at = datetime('now')");
    values.push(id);

    await c.env.DB.prepare(
      `UPDATE product_brands SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run();

    const row = await c.env.DB.prepare(
      `SELECT id, name, code, slug, image, description, website, country, sort_order, status, created_at, updated_at
       FROM product_brands WHERE id = ?`
    ).bind(id).first();
    return c.json(row);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Hata';
    return c.json({ error: message }, 500);
  }
});

app.delete('/api/product-brands/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const res = await c.env.DB.prepare(
      `UPDATE product_brands SET is_deleted = 1, status = 0, updated_at = datetime('now') WHERE id = ? AND is_deleted = 0`
    ).bind(id).run();
    if (res.meta.changes === 0) return c.json({ error: 'Marka bulunamadı' }, 404);
    return c.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Hata';
    return c.json({ error: message }, 500);
  }
});

// ========== PRODUCTS (Ürünler) ==========
app.get('/api/products', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const search = (c.req.query('search') || '').trim();
    const filter_name = (c.req.query('filter_name') || '').trim();
    const filter_sku = (c.req.query('filter_sku') || '').trim();
    const filter_brand_id = c.req.query('filter_brand_id');
    const filter_category_id = c.req.query('filter_category_id');
    const filter_no_image = c.req.query('filter_no_image') === '1';
    const sort_by = (c.req.query('sort_by') || 'sort_order').trim();
    const sort_order = (c.req.query('sort_order') || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const page = Math.max(1, parseInt(c.req.query('page') || '1'));
    const limit = Math.min(9999, Math.max(1, parseInt(c.req.query('limit') || '10')));
    const offset = (page - 1) * limit;
    let where = 'WHERE p.is_deleted = 0';
    const params: (string | number)[] = [];
    if (search) {
      const n = normalizeForSearch(search);
      const pat = `%${n}%`;
      const normName = sqlNormalizeCol('p.name');
      const normSku = sqlNormalizeCol('p.sku');
      const normBarcode = sqlNormalizeCol('p.barcode');
      where += ` AND (${normName} LIKE ? OR ${normSku} LIKE ? OR ${normBarcode} LIKE ?)`;
      params.push(pat, pat, pat);
    }
    if (filter_name) {
      where += ` AND ${sqlNormalizeCol('p.name')} LIKE ?`;
      params.push(`%${normalizeForSearch(filter_name)}%`);
    }
    if (filter_sku) {
      where += ` AND ${sqlNormalizeCol('p.sku')} LIKE ?`;
      params.push(`%${normalizeForSearch(filter_sku)}%`);
    }
    if (filter_brand_id) {
      where += ' AND p.brand_id = ?';
      params.push(Number(filter_brand_id));
    }
    if (filter_category_id) {
      where += ' AND p.category_id = ?';
      params.push(Number(filter_category_id));
    }
    if (filter_no_image) {
      where += " AND (COALESCE(TRIM(p.image), '') = '' OR TRIM(p.image) = '[]')";
    }
    const validSortColumns: Record<string, string> = {
      name: 'p.name',
      sku: 'p.sku',
      brand_name: 'b.name',
      category_name: 'sub.name',
      price: 'p.price',
      sort_order: 'p.sort_order',
    };
    const orderCol = validSortColumns[sort_by] || 'p.sort_order';
    const countRes = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM products p ${where}`
    ).bind(...params).first<{ total: number }>();
    const { results } = await c.env.DB.prepare(
      `SELECT p.id, p.name, p.sku, p.barcode, p.brand_id, p.category_id, p.type_id, p.unit_id, p.currency_id,
       p.price, p.quantity, pp.price as ecommerce_price, pp.currency_id as ecommerce_currency_id, p.image, p.tax_rate, p.supplier_code, p.gtip_code, p.sort_order, p.status,
       p.created_at, p.updated_at,
       b.name as brand_name, b.code as brand_code, b.image as brand_image,
       grp.code as group_code, grp.name as group_name, grp.color as group_color,
       cat.code as category_code, cat.name as category_name, cat.color as category_color,
       CASE WHEN sub.category_id IS NOT NULL AND sub.category_id > 0 THEN sub.code END as subcategory_code,
       CASE WHEN sub.category_id IS NOT NULL AND sub.category_id > 0 THEN sub.name END as subcategory_name,
       CASE WHEN sub.category_id IS NOT NULL AND sub.category_id > 0 THEN sub.color END as subcategory_color,
       t.name as type_name, t.color as type_color, u.name as unit_name, cur.symbol as currency_symbol
       FROM products p
       LEFT JOIN product_brands b ON p.brand_id = b.id AND b.is_deleted = 0
       LEFT JOIN product_categories sub ON p.category_id = sub.id AND sub.is_deleted = 0
       LEFT JOIN product_categories cat ON cat.id = COALESCE(sub.category_id, CASE WHEN sub.group_id IS NOT NULL AND sub.group_id > 0 THEN sub.id END) AND cat.is_deleted = 0
       LEFT JOIN product_categories grp ON grp.id = COALESCE(cat.group_id, sub.group_id, sub.id) AND grp.is_deleted = 0
       LEFT JOIN product_types t ON p.type_id = t.id AND t.is_deleted = 0
       LEFT JOIN product_unit u ON p.unit_id = u.id AND u.is_deleted = 0
       LEFT JOIN product_currencies cur ON p.currency_id = cur.id AND cur.is_deleted = 0
       LEFT JOIN product_prices pp ON pp.product_id = p.id AND pp.price_type_id = 1 AND pp.is_deleted = 0
       ${where} ORDER BY ${orderCol} ${sort_order}, p.id LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all();
    return c.json({ data: results, total: countRes?.total ?? 0, page, limit });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.get('/api/products/next-sort-order', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const row = await c.env.DB.prepare(
      `SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM products WHERE is_deleted = 0`
    ).first<{ next: number }>();
    return c.json({ next: row?.next ?? 1 });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

// Marka + tedarikçi koduna göre ürün ara (fiyat/para birimi otomatik doldurma için)
app.get('/api/products/lookup', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const brand_id = c.req.query('brand_id');
    const supplier_code = (c.req.query('supplier_code') || '').trim();
    if (!brand_id || !supplier_code) return c.json(null);
    const row = await c.env.DB.prepare(
      `SELECT id, price, currency_id FROM products WHERE is_deleted = 0 AND brand_id = ? AND TRIM(supplier_code) = ? LIMIT 1`
    ).bind(Number(brand_id), supplier_code).first<{ id: number; price: unknown; currency_id: unknown }>();
    if (!row) return c.json(null);
    const price = typeof row.price === 'number' ? row.price : parseFloat(String(row.price || 0)) || 0;
    const currency_id = row.currency_id != null ? Number(row.currency_id) : null;
    return c.json({ id: row.id, price, currency_id });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

// Marka için products tablosundaki tedarikçi kodlarını döndür (eşleşme kontrolü için)
app.get('/api/products/supplier-codes', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const brand_id = c.req.query('brand_id');
    if (!brand_id) return c.json({ codes: [] });
    const { results } = await c.env.DB.prepare(
      `SELECT DISTINCT TRIM(supplier_code) as code FROM products WHERE is_deleted = 0 AND brand_id = ? AND supplier_code IS NOT NULL AND TRIM(supplier_code) != ''`
    ).bind(Number(brand_id)).all<{ code: string }>();
    const codes = (results || []).map((r) => String(r.code ?? '').trim()).filter(Boolean);
    return c.json({ codes });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.get('/api/products/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const row = await c.env.DB.prepare(
      `SELECT p.*, pp.price as ecommerce_price, pp.currency_id as ecommerce_currency_id,
       b.name as brand_name, b.code as brand_code, b.image as brand_image,
       grp.code as group_code, grp.name as group_name, grp.color as group_color,
       cat.code as category_code, cat.name as category_name, cat.color as category_color,
       CASE WHEN sub.category_id IS NOT NULL AND sub.category_id > 0 THEN sub.code END as subcategory_code,
       CASE WHEN sub.category_id IS NOT NULL AND sub.category_id > 0 THEN sub.name END as subcategory_name,
       CASE WHEN sub.category_id IS NOT NULL AND sub.category_id > 0 THEN sub.color END as subcategory_color,
       t.name as type_name, t.color as type_color, u.name as unit_name, cur.name as currency_name, cur.symbol as currency_symbol
       FROM products p
       LEFT JOIN product_brands b ON p.brand_id = b.id AND b.is_deleted = 0
       LEFT JOIN product_categories sub ON p.category_id = sub.id AND sub.is_deleted = 0
       LEFT JOIN product_categories cat ON cat.id = COALESCE(sub.category_id, CASE WHEN sub.group_id IS NOT NULL AND sub.group_id > 0 THEN sub.id END) AND cat.is_deleted = 0
       LEFT JOIN product_categories grp ON grp.id = COALESCE(cat.group_id, sub.group_id, sub.id) AND grp.is_deleted = 0
       LEFT JOIN product_types t ON p.type_id = t.id AND t.is_deleted = 0
       LEFT JOIN product_unit u ON p.unit_id = u.id AND u.is_deleted = 0
       LEFT JOIN product_currencies cur ON p.currency_id = cur.id AND cur.is_deleted = 0
       LEFT JOIN product_prices pp ON pp.product_id = p.id AND pp.price_type_id = 1 AND pp.is_deleted = 0
       WHERE p.id = ? AND p.is_deleted = 0`
    ).bind(id).first();
    if (!row) return c.json({ error: 'Ürün bulunamadı' }, 404);
    const { results: pricesRows } = await c.env.DB.prepare(
      `SELECT price_type_id, price, currency_id, status FROM product_prices WHERE product_id = ? AND is_deleted = 0`
    ).bind(id).all<{ price_type_id: number; price: number; currency_id: number | null; status: number }>();
    const prices = (pricesRows ?? []).map((r) => ({
      price_type_id: r.price_type_id,
      price: r.price,
      currency_id: r.currency_id,
      status: r.status ?? 1,
    }));
    return c.json({ ...row, prices });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.post('/api/products', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req.json<{
      name: string; sku?: string; barcode?: string; brand_id?: number; category_id?: number;
      type_id?: number; unit_id?: number; currency_id?: number; price?: number; quantity?: number;
      ecommerce_price?: number; ecommerce_currency_id?: number;
      prices?: { price_type_id: number; price?: number; currency_id?: number | null; status?: number }[];
      image?: string; tax_rate?: number; supplier_code?: string; gtip_code?: string;
      sort_order?: number; status?: number;
    }>();
    const name = (body.name || '').trim();
    if (!name) return c.json({ error: 'Ürün adı gerekli' }, 400);
    const sort_order = body.sort_order ?? 0;
    const status = body.status !== undefined ? (body.status ? 1 : 0) : 1;
    await c.env.DB.prepare(
      `INSERT INTO products (name, sku, barcode, brand_id, category_id, type_id, unit_id, currency_id, price, quantity, image, tax_rate, supplier_code, gtip_code, sort_order, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      name,
      body.sku?.trim() || null,
      body.barcode?.trim() || null,
      body.brand_id || null,
      body.category_id || null,
      body.type_id || null,
      body.unit_id || null,
      body.currency_id || null,
      body.price ?? 0,
      body.quantity ?? 0,
      body.image?.trim() || null,
      body.tax_rate ?? 0,
      body.supplier_code?.trim() || null,
      body.gtip_code?.trim() || null,
      sort_order,
      status
    ).run();
    const productId = (await c.env.DB.prepare(`SELECT last_insert_rowid() as id`).first<{ id: number }>())?.id ?? 0;
    if (productId && body.prices && Array.isArray(body.prices) && body.prices.length > 0) {
      for (const p of body.prices) {
        if (!p.price_type_id) continue;
        const price = p.price ?? 0;
        const currencyId = p.currency_id ?? null;
        const status = p.status !== undefined ? (p.status ? 1 : 0) : 1;
        await c.env.DB.prepare(
          `INSERT INTO product_prices (product_id, price_type_id, price, currency_id, status) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(product_id, price_type_id) DO UPDATE SET price = excluded.price, currency_id = excluded.currency_id, status = excluded.status, updated_at = datetime('now')`
        ).bind(productId, p.price_type_id, price, currencyId, status).run();
      }
    } else if (productId && (body.ecommerce_price != null || body.ecommerce_currency_id != null)) {
      await c.env.DB.prepare(
        `INSERT INTO product_prices (product_id, price_type_id, price, currency_id) VALUES (?, 1, ?, ?)
         ON CONFLICT(product_id, price_type_id) DO UPDATE SET price = excluded.price, currency_id = excluded.currency_id, updated_at = datetime('now')`
      ).bind(productId, body.ecommerce_price ?? 0, body.ecommerce_currency_id || null).run();
    }
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM products WHERE id = ?`
    ).bind(productId).all();
    return c.json(results![0], 201);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.put('/api/products/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const body = await c.req.json<{
      name?: string; sku?: string; barcode?: string; brand_id?: number; category_id?: number;
      type_id?: number; unit_id?: number; currency_id?: number; price?: number; quantity?: number;
      ecommerce_price?: number; ecommerce_currency_id?: number;
      prices?: { price_type_id: number; price?: number; currency_id?: number | null; status?: number }[];
      image?: string; tax_rate?: number; supplier_code?: string; gtip_code?: string;
      sort_order?: number; status?: number;
    }>();
    const existing = await c.env.DB.prepare(`SELECT id FROM products WHERE id = ? AND is_deleted = 0`).bind(id).first();
    if (!existing) return c.json({ error: 'Ürün bulunamadı' }, 404);
    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name.trim()); }
    if (body.sku !== undefined) { updates.push('sku = ?'); values.push(body.sku?.trim() || null); }
    if (body.barcode !== undefined) { updates.push('barcode = ?'); values.push(body.barcode?.trim() || null); }
    if (body.brand_id !== undefined) { updates.push('brand_id = ?'); values.push(body.brand_id || null); }
    if (body.category_id !== undefined) { updates.push('category_id = ?'); values.push(body.category_id || null); }
    if (body.type_id !== undefined) { updates.push('type_id = ?'); values.push(body.type_id || null); }
    if (body.unit_id !== undefined) { updates.push('unit_id = ?'); values.push(body.unit_id || null); }
    if (body.currency_id !== undefined) { updates.push('currency_id = ?'); values.push(body.currency_id || null); }
    if (body.price !== undefined) { updates.push('price = ?'); values.push(body.price); }
    if (body.quantity !== undefined) { updates.push('quantity = ?'); values.push(body.quantity); }
    if (body.image !== undefined) { updates.push('image = ?'); values.push(body.image?.trim() || null); }
    if (body.tax_rate !== undefined) { updates.push('tax_rate = ?'); values.push(body.tax_rate); }
    if (body.supplier_code !== undefined) { updates.push('supplier_code = ?'); values.push(body.supplier_code?.trim() || null); }
    if (body.gtip_code !== undefined) { updates.push('gtip_code = ?'); values.push(body.gtip_code?.trim() || null); }
    if (body.sort_order !== undefined) { updates.push('sort_order = ?'); values.push(body.sort_order); }
    if (body.status !== undefined) { updates.push('status = ?'); values.push(body.status ? 1 : 0); }
    if (updates.length === 0) return c.json({ error: 'Güncellenecek alan yok' }, 400);
    updates.push("updated_at = datetime('now')");
    await c.env.DB.prepare(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`).bind(...values, id).run();
    if (body.prices && Array.isArray(body.prices) && body.prices.length > 0) {
      for (const p of body.prices) {
        const priceTypeId = p.price_type_id;
        if (!priceTypeId) continue;
        const existing = await c.env.DB.prepare(
          `SELECT price, currency_id, status FROM product_prices WHERE product_id = ? AND price_type_id = ? AND is_deleted = 0`
        ).bind(id, priceTypeId).first<{ price: number; currency_id: number | null; status: number }>();
        const price = p.price !== undefined ? p.price : (existing?.price ?? 0);
        const currencyId = p.currency_id !== undefined ? (p.currency_id || null) : (existing?.currency_id ?? null);
        const status = p.status !== undefined ? (p.status ? 1 : 0) : (existing?.status ?? 1);
        await c.env.DB.prepare(
          `INSERT INTO product_prices (product_id, price_type_id, price, currency_id, status) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(product_id, price_type_id) DO UPDATE SET price = excluded.price, currency_id = excluded.currency_id, status = excluded.status, updated_at = datetime('now')`
        ).bind(id, priceTypeId, price, currencyId, status).run();
      }
    } else if (body.ecommerce_price !== undefined || body.ecommerce_currency_id !== undefined) {
      const existing = await c.env.DB.prepare(
        `SELECT price, currency_id FROM product_prices WHERE product_id = ? AND price_type_id = 1 AND is_deleted = 0`
      ).bind(id).first<{ price: number; currency_id: number | null }>();
      const price = body.ecommerce_price !== undefined ? body.ecommerce_price : (existing?.price ?? 0);
      const currencyId = body.ecommerce_currency_id !== undefined ? (body.ecommerce_currency_id || null) : (existing?.currency_id ?? null);
      await c.env.DB.prepare(
        `INSERT INTO product_prices (product_id, price_type_id, price, currency_id) VALUES (?, 1, ?, ?)
         ON CONFLICT(product_id, price_type_id) DO UPDATE SET price = excluded.price, currency_id = excluded.currency_id, updated_at = datetime('now')`
      ).bind(id, price, currencyId).run();
    }
    // Bu ürün bir paket içinde kullanılıyorsa, o paketlerin fiyatlarını yeniden hesapla
    if (body.price !== undefined) {
      const { results: pkgIds } = await c.env.DB.prepare(
        `SELECT DISTINCT product_id FROM product_package_items WHERE item_product_id = ?`
      ).bind(id).all<{ product_id: number }>();
      for (const row of pkgIds ?? []) {
        const pkgId = row.product_id;
        const sumRow = await c.env.DB.prepare(
          `SELECT COALESCE(SUM(p.price * pi.quantity), 0) as total
           FROM product_package_items pi
           JOIN products p ON pi.item_product_id = p.id AND p.is_deleted = 0
           WHERE pi.product_id = ?`
        ).bind(pkgId).first<{ total: number }>();
        const totalPrice = typeof sumRow?.total === 'number' ? sumRow.total : 0;
        await c.env.DB.prepare(`UPDATE products SET price = ? WHERE id = ?`).bind(totalPrice, pkgId).run();
      }
    }
    const row = await c.env.DB.prepare(
      `SELECT p.*, pp.price as ecommerce_price, pp.currency_id as ecommerce_currency_id
       FROM products p
       LEFT JOIN product_prices pp ON pp.product_id = p.id AND pp.price_type_id = 1 AND pp.is_deleted = 0
       WHERE p.id = ?`
    ).bind(id).first();
    return c.json(row ?? {});
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.delete('/api/products/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const res = await c.env.DB.prepare(
      `UPDATE products SET is_deleted = 1, status = 0, updated_at = datetime('now') WHERE id = ? AND is_deleted = 0`
    ).bind(id).run();
    if (res.meta.changes === 0) return c.json({ error: 'Ürün bulunamadı' }, 404);
    return c.json({ success: true });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

// ========== PRODUCT PACKAGE ITEMS (Paket İçeriği) ==========
app.post('/api/products/:id/recalculate-package-price', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const productExists = await c.env.DB.prepare(`SELECT id FROM products WHERE id = ? AND is_deleted = 0`).bind(id).first();
    if (!productExists) return c.json({ error: 'Ürün bulunamadı' }, 404);
    const sumRow = await c.env.DB.prepare(
      `SELECT COALESCE(SUM(p.price * pi.quantity), 0) as total
       FROM product_package_items pi
       JOIN products p ON pi.item_product_id = p.id AND p.is_deleted = 0
       WHERE pi.product_id = ?`
    ).bind(id).first<{ total: number }>();
    const totalPrice = typeof sumRow?.total === 'number' ? sumRow.total : 0;
    await c.env.DB.prepare(`UPDATE products SET price = ? WHERE id = ?`).bind(totalPrice, id).run();
    return c.json({ price: totalPrice });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.get('/api/products/:id/package-items', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const { results } = await c.env.DB.prepare(
      `SELECT pi.id, pi.product_id, pi.item_product_id, pi.quantity, pi.sort_order,
       p.name as item_name, p.sku as item_sku, p.price as item_price
       FROM product_package_items pi
       LEFT JOIN products p ON pi.item_product_id = p.id AND p.is_deleted = 0
       WHERE pi.product_id = ?
       ORDER BY pi.sort_order, pi.id`
    ).bind(id).all();
    return c.json({ data: results ?? [] });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.put('/api/products/:id/package-items', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const body = await c.req.json<{ items: { item_product_id: number; quantity: number }[] }>();
    const items = body.items ?? [];
    const productExists = await c.env.DB.prepare(`SELECT id FROM products WHERE id = ? AND is_deleted = 0`).bind(id).first();
    if (!productExists) return c.json({ error: 'Ürün bulunamadı' }, 404);
    await c.env.DB.prepare(`DELETE FROM product_package_items WHERE product_id = ?`).bind(id).run();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it?.item_product_id || it.quantity <= 0) continue;
      await c.env.DB.prepare(
        `INSERT INTO product_package_items (product_id, item_product_id, quantity, sort_order)
         VALUES (?, ?, ?, ?)`
      ).bind(id, it.item_product_id, it.quantity, i).run();
    }
    // Paket fiyatı = içerikteki ürünlerin (fiyat * adet) toplamı
    const sumRow = await c.env.DB.prepare(
      `SELECT COALESCE(SUM(p.price * pi.quantity), 0) as total
       FROM product_package_items pi
       JOIN products p ON pi.item_product_id = p.id AND p.is_deleted = 0
       WHERE pi.product_id = ?`
    ).bind(id).first<{ total: number }>();
    const totalPrice = typeof sumRow?.total === 'number' ? sumRow.total : 0;
    await c.env.DB.prepare(`UPDATE products SET price = ? WHERE id = ?`).bind(totalPrice, id).run();
    const { results } = await c.env.DB.prepare(
      `SELECT pi.id, pi.product_id, pi.item_product_id, pi.quantity, pi.sort_order,
       p.name as item_name, p.sku as item_sku, p.price as item_price
       FROM product_package_items pi
       LEFT JOIN products p ON pi.item_product_id = p.id AND p.is_deleted = 0
       WHERE pi.product_id = ?
       ORDER BY pi.sort_order, pi.id`
    ).bind(id).all();
    return c.json({ data: results ?? [], calculatedPrice: totalPrice });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

// ========== PRODUCT UNITS (Birimler) ==========
app.get('/api/product-units', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const search = (c.req.query('search') || '').trim();
    const page = Math.max(1, parseInt(c.req.query('page') || '1'));
    const limit = Math.min(9999, Math.max(1, parseInt(c.req.query('limit') || '10')));
    const offset = (page - 1) * limit;
    let where = 'WHERE is_deleted = 0 AND status = 1';
    const params: (string | number)[] = [];
    if (search) {
      const n = normalizeForSearch(search);
      const pat = `%${n}%`;
      where += ' AND (name LIKE ? OR code LIKE ?)';
      params.push(pat, pat);
    }
    const countRes = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM product_unit ${where}`
    ).bind(...params).first<{ total: number }>();
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, code, description, sort_order, status, created_at FROM product_unit ${where}
       ORDER BY sort_order, name LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all();
    return c.json({ data: results, total: countRes?.total ?? 0, page, limit });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.get('/api/product-units/next-sort-order', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const row = await c.env.DB.prepare(
      `SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM product_unit WHERE is_deleted = 0`
    ).first<{ next: number }>();
    return c.json({ next: row?.next ?? 1 });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.post('/api/product-units', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req.json<{ name: string; code?: string; description?: string; sort_order?: number; status?: number }>();
    const name = (body.name || '').trim();
    if (!name) return c.json({ error: 'Birim adı gerekli' }, 400);
    const code = (body.code || name.slice(0, 2).toUpperCase()).trim();
    const description = body.description?.trim() || null;
    const sort_order = body.sort_order ?? 0;
    const status = body.status !== undefined ? (body.status ? 1 : 0) : 1;
    const existing = await c.env.DB.prepare(
      `SELECT id FROM product_unit WHERE code = ? AND is_deleted = 0`
    ).bind(code).first();
    if (existing) return c.json({ error: 'Bu kod zaten kullanılıyor' }, 409);
    await c.env.DB.prepare(
      `INSERT INTO product_unit (name, code, description, sort_order, status) VALUES (?, ?, ?, ?, ?)`
    ).bind(name, code, description, sort_order, status).run();
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, code, description, sort_order, status, created_at FROM product_unit WHERE id = last_insert_rowid()`
    ).all();
    return c.json(results![0], 201);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.put('/api/product-units/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const body = await c.req.json<{ name?: string; code?: string; description?: string; sort_order?: number; status?: number }>();
    const existing = await c.env.DB.prepare(`SELECT id FROM product_unit WHERE id = ? AND is_deleted = 0`).bind(id).first();
    if (!existing) return c.json({ error: 'Birim bulunamadı' }, 404);
    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name.trim()); }
    if (body.code !== undefined) { updates.push('code = ?'); values.push(body.code.trim()); }
    if (body.description !== undefined) { updates.push('description = ?'); values.push(body.description?.trim() || null); }
    if (body.sort_order !== undefined) { updates.push('sort_order = ?'); values.push(body.sort_order); }
    if (body.status !== undefined) { updates.push('status = ?'); values.push(body.status ? 1 : 0); }
    if (updates.length === 0) return c.json({ error: 'Güncellenecek alan yok' }, 400);
    updates.push("updated_at = datetime('now')");
    values.push(id);
    await c.env.DB.prepare(`UPDATE product_unit SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    const row = await c.env.DB.prepare(
      `SELECT id, name, code, description, sort_order, status, created_at, updated_at FROM product_unit WHERE id = ?`
    ).bind(id).first();
    return c.json(row);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.delete('/api/product-units/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const res = await c.env.DB.prepare(
      `UPDATE product_unit SET is_deleted = 1, status = 0, updated_at = datetime('now') WHERE id = ? AND is_deleted = 0`
    ).bind(id).run();
    if (res.meta.changes === 0) return c.json({ error: 'Birim bulunamadı' }, 404);
    return c.json({ success: true });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

// ========== PRODUCT TYPES (Ürün Tipleri) ==========
app.get('/api/product-types', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const search = (c.req.query('search') || '').trim();
    const page = Math.max(1, parseInt(c.req.query('page') || '1'));
    const limit = Math.min(9999, Math.max(1, parseInt(c.req.query('limit') || '10')));
    const offset = (page - 1) * limit;
    let where = 'WHERE is_deleted = 0 AND status = 1';
    const params: (string | number)[] = [];
    if (search) {
      const n = normalizeForSearch(search);
      const pat = `%${n}%`;
      where += ' AND (name LIKE ? OR code LIKE ?)';
      params.push(pat, pat);
    }
    const countRes = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM product_types ${where}`
    ).bind(...params).first<{ total: number }>();
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, code, description, color, sort_order, status, created_at FROM product_types ${where}
       ORDER BY sort_order, name LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all();
    return c.json({ data: results, total: countRes?.total ?? 0, page, limit });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.get('/api/product-types/next-sort-order', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const row = await c.env.DB.prepare(
      `SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM product_types WHERE is_deleted = 0`
    ).first<{ next: number }>();
    return c.json({ next: row?.next ?? 1 });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.post('/api/product-types', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req.json<{ name: string; code?: string; description?: string; color?: string; sort_order?: number; status?: number }>();
    const name = (body.name || '').trim();
    if (!name) return c.json({ error: 'Ürün tipi adı gerekli' }, 400);
    const code = (body.code || name.slice(0, 2).toUpperCase()).trim();
    const description = body.description?.trim() || null;
    const sort_order = body.sort_order ?? 0;
    const status = body.status !== undefined ? (body.status ? 1 : 0) : 1;
    const existing = await c.env.DB.prepare(
      `SELECT id FROM product_types WHERE code = ? AND is_deleted = 0`
    ).bind(code).first();
    if (existing) return c.json({ error: 'Bu kod zaten kullanılıyor' }, 409);
    const color = body.color?.trim() || null;
    await c.env.DB.prepare(
      `INSERT INTO product_types (name, code, description, color, sort_order, status) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(name, code, description, color, sort_order, status).run();
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, code, description, color, sort_order, status, created_at FROM product_types WHERE id = last_insert_rowid()`
    ).all();
    return c.json(results![0], 201);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.put('/api/product-types/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const body = await c.req.json<{ name?: string; code?: string; description?: string; color?: string; sort_order?: number; status?: number }>();
    const existing = await c.env.DB.prepare(`SELECT id FROM product_types WHERE id = ? AND is_deleted = 0`).bind(id).first();
    if (!existing) return c.json({ error: 'Ürün tipi bulunamadı' }, 404);
    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name.trim()); }
    if (body.code !== undefined) { updates.push('code = ?'); values.push(body.code.trim()); }
    if (body.description !== undefined) { updates.push('description = ?'); values.push(body.description?.trim() || null); }
    if (body.color !== undefined) { updates.push('color = ?'); values.push(body.color?.trim() || null); }
    if (body.sort_order !== undefined) { updates.push('sort_order = ?'); values.push(body.sort_order); }
    if (body.status !== undefined) { updates.push('status = ?'); values.push(body.status ? 1 : 0); }
    if (updates.length === 0) return c.json({ error: 'Güncellenecek alan yok' }, 400);
    updates.push("updated_at = datetime('now')");
    values.push(id);
    await c.env.DB.prepare(`UPDATE product_types SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    const row = await c.env.DB.prepare(
      `SELECT id, name, code, description, color, sort_order, status, created_at, updated_at FROM product_types WHERE id = ?`
    ).bind(id).first();
    return c.json(row);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.delete('/api/product-types/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const res = await c.env.DB.prepare(
      `UPDATE product_types SET is_deleted = 1, status = 0, updated_at = datetime('now') WHERE id = ? AND is_deleted = 0`
    ).bind(id).run();
    if (res.meta.changes === 0) return c.json({ error: 'Ürün tipi bulunamadı' }, 404);
    return c.json({ success: true });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

// ========== PRODUCT CURRENCIES (Para Birimleri) ==========
app.get('/api/product-currencies', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const search = (c.req.query('search') || '').trim();
    const page = Math.max(1, parseInt(c.req.query('page') || '1'));
    const limit = Math.min(9999, Math.max(1, parseInt(c.req.query('limit') || '10')));
    const offset = (page - 1) * limit;
    let where = 'WHERE is_deleted = 0 AND status = 1';
    const params: (string | number)[] = [];
    if (search) {
      const n = normalizeForSearch(search);
      const pat = `%${n}%`;
      where += ' AND (name LIKE ? OR code LIKE ? OR symbol LIKE ?)';
      params.push(pat, pat, pat);
    }
    const countRes = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM product_currencies ${where}`
    ).bind(...params).first<{ total: number }>();
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, code, symbol, is_default, sort_order, status, created_at FROM product_currencies ${where}
       ORDER BY is_default DESC, sort_order, name LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all();
    return c.json({ data: results, total: countRes?.total ?? 0, page, limit });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.get('/api/product-currencies/next-sort-order', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const row = await c.env.DB.prepare(
      `SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM product_currencies WHERE is_deleted = 0`
    ).first<{ next: number }>();
    return c.json({ next: row?.next ?? 1 });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.post('/api/product-currencies', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req.json<{ name: string; code?: string; symbol?: string; is_default?: number; sort_order?: number; status?: number }>();
    const name = (body.name || '').trim();
    if (!name) return c.json({ error: 'Para birimi adı gerekli' }, 400);
    const code = (body.code || name.slice(0, 3).toUpperCase()).trim();
    const symbol = body.symbol?.trim() || null;
    const is_default = body.is_default ? 1 : 0;
    const sort_order = body.sort_order ?? 0;
    const status = body.status !== undefined ? (body.status ? 1 : 0) : 1;
    const existing = await c.env.DB.prepare(
      `SELECT id FROM product_currencies WHERE code = ? AND is_deleted = 0`
    ).bind(code).first();
    if (existing) return c.json({ error: 'Bu kod zaten kullanılıyor' }, 409);
    if (is_default) {
      await c.env.DB.prepare(`UPDATE product_currencies SET is_default = 0 WHERE is_deleted = 0`).run();
    }
    await c.env.DB.prepare(
      `INSERT INTO product_currencies (name, code, symbol, is_default, sort_order, status) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(name, code, symbol, is_default, sort_order, status).run();
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, code, symbol, is_default, sort_order, status, created_at FROM product_currencies WHERE id = last_insert_rowid()`
    ).all();
    return c.json(results![0], 201);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.put('/api/product-currencies/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const body = await c.req.json<{ name?: string; code?: string; symbol?: string; is_default?: number; sort_order?: number; status?: number }>();
    const existing = await c.env.DB.prepare(`SELECT id FROM product_currencies WHERE id = ? AND is_deleted = 0`).bind(id).first();
    if (!existing) return c.json({ error: 'Para birimi bulunamadı' }, 404);
    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name.trim()); }
    if (body.code !== undefined) { updates.push('code = ?'); values.push(body.code.trim()); }
    if (body.symbol !== undefined) { updates.push('symbol = ?'); values.push(body.symbol?.trim() || null); }
    if (body.is_default !== undefined) {
      updates.push('is_default = ?');
      values.push(body.is_default ? 1 : 0);
      if (body.is_default) {
        await c.env.DB.prepare(`UPDATE product_currencies SET is_default = 0 WHERE id != ? AND is_deleted = 0`).bind(id).run();
      }
    }
    if (body.sort_order !== undefined) { updates.push('sort_order = ?'); values.push(body.sort_order); }
    if (body.status !== undefined) { updates.push('status = ?'); values.push(body.status ? 1 : 0); }
    if (updates.length === 0) return c.json({ error: 'Güncellenecek alan yok' }, 400);
    updates.push("updated_at = datetime('now')");
    values.push(id);
    await c.env.DB.prepare(`UPDATE product_currencies SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    const row = await c.env.DB.prepare(
      `SELECT id, name, code, symbol, is_default, sort_order, status, created_at, updated_at FROM product_currencies WHERE id = ?`
    ).bind(id).first();
    return c.json(row);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.delete('/api/product-currencies/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const res = await c.env.DB.prepare(
      `UPDATE product_currencies SET is_deleted = 1, status = 0, updated_at = datetime('now') WHERE id = ? AND is_deleted = 0`
    ).bind(id).run();
    if (res.meta.changes === 0) return c.json({ error: 'Para birimi bulunamadı' }, 404);
    return c.json({ success: true });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

// ========== PRODUCT PRICE TYPES (Fiyat Tipleri) ==========
app.get('/api/product-price-types', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const search = (c.req.query('search') || '').trim();
    const page = Math.max(1, parseInt(c.req.query('page') || '1'));
    const limit = Math.min(9999, Math.max(1, parseInt(c.req.query('limit') || '10')));
    const offset = (page - 1) * limit;
    let where = 'WHERE is_deleted = 0 AND status = 1';
    const params: (string | number)[] = [];
    if (search) {
      const n = normalizeForSearch(search);
      const pat = `%${n}%`;
      where += ' AND (name LIKE ? OR code LIKE ?)';
      params.push(pat, pat);
    }
    const countRes = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM product_price_types ${where}`
    ).bind(...params).first<{ total: number }>();
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, code, sort_order, status, created_at FROM product_price_types ${where}
       ORDER BY sort_order, name LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all();
    return c.json({ data: results, total: countRes?.total ?? 0, page, limit });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.get('/api/product-price-types/next-sort-order', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const row = await c.env.DB.prepare(
      `SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM product_price_types WHERE is_deleted = 0`
    ).first<{ next: number }>();
    return c.json({ next: row?.next ?? 1 });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.post('/api/product-price-types', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req.json<{ name: string; code?: string; sort_order?: number; status?: number }>();
    const name = (body.name || '').trim();
    if (!name) return c.json({ error: 'Fiyat tipi adı gerekli' }, 400);
    const code = (body.code || name.slice(0, 2).toUpperCase()).trim();
    const sort_order = body.sort_order ?? 0;
    const status = body.status !== undefined ? (body.status ? 1 : 0) : 1;
    const existing = await c.env.DB.prepare(
      `SELECT id FROM product_price_types WHERE code = ? AND is_deleted = 0`
    ).bind(code).first();
    if (existing) return c.json({ error: 'Bu kod zaten kullanılıyor' }, 409);
    await c.env.DB.prepare(
      `INSERT INTO product_price_types (name, code, sort_order, status) VALUES (?, ?, ?, ?)`
    ).bind(name, code, sort_order, status).run();
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, code, sort_order, status, created_at FROM product_price_types WHERE id = last_insert_rowid()`
    ).all();
    return c.json(results![0], 201);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.put('/api/product-price-types/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const body = await c.req.json<{ name?: string; code?: string; sort_order?: number; status?: number }>();
    const existing = await c.env.DB.prepare(`SELECT id FROM product_price_types WHERE id = ? AND is_deleted = 0`).bind(id).first();
    if (!existing) return c.json({ error: 'Fiyat tipi bulunamadı' }, 404);
    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name.trim()); }
    if (body.code !== undefined) { updates.push('code = ?'); values.push(body.code.trim()); }
    if (body.sort_order !== undefined) { updates.push('sort_order = ?'); values.push(body.sort_order); }
    if (body.status !== undefined) { updates.push('status = ?'); values.push(body.status ? 1 : 0); }
    if (updates.length === 0) return c.json({ error: 'Güncellenecek alan yok' }, 400);
    updates.push("updated_at = datetime('now')");
    values.push(id);
    await c.env.DB.prepare(`UPDATE product_price_types SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    const row = await c.env.DB.prepare(
      `SELECT id, name, code, sort_order, status, created_at, updated_at FROM product_price_types WHERE id = ?`
    ).bind(id).first();
    return c.json(row);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.delete('/api/product-price-types/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    if (id === '1') return c.json({ error: 'Varsayılan E-Ticaret fiyat tipi silinemez' }, 400);
    const res = await c.env.DB.prepare(
      `UPDATE product_price_types SET is_deleted = 1, status = 0, updated_at = datetime('now') WHERE id = ? AND is_deleted = 0`
    ).bind(id).run();
    if (res.meta.changes === 0) return c.json({ error: 'Fiyat tipi bulunamadı' }, 404);
    return c.json({ success: true });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

// ========== PRODUCT TAX RATES (Vergi Oranları) ==========
app.get('/api/product-tax-rates', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const search = (c.req.query('search') || '').trim();
    const page = Math.max(1, parseInt(c.req.query('page') || '1'));
    const limit = Math.min(9999, Math.max(1, parseInt(c.req.query('limit') || '10')));
    const offset = (page - 1) * limit;
    let where = 'WHERE is_deleted = 0 AND status = 1';
    const params: (string | number)[] = [];
    if (search) {
      const n = normalizeForSearch(search);
      const pat = `%${n}%`;
      where += ' AND (name LIKE ? OR description LIKE ?)';
      params.push(pat, pat);
    }
    const countRes = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM product_tax_rates ${where}`
    ).bind(...params).first<{ total: number }>();
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, value, description, sort_order, status, created_at FROM product_tax_rates ${where}
       ORDER BY sort_order, name LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all();
    return c.json({ data: results, total: countRes?.total ?? 0, page, limit });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.get('/api/product-tax-rates/next-sort-order', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const row = await c.env.DB.prepare(
      `SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM product_tax_rates WHERE is_deleted = 0`
    ).first<{ next: number }>();
    return c.json({ next: row?.next ?? 1 });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.post('/api/product-tax-rates', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req.json<{ name: string; value?: number; description?: string; sort_order?: number; status?: number }>();
    const name = (body.name || '').trim();
    if (!name) return c.json({ error: 'Vergi oranı adı gerekli' }, 400);
    const value = body.value ?? 0;
    const description = body.description?.trim() || null;
    const sort_order = body.sort_order ?? 0;
    const status = body.status !== undefined ? (body.status ? 1 : 0) : 1;
    await c.env.DB.prepare(
      `INSERT INTO product_tax_rates (name, value, description, sort_order, status) VALUES (?, ?, ?, ?, ?)`
    ).bind(name, value, description, sort_order, status).run();
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, value, description, sort_order, status, created_at FROM product_tax_rates WHERE id = last_insert_rowid()`
    ).all();
    return c.json(results![0], 201);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.put('/api/product-tax-rates/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const body = await c.req.json<{ name?: string; value?: number; description?: string; sort_order?: number; status?: number }>();
    const existing = await c.env.DB.prepare(`SELECT id FROM product_tax_rates WHERE id = ? AND is_deleted = 0`).bind(id).first();
    if (!existing) return c.json({ error: 'Vergi oranı bulunamadı' }, 404);
    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name.trim()); }
    if (body.value !== undefined) { updates.push('value = ?'); values.push(body.value); }
    if (body.description !== undefined) { updates.push('description = ?'); values.push(body.description?.trim() || null); }
    if (body.sort_order !== undefined) { updates.push('sort_order = ?'); values.push(body.sort_order); }
    if (body.status !== undefined) { updates.push('status = ?'); values.push(body.status ? 1 : 0); }
    if (updates.length === 0) return c.json({ error: 'Güncellenecek alan yok' }, 400);
    updates.push("updated_at = datetime('now')");
    values.push(id);
    await c.env.DB.prepare(`UPDATE product_tax_rates SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    const row = await c.env.DB.prepare(
      `SELECT id, name, value, description, sort_order, status, created_at, updated_at FROM product_tax_rates WHERE id = ?`
    ).bind(id).first();
    return c.json(row);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.delete('/api/product-tax-rates/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const res = await c.env.DB.prepare(
      `UPDATE product_tax_rates SET is_deleted = 1, status = 0, updated_at = datetime('now') WHERE id = ? AND is_deleted = 0`
    ).bind(id).run();
    if (res.meta.changes === 0) return c.json({ error: 'Vergi oranı bulunamadı' }, 404);
    return c.json({ success: true });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

// ========== CUSTOMER TYPES (Müşteri Tipleri) ==========
app.get('/api/customer-types', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const search = (c.req.query('search') || '').trim();
    const page = Math.max(1, parseInt(c.req.query('page') || '1'));
    const limit = Math.min(9999, Math.max(1, parseInt(c.req.query('limit') || '10')));
    const offset = (page - 1) * limit;
    let where = 'WHERE is_deleted = 0 AND status = 1';
    const params: (string | number)[] = [];
    if (search) {
      const n = normalizeForSearch(search);
      const pat = `%${n}%`;
      where += ' AND (name LIKE ? OR code LIKE ? OR description LIKE ?)';
      params.push(pat, pat, pat);
    }
    const countRes = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM customer_types ${where}`
    ).bind(...params).first<{ total: number }>();
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, code, description, color, sort_order, status, created_at FROM customer_types ${where}
       ORDER BY sort_order, name LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all();
    return c.json({ data: results, total: countRes?.total ?? 0, page, limit });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.get('/api/customer-types/next-sort-order', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const row = await c.env.DB.prepare(
      `SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM customer_types WHERE is_deleted = 0`
    ).first<{ next: number }>();
    return c.json({ next: row?.next ?? 1 });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.post('/api/customer-types', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req.json<{ name: string; code?: string; description?: string; color?: string; sort_order?: number; status?: number }>();
    const name = (body.name || '').trim();
    if (!name) return c.json({ error: 'Müşteri tipi adı gerekli' }, 400);
    const code = (body.code || name.slice(0, 2).toUpperCase()).trim();
    const description = body.description?.trim() || null;
    const sort_order = body.sort_order ?? 0;
    const status = body.status !== undefined ? (body.status ? 1 : 0) : 1;
    const existing = await c.env.DB.prepare(
      `SELECT id FROM customer_types WHERE code = ? AND is_deleted = 0`
    ).bind(code).first();
    if (existing) return c.json({ error: 'Bu kod zaten kullanılıyor' }, 409);
    const color = body.color?.trim() || null;
    await c.env.DB.prepare(
      `INSERT INTO customer_types (name, code, description, color, sort_order, status) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(name, code, description, color, sort_order, status).run();
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, code, description, color, sort_order, status, created_at FROM customer_types WHERE id = last_insert_rowid()`
    ).all();
    return c.json(results![0], 201);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.put('/api/customer-types/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const body = await c.req.json<{ name?: string; code?: string; description?: string; color?: string; sort_order?: number; status?: number }>();
    const existing = await c.env.DB.prepare(`SELECT id FROM customer_types WHERE id = ? AND is_deleted = 0`).bind(id).first();
    if (!existing) return c.json({ error: 'Müşteri tipi bulunamadı' }, 404);
    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name.trim()); }
    if (body.code !== undefined) { updates.push('code = ?'); values.push(body.code.trim()); }
    if (body.description !== undefined) { updates.push('description = ?'); values.push(body.description?.trim() || null); }
    if (body.color !== undefined) { updates.push('color = ?'); values.push(body.color?.trim() || null); }
    if (body.sort_order !== undefined) { updates.push('sort_order = ?'); values.push(body.sort_order); }
    if (body.status !== undefined) { updates.push('status = ?'); values.push(body.status ? 1 : 0); }
    if (updates.length === 0) return c.json({ error: 'Güncellenecek alan yok' }, 400);
    updates.push("updated_at = datetime('now')");
    values.push(id);
    await c.env.DB.prepare(`UPDATE customer_types SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    const row = await c.env.DB.prepare(
      `SELECT id, name, code, description, color, sort_order, status, created_at, updated_at FROM customer_types WHERE id = ?`
    ).bind(id).first();
    return c.json(row);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.delete('/api/customer-types/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const res = await c.env.DB.prepare(
      `UPDATE customer_types SET is_deleted = 1, status = 0, updated_at = datetime('now') WHERE id = ? AND is_deleted = 0`
    ).bind(id).run();
    if (res.meta.changes === 0) return c.json({ error: 'Müşteri tipi bulunamadı' }, 404);
    return c.json({ success: true });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

// ========== COMMON TAX OFFICES (Vergi Daireleri) ==========
app.get('/api/common-tax-offices', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const search = (c.req.query('search') || '').trim();
    const page = Math.max(1, parseInt(c.req.query('page') || '1'));
    const limit = Math.min(9999, Math.max(1, parseInt(c.req.query('limit') || '10')));
    const offset = (page - 1) * limit;
    let where = 'WHERE is_deleted = 0 AND status = 1';
    const params: (string | number)[] = [];
    if (search) {
      const n = normalizeForSearch(search);
      const pat = `%${n}%`;
      where += ' AND (name LIKE ? OR code LIKE ? OR city LIKE ?)';
      params.push(pat, pat, pat);
    }
    const countRes = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM common_tax_offices ${where}`
    ).bind(...params).first<{ total: number }>();
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, code, city, description, sort_order, status, created_at FROM common_tax_offices ${where}
       ORDER BY city, sort_order, name LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all();
    return c.json({ data: results, total: countRes?.total ?? 0, page, limit });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.get('/api/common-tax-offices/next-sort-order', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const row = await c.env.DB.prepare(
      `SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM common_tax_offices WHERE is_deleted = 0`
    ).first<{ next: number }>();
    return c.json({ next: row?.next ?? 1 });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.post('/api/common-tax-offices', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req.json<{ name: string; code?: string; city?: string; description?: string; sort_order?: number; status?: number }>();
    const name = (body.name || '').trim();
    if (!name) return c.json({ error: 'Vergi dairesi adı gerekli' }, 400);
    const code = (body.code || name.slice(0, 3).toUpperCase()).trim();
    const city = body.city?.trim() || null;
    const description = body.description?.trim() || null;
    const sort_order = body.sort_order ?? 0;
    const status = body.status !== undefined ? (body.status ? 1 : 0) : 1;
    const existing = await c.env.DB.prepare(
      `SELECT id FROM common_tax_offices WHERE code = ? AND is_deleted = 0`
    ).bind(code).first();
    if (existing) return c.json({ error: 'Bu kod zaten kullanılıyor' }, 409);
    await c.env.DB.prepare(
      `INSERT INTO common_tax_offices (name, code, city, description, sort_order, status) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(name, code, city, description, sort_order, status).run();
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, code, city, description, sort_order, status, created_at FROM common_tax_offices WHERE id = last_insert_rowid()`
    ).all();
    return c.json(results![0], 201);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.put('/api/common-tax-offices/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const body = await c.req.json<{ name?: string; code?: string; city?: string; description?: string; sort_order?: number; status?: number }>();
    const existing = await c.env.DB.prepare(`SELECT id FROM common_tax_offices WHERE id = ? AND is_deleted = 0`).bind(id).first();
    if (!existing) return c.json({ error: 'Vergi dairesi bulunamadı' }, 404);
    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name.trim()); }
    if (body.code !== undefined) { updates.push('code = ?'); values.push(body.code.trim()); }
    if (body.city !== undefined) { updates.push('city = ?'); values.push(body.city?.trim() || null); }
    if (body.description !== undefined) { updates.push('description = ?'); values.push(body.description?.trim() || null); }
    if (body.sort_order !== undefined) { updates.push('sort_order = ?'); values.push(body.sort_order); }
    if (body.status !== undefined) { updates.push('status = ?'); values.push(body.status ? 1 : 0); }
    if (updates.length === 0) return c.json({ error: 'Güncellenecek alan yok' }, 400);
    updates.push("updated_at = datetime('now')");
    values.push(id);
    await c.env.DB.prepare(`UPDATE common_tax_offices SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    const row = await c.env.DB.prepare(
      `SELECT id, name, code, city, description, sort_order, status, created_at, updated_at FROM common_tax_offices WHERE id = ?`
    ).bind(id).first();
    return c.json(row);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.delete('/api/common-tax-offices/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const res = await c.env.DB.prepare(
      `UPDATE common_tax_offices SET is_deleted = 1, status = 0, updated_at = datetime('now') WHERE id = ? AND is_deleted = 0`
    ).bind(id).run();
    if (res.meta.changes === 0) return c.json({ error: 'Vergi dairesi bulunamadı' }, 404);
    return c.json({ success: true });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

// ========== PRODUCT CATEGORIES (Kategoriler + Gruplar: group_id=0) ==========
app.get('/api/product-categories', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const search = (c.req.query('search') || '').trim();
    const groupId = c.req.query('group_id');
    const categoryId = c.req.query('category_id');
    const page = Math.max(1, parseInt(c.req.query('page') || '1'));
    const limit = Math.min(9999, Math.max(1, parseInt(c.req.query('limit') || '10')));
    const offset = (page - 1) * limit;
    let where = 'WHERE is_deleted = 0 AND (status = 1 OR status IS NULL)';
    const params: (string | number)[] = [];
    if (search) {
      const n = normalizeForSearch(search);
      const pat = `%${n}%`;
      where += ' AND (name LIKE ? OR code LIKE ?)';
      params.push(pat, pat);
    }
    if (groupId !== undefined && groupId !== '') {
      const gid = parseInt(groupId);
      if (gid === 0) {
        where += ' AND (group_id IS NULL OR group_id = 0)';
      } else {
        where += ' AND group_id = ?';
        params.push(gid);
      }
    }
    if (categoryId !== undefined && categoryId !== '') {
      const cid = parseInt(categoryId);
      if (categoryId === 'null' || categoryId === '' || Number.isNaN(cid)) {
        where += ' AND category_id IS NULL';
      } else if (cid === 0) {
        where += ' AND (category_id IS NULL OR category_id = 0)';
      } else {
        where += ' AND category_id = ?';
        params.push(cid);
      }
    }
    const countRes = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM product_categories ${where}`
    ).bind(...params).first<{ total: number }>();
    const { results } = await c.env.DB.prepare(
      `SELECT id, group_id, category_id, name, code, slug, description, image, icon, color, sort_order, status, created_at
       FROM product_categories ${where} ORDER BY sort_order, name LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all();
    return c.json({ data: results, total: countRes?.total ?? 0, page, limit });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.get('/api/product-categories/next-sort-order', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const groupId = c.req.query('group_id');
    let where = 'WHERE is_deleted = 0';
    const params: (string | number)[] = [];
    if (groupId !== undefined && groupId !== '') {
      const gid = parseInt(groupId);
      if (gid === 0) {
        where += ' AND (group_id IS NULL OR group_id = 0)';
      } else {
        where += ' AND group_id = ?';
        params.push(gid);
      }
    }
    const row = await c.env.DB.prepare(
      `SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM product_categories ${where}`
    ).bind(...params).first<{ next: number }>();
    return c.json({ next: row?.next ?? 1 });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.post('/api/product-categories', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req.json<{
      name: string; code?: string; slug?: string; group_id?: number; category_id?: number;
      description?: string; image?: string; icon?: string; color?: string; sort_order?: number; status?: number;
    }>();
    const name = (body.name || '').trim();
    if (!name) return c.json({ error: 'Kategori adı gerekli' }, 400);
    const code = (body.code || name.slice(0, 2).toUpperCase()).trim();
    const slug = body.slug?.trim() || name.toLowerCase().replace(/\s+/g, '-');
    const group_id = (body.group_id === null || body.group_id === undefined) ? null : Number(body.group_id);
    const category_id = (body.category_id === null || body.category_id === undefined) ? null : Number(body.category_id);
    const description = body.description?.trim() || null;
    const image = body.image?.trim() || null;
    const icon = body.icon?.trim() || null;
    const color = body.color?.trim() || null;
    const sort_order = body.sort_order ?? 0;
    const status = body.status !== undefined ? (body.status ? 1 : 0) : 1;
    await c.env.DB.prepare(
      `INSERT INTO product_categories (name, code, slug, group_id, category_id, description, image, icon, color, sort_order, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(name, code, slug, group_id, category_id, description, image, icon, color, sort_order, status).run();
    const { results } = await c.env.DB.prepare(
      `SELECT id, group_id, category_id, name, code, slug, description, image, icon, color, sort_order, status, created_at
       FROM product_categories WHERE id = last_insert_rowid()`
    ).all();
    return c.json(results![0], 201);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.put('/api/product-categories/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const body = await c.req.json<{
      name?: string; code?: string; slug?: string; group_id?: number; category_id?: number;
      description?: string; image?: string; icon?: string; color?: string; sort_order?: number; status?: number;
    }>();
    const existing = await c.env.DB.prepare(`SELECT id FROM product_categories WHERE id = ? AND is_deleted = 0`).bind(id).first();
    if (!existing) return c.json({ error: 'Kategori bulunamadı' }, 404);
    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name.trim()); }
    if (body.code !== undefined) { updates.push('code = ?'); values.push(body.code.trim()); }
    if (body.slug !== undefined) { updates.push('slug = ?'); values.push(body.slug?.trim() || null); }
    if (body.group_id !== undefined) {
      updates.push('group_id = ?');
      values.push((body.group_id === null || body.group_id === undefined) ? null : Number(body.group_id));
    }
    if (body.category_id !== undefined) {
      updates.push('category_id = ?');
      values.push((body.category_id === null || body.category_id === undefined) ? null : Number(body.category_id));
    }
    if (body.description !== undefined) { updates.push('description = ?'); values.push(body.description?.trim() || null); }
    if (body.image !== undefined) { updates.push('image = ?'); values.push(body.image?.trim() || null); }
    if (body.icon !== undefined) { updates.push('icon = ?'); values.push(body.icon?.trim() || null); }
    if (body.color !== undefined) { updates.push('color = ?'); values.push(body.color?.trim() || null); }
    if (body.sort_order !== undefined) { updates.push('sort_order = ?'); values.push(body.sort_order); }
    if (body.status !== undefined) { updates.push('status = ?'); values.push(body.status ? 1 : 0); }
    if (updates.length === 0) return c.json({ error: 'Güncellenecek alan yok' }, 400);
    updates.push("updated_at = datetime('now')");
    values.push(id);
    await c.env.DB.prepare(`UPDATE product_categories SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    const row = await c.env.DB.prepare(
      `SELECT id, group_id, category_id, name, code, slug, description, image, icon, color, sort_order, status, created_at, updated_at
       FROM product_categories WHERE id = ?`
    ).bind(id).first();
    return c.json(row);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.delete('/api/product-categories/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const res = await c.env.DB.prepare(
      `UPDATE product_categories SET is_deleted = 1, status = 0, updated_at = datetime('now') WHERE id = ? AND is_deleted = 0`
    ).bind(id).run();
    if (res.meta.changes === 0) return c.json({ error: 'Kategori bulunamadı' }, 404);
    return c.json({ success: true });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

// ========== SUPPLIERS (Tedarikçiler) ==========
app.get('/api/suppliers', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const search = (c.req.query('search') || '').trim();
    const brand_id = c.req.query('brand_id');
    const page = Math.max(1, parseInt(c.req.query('page') || '1'));
    const limit = Math.min(9999, Math.max(1, parseInt(c.req.query('limit') || '100')));
    const offset = (page - 1) * limit;
    let where = 'WHERE s.is_deleted = 0 AND (s.status = 1 OR s.status IS NULL)';
    const params: (string | number)[] = [];
    if (search) {
      where += ' AND s.name LIKE ?';
      params.push(`%${normalizeForSearch(search)}%`);
    }
    if (brand_id) {
      where += ' AND s.brand_id = ?';
      params.push(Number(brand_id));
    }
    const countRes = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM suppliers s ${where}`
    ).bind(...params).first<{ total: number }>();
    const { results } = await c.env.DB.prepare(
      `SELECT s.id, s.name, s.brand_id, s.source_type, s.currency_id, s.source_file, s.header_row,
       s.record_count, s.column_mappings, s.column_types, s.sort_order, s.status, s.created_at,
       b.name as brand_name, cur.symbol as currency_symbol
       FROM suppliers s
       LEFT JOIN product_brands b ON s.brand_id = b.id AND b.is_deleted = 0
       LEFT JOIN product_currencies cur ON s.currency_id = cur.id AND cur.is_deleted = 0
       ${where} ORDER BY s.sort_order, s.name LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all();
    return c.json({ data: results, total: countRes?.total ?? 0, page, limit });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.get('/api/suppliers/next-sort-order', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const row = await c.env.DB.prepare(
      `SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM suppliers WHERE is_deleted = 0`
    ).first<{ next: number }>();
    return c.json({ next: row?.next ?? 1 });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.get('/api/suppliers/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const row = await c.env.DB.prepare(
      `SELECT s.*, b.name as brand_name, cur.symbol as currency_symbol
       FROM suppliers s
       LEFT JOIN product_brands b ON s.brand_id = b.id AND b.is_deleted = 0
       LEFT JOIN product_currencies cur ON s.currency_id = cur.id AND cur.is_deleted = 0
       WHERE s.id = ? AND s.is_deleted = 0`
    ).bind(id).first();
    if (!row) return c.json({ error: 'Tedarikçi bulunamadı' }, 404);
    return c.json(row);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.post('/api/suppliers', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req.json<{
      name: string; brand_id?: number; source_type?: string; currency_id?: number;
      source_file?: string; header_row?: number; record_count?: number;
      column_mappings?: string; column_types?: string; sort_order?: number; status?: number;
    }>();
    const name = (body.name || '').trim();
    if (!name) return c.json({ error: 'Tedarikçi adı gerekli' }, 400);
    const brand_id = body.brand_id ?? null;
    const source_type = (body.source_type || 'excel').trim();
    const currency_id = body.currency_id ?? null;
    const source_file = body.source_file?.trim() || null;
    const header_row = body.header_row != null ? Math.max(1, Number(body.header_row) || 1) : 1;
    const record_count = body.record_count ?? 0;
    const column_mappings = body.column_mappings?.trim() || null;
    const column_types = body.column_types?.trim() || null;
    const sort_order = body.sort_order ?? 0;
    const status = body.status !== undefined ? (body.status ? 1 : 0) : 1;
    await c.env.DB.prepare(
      `INSERT INTO suppliers (name, brand_id, source_type, currency_id, source_file, header_row, record_count, column_mappings, column_types, sort_order, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(name, brand_id, source_type, currency_id, source_file, header_row, record_count, column_mappings, column_types, sort_order, status).run();
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM suppliers WHERE id = last_insert_rowid()`
    ).all();
    return c.json(results![0], 201);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.put('/api/suppliers/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const body = await c.req.json<{
      name?: string; brand_id?: number; source_type?: string; currency_id?: number;
      source_file?: string; header_row?: number; record_count?: number;
      column_mappings?: string; column_types?: string; sort_order?: number; status?: number;
    }>();
    const existing = await c.env.DB.prepare(`SELECT id FROM suppliers WHERE id = ? AND is_deleted = 0`).bind(id).first();
    if (!existing) return c.json({ error: 'Tedarikçi bulunamadı' }, 404);
    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name.trim()); }
    if (body.brand_id !== undefined) { updates.push('brand_id = ?'); values.push(body.brand_id ?? null); }
    if (body.source_type !== undefined) { updates.push('source_type = ?'); values.push(body.source_type?.trim() || 'excel'); }
    if (body.currency_id !== undefined) { updates.push('currency_id = ?'); values.push(body.currency_id ?? null); }
    if (body.source_file !== undefined) { updates.push('source_file = ?'); values.push(body.source_file?.trim() || null); }
    if (body.header_row !== undefined) { updates.push('header_row = ?'); values.push(Math.max(1, Number(body.header_row) || 1)); }
    if (body.record_count !== undefined) { updates.push('record_count = ?'); values.push(body.record_count); }
    if (body.column_mappings !== undefined) { updates.push('column_mappings = ?'); values.push(body.column_mappings?.trim() || null); }
    if (body.column_types !== undefined) { updates.push('column_types = ?'); values.push(body.column_types?.trim() || null); }
    if (body.sort_order !== undefined) { updates.push('sort_order = ?'); values.push(body.sort_order); }
    if (body.status !== undefined) { updates.push('status = ?'); values.push(body.status ? 1 : 0); }
    if (updates.length === 0) return c.json({ error: 'Güncellenecek alan yok' }, 400);
    updates.push("updated_at = datetime('now')");
    values.push(id);
    await c.env.DB.prepare(`UPDATE suppliers SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    const row = await c.env.DB.prepare(
      `SELECT * FROM suppliers WHERE id = ?`
    ).bind(id).first();
    return c.json(row);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.delete('/api/suppliers/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const res = await c.env.DB.prepare(
      `UPDATE suppliers SET is_deleted = 1, status = 0, updated_at = datetime('now') WHERE id = ? AND is_deleted = 0`
    ).bind(id).run();
    if (res.meta.changes === 0) return c.json({ error: 'Tedarikçi bulunamadı' }, 404);
    return c.json({ success: true });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

// R2 Storage - Yeni klasör oluştur (mevcut prefix altında)
app.put('/storage/folder', async (c) => {
  try {
    if (!c.env.STORAGE) {
      return c.json({ error: 'R2 Storage bağlantısı bulunamadı!' }, 500);
    }

    const body = await c.req.json<{ path: string; name?: string }>();
    const { path, name } = body;
    const prefix = (path || '').replace(/\/+$/, '');
    const folderName = (name || '').trim().toLowerCase().replace(/\s+/g, '-');
    if (!folderName) {
      return c.json({ error: 'Klasör adı gerekli' }, 400);
    }

    const fullPath = prefix ? `${prefix}/${folderName}/` : `${folderName}/`;
    await c.env.STORAGE.put(fullPath, new Uint8Array(0), {
      httpMetadata: { contentType: 'application/x-directory' },
    });

    return c.json({ path: fullPath }, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return c.json({ error: message }, 500);
  }
});

// R2 Storage - Verilen key'lerden hangileri mevcut kontrol et
app.post('/storage/check-keys', async (c) => {
  try {
    if (!c.env.STORAGE) return c.json({ existing: [] });
    const body = await c.req.json<{ keys: string[] }>();
    const keys = Array.isArray(body?.keys) ? body.keys.filter((k) => typeof k === 'string' && k.trim()) : [];
    const existing: string[] = [];
    for (const key of keys) {
      const obj = await c.env.STORAGE.get(key.trim());
      if (obj) existing.push(key.trim());
    }
    return c.json({ existing });
  } catch {
    return c.json({ existing: [] });
  }
});

// R2 Storage - Dosya yükle
// preserveFilename=true: İkonlar klasörü için - orijinal dosya adı korunur (boyut/format işlemleri client'ta uygulanır)
app.post('/storage/upload', async (c) => {
  try {
    if (!c.env.STORAGE) return c.json({ error: 'R2 Storage bulunamadı' }, 500);
    const body = await c.req.parseBody();
    const file = body.file;
    let folder = ((body.folder as string) || 'images/').trim() || 'images/';
    if (!folder.endsWith('/')) folder = `${folder}/`;
    const preserveFilename = body.preserveFilename === 'true';
    if (!file || typeof file === 'string') return c.json({ error: 'Dosya gerekli' }, 400);

    const f = file as File;
    const ext = f.name.split('.').pop()?.toLowerCase() || 'png';
    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
    const docExts = ['xlsx', 'xls', 'xml', 'csv', 'xslt', 'xsl'];
    const isSupplierFolder = (folder as string).startsWith('supplier-files');
    const isEdocumentsFolder = (folder as string).startsWith('e-documents');
    const safeExt = imageExts.includes(ext)
      ? ext
      : ((isSupplierFolder || isEdocumentsFolder) && docExts.includes(ext)
        ? ext
        : 'png');

    let key: string;
    if (preserveFilename || isSupplierFolder) {
      const baseName = f.name.replace(/\.[^.]+$/, '');
      const safeName = baseName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'file';
      const finalName = `${safeName}.${safeExt}`;
      key = `${(folder as string).replace(/\/+$/, '')}/${finalName}`;
    } else {
      key = `${folder.replace(/\/+$/, '')}/${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`;
    }

    const buf = await f.arrayBuffer();
    await c.env.STORAGE.put(key, buf, {
      httpMetadata: { contentType: f.type || `image/${safeExt}` },
    });

    return c.json({ path: key });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Yükleme hatası' }, 500);
  }
});

// R2 Storage - images/ altındaki PNG dosyalarını images/products/ altına taşı
app.post('/storage/migrate-images-to-products', async (c) => {
  try {
    if (!c.env.STORAGE) return c.json({ error: 'R2 Storage bulunamadı' }, 500);
    const moved: string[] = [];
    const errors: { key: string; error: string }[] = [];
    let cursor: string | undefined;
    const rootPngPattern = /^images\/[^/]+\.png$/i;

    do {
      const listOpts: { prefix: string; limit: number; cursor?: string } = { prefix: 'images/', limit: 1000 };
      if (cursor) listOpts.cursor = cursor;
      const listed = await c.env.STORAGE.list(listOpts);

      for (const obj of listed.objects) {
        if (!rootPngPattern.test(obj.key)) continue;
        try {
          const data = await c.env.STORAGE.get(obj.key);
          if (!data) {
            errors.push({ key: obj.key, error: 'Dosya okunamadı' });
            continue;
          }
          const buf = await data.arrayBuffer();
          const newKey = `images/products/${obj.key.replace(/^images\//, '')}`;
          await c.env.STORAGE.put(newKey, buf, {
            httpMetadata: data.httpMetadata ? { contentType: data.httpMetadata.contentType } : undefined,
          });
          await c.env.STORAGE.delete(obj.key);
          moved.push(`${obj.key} → ${newKey}`);
        } catch (err) {
          errors.push({ key: obj.key, error: err instanceof Error ? err.message : String(err) });
        }
      }

      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);

    return c.json({ moved: moved.length, movedKeys: moved, errors });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Taşıma hatası' }, 500);
  }
});

// R2 Storage - Dosya kopyala
app.post('/storage/copy', async (c) => {
  try {
    if (!c.env.STORAGE) return c.json({ error: 'R2 Storage bulunamadı' }, 500);
    const body = await c.req.json<{ from: string; to: string }>();
    const { from, to } = body;
    if (!from?.trim() || !to?.trim()) return c.json({ error: 'from ve to gerekli' }, 400);
    const obj = await c.env.STORAGE.get(from.trim());
    if (!obj) return c.json({ error: 'Kaynak dosya bulunamadı' }, 404);
    const buf = await obj.arrayBuffer();
    await c.env.STORAGE.put(to.trim(), buf, {
      httpMetadata: obj.httpMetadata ? { contentType: obj.httpMetadata.contentType } : undefined,
    });
    return c.json({ ok: true, key: to.trim() });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Kopyalama hatası' }, 500);
  }
});

// R2 Storage - Dosya taşı (kopyala + sil)
app.post('/storage/move', async (c) => {
  try {
    if (!c.env.STORAGE) return c.json({ error: 'R2 Storage bulunamadı' }, 500);
    const body = await c.req.json<{ from: string; to: string }>();
    const { from, to } = body;
    if (!from?.trim() || !to?.trim()) return c.json({ error: 'from ve to gerekli' }, 400);
    const obj = await c.env.STORAGE.get(from.trim());
    if (!obj) return c.json({ error: 'Kaynak dosya bulunamadı' }, 404);
    const buf = await obj.arrayBuffer();
    await c.env.STORAGE.put(to.trim(), buf, {
      httpMetadata: obj.httpMetadata ? { contentType: obj.httpMetadata.contentType } : undefined,
    });
    await c.env.STORAGE.delete(from.trim());
    return c.json({ ok: true, key: to.trim() });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Taşıma hatası' }, 500);
  }
});

// R2 Storage - Dosya sil (eski görsel değiştirildiğinde)
app.delete('/storage/delete', async (c) => {
  try {
    if (!c.env.STORAGE) return c.json({ error: 'R2 Storage bulunamadı' }, 500);
    const key = c.req.query('key');
    if (!key) return c.json({ error: 'key gerekli' }, 400);
    await c.env.STORAGE.delete(key);
    return c.json({ ok: true });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Silme hatası' }, 500);
  }
});

// R2 Storage - Dosya sun (görsel gösterimi için)
app.get('/storage/serve', async (c) => {
  try {
    if (!c.env.STORAGE) return c.json({ error: 'R2 Storage bulunamadı' }, 500);
    const key = (c.req.query('key') || '').trim();
    if (!key) return c.json({ error: 'key gerekli' }, 400);

    const obj = await c.env.STORAGE.get(key);
    if (!obj) {
      return c.json({ error: 'Dosya bulunamadı' }, 404, {
        'Cache-Control': 'no-store',
      });
    }

    const ct = obj.httpMetadata?.contentType || 'image/png';
    return new Response(obj.body, {
      headers: {
        'Content-Type': ct,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

// ========== MYSQL TEST (Veri Aktarımı) ==========
app.post('/api/mysql/test', async (c) => {
  try {
    const body = await c.req.json<{
      host: string;
      port?: number;
      database: string;
      user: string;
      password: string;
    }>();
    const { host, database, user, password } = body;
    const port = body.port ?? 3306;

    if (!host?.trim() || !database?.trim() || !user?.trim()) {
      return c.json(
        { error: 'Host, veritabanı ve kullanıcı adı gerekli' },
        400,
      );
    }

    const connection = await createConnection({
      host: host.trim(),
      port: Number(port) || 3306,
      database: database.trim(),
      user: user.trim(),
      password: password ?? '',
      charset: 'utf8mb4',
      connectTimeout: 10000,
      enableKeepAlive: false,
      disableEval: true, // Cloudflare Workers uyumluluğu
    } as Parameters<typeof createConnection>[0]);

    try {
      const conn = connection as unknown as { execute: (sql: string) => Promise<[unknown[]]> };
      const [rows] = await conn.execute('SHOW TABLES');
      const tables = (rows as Record<string, unknown>[]).map((r) =>
        String(Object.values(r)[0] ?? ''),
      ).filter(Boolean);
      return c.json({ tables, ok: true });
    } finally {
      await connection.end();
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg, ok: false }, 500);
  }
});

// ========== MYSQL (Veri Aktarımı - kayıtlı config ile) ==========
async function getMysqlConfig(c: { env: Bindings }): Promise<Record<string, string> | null> {
  if (!c.env.DB) return null;
  const { results } = await c.env.DB.prepare(
    `SELECT key, value FROM app_settings WHERE category = 'mysql' AND is_deleted = 0 AND status = 1`
  ).all();
  const config: Record<string, string> = {};
  for (const r of results as { key: string; value: string | null }[]) {
    if (r.key) config[r.key] = r.value ?? '';
  }
  return config.host && config.database && config.user ? config : null;
}

async function createMysqlConnection(config: Record<string, string>) {
  return createConnection({
    host: (config.host || '').trim(),
    port: parseInt(config.port || '3306') || 3306,
    database: (config.database || '').trim(),
    user: (config.user || '').trim(),
    password: config.password ?? '',
    charset: 'utf8mb4',
    connectTimeout: 10000,
    enableKeepAlive: false,
    disableEval: true,
  } as Parameters<typeof createConnection>[0]);
}

app.get('/api/mysql/tables', async (c) => {
  try {
    const config = await getMysqlConfig(c);
    if (!config) return c.json({ error: 'MySQL bağlantı ayarları Ayarlar sekmesinden yapılandırılmalı' }, 400);
    const connection = await createMysqlConnection(config);
    try {
      const conn = connection as unknown as { execute: (sql: string) => Promise<[unknown[]]> };
      const [rows] = await conn.execute('SHOW TABLES');
      const tables = (rows as Record<string, unknown>[]).map((r) => String(Object.values(r)[0] ?? '')).filter(Boolean);
      return c.json({ tables });
    } finally {
      await connection.end();
    }
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

app.get('/api/mysql/columns/:table', async (c) => {
  try {
    const table = c.req.param('table');
    if (!table) return c.json({ error: 'Tablo gerekli' }, 400);
    const config = await getMysqlConfig(c);
    if (!config) return c.json({ error: 'MySQL bağlantı ayarları yapılandırılmalı' }, 400);
    const connection = await createMysqlConnection(config);
    try {
      const conn = connection as unknown as { execute: (sql: string) => Promise<[unknown[]]> };
      const [rows] = await conn.execute(`SHOW COLUMNS FROM \`${table.replace(/`/g, '')}\``);
      const cols = (rows as { Field: string; Type: string }[]).map((r) => ({ name: r.Field, type: r.Type }));
      return c.json({ columns: cols });
    } finally {
      await connection.end();
    }
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

app.get('/api/mysql/table-data/:table', async (c) => {
  try {
    const table = c.req.param('table');
    const limit = Math.min(parseInt(c.req.query('limit') || '2000') || 2000, 5000);
    if (!table) return c.json({ error: 'Tablo gerekli' }, 400);
    const config = await getMysqlConfig(c);
    if (!config) return c.json({ error: 'MySQL bağlantı ayarları yapılandırılmalı' }, 400);
    const connection = await createMysqlConnection(config);
    try {
      const conn = connection as unknown as { execute: (sql: string, values?: unknown[]) => Promise<[unknown[]]> };
      const [rows] = await conn.execute(`SELECT * FROM \`${table.replace(/`/g, '')}\` LIMIT ?`, [limit]);
      return c.json({ rows: rows as Record<string, unknown>[] });
    } finally {
      await connection.end();
    }
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

app.get('/api/d1/tables', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'D1 bulunamadı' }, 500);
    const { results } = await c.env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'd1_%' ORDER BY name"
    ).all();
    const tables = (results as { name: string }[]).map((r) => r.name);
    return c.json({ tables });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

app.get('/api/d1/columns/:table', async (c) => {
  try {
    const table = c.req.param('table');
    if (!table || !c.env.DB) return c.json({ error: 'Tablo veya D1 bulunamadı' }, 400);
    const { results } = await c.env.DB.prepare(`PRAGMA table_info("${table.replace(/"/g, '""')}")`).all();
    const cols = (results as { name: string; type: string }[]).map((r) => ({ name: r.name, type: r.type }));
    return c.json({ columns: cols });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

/** D1 tablo satır sayısı - canlı ortamda veri kontrolü için */
app.get('/api/d1/table-count/:table', async (c) => {
  try {
    const table = c.req.param('table');
    if (!table || !c.env.DB) return c.json({ error: 'Tablo veya D1 bulunamadı' }, 400);
    const safe = `"${table.replace(/"/g, '""')}"`;
    const r = await c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM ${safe}`).first();
    const count = (r as { cnt: number } | null)?.cnt ?? 0;
    return c.json({ table, count });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

/** Worker'ın gördüğü D1 durumu - Dashboard ile karşılaştırma için */
app.get('/api/d1/debug', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'D1 bulunamadı' }, 500);
    const tables = ['product_brands', 'product_categories', 'product_types', 'product_currencies', 'product_unit', 'customer_types', 'common_tax_offices', 'app_settings', 'suppliers'];
    const counts: Record<string, number> = {};
    for (const t of tables) {
      try {
        const r = await c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM "${t.replace(/"/g, '""')}"`).first();
        counts[t] = (r as { cnt: number } | null)?.cnt ?? 0;
      } catch {
        counts[t] = -1;
      }
    }
    return c.json({ message: "Worker'ın bağlı olduğu D1'den okunan değerler", counts });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

/** product_categories tablosunu boşalt, id'leri 1'den başlat */
app.post('/api/d1/reset-product-categories', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    await c.env.DB.prepare('DELETE FROM product_categories').run();
    await c.env.DB.prepare("DELETE FROM sqlite_sequence WHERE name='product_categories'").run();
    return c.json({ ok: true, message: 'product_categories tablosu sıfırlandı. Yeni kayıtlar id=1\'den başlayacak.' });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

/** D1 yazma testi - product_unit'a test satırı ekleyip hemen okuyor */
app.get('/api/d1/test-write', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'D1 bulunamadı' }, 500);
    const before = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM product_unit').first();
    const beforeCount = (before as { cnt: number } | null)?.cnt ?? 0;
    await c.env.DB.prepare(
      "INSERT INTO product_unit (name, code, description, sort_order, status) VALUES ('TEST-WRITE', 'TW', 'D1 yazma testi', 0, 1)"
    ).run();
    const after = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM product_unit').first();
    const afterCount = (after as { cnt: number } | null)?.cnt ?? 0;
    return c.json({
      ok: true,
      beforeCount,
      afterCount,
      writeWorked: afterCount === beforeCount + 1,
    });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

/** MySQL tinyint/string/boolean -> D1 INTEGER 0/1 dönüşümü (status, is_deleted vb.) */
function transformBoolColumn(value: unknown, targetCol: string): unknown {
  const col = targetCol.toLowerCase();
  if (col !== 'status' && col !== 'is_deleted') return value ?? null;
  if (value === null || value === undefined) return col === 'status' ? 1 : 0;
  if (typeof value === 'number') return value ? 1 : 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') {
    const v = value.toLowerCase().trim();
    if (v === '1' || v === 'active' || v === 'true' || v === 'yes' || v === 'on') return 1;
    return 0;
  }
  return Number(value) ? 1 : 0;
}

/** D1'de mevcut FK referansları - geçersiz olanları null yapar (product_categories group_id, category_id vb.) */
async function getValidFkIds(db: D1Database, table: string, idCol: string): Promise<Set<number>> {
  try {
    const { results } = await db.prepare(`SELECT "${idCol.replace(/"/g, '""')}" FROM "${table.replace(/"/g, '""')}"`).all();
    const ids = new Set<number>();
    for (const r of results as Record<string, unknown>[]) {
      const v = r[idCol];
      if (v != null && typeof v === 'number' && !Number.isNaN(v)) ids.add(v);
    }
    return ids;
  } catch {
    return new Set();
  }
}

/** Batch aktarım - client'tan gelen satırları işler (gerçek ilerleme için) */
app.post('/api/transfer/execute-batch', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req.json<{
      targetTable: string;
      columnMapping: Record<string, string>;
      rows: Record<string, unknown>[];
    }>();
    const { targetTable, columnMapping, rows } = body;
    if (!targetTable || !columnMapping || !Array.isArray(rows)) {
      return c.json({ error: 'targetTable, columnMapping, rows gerekli' }, 400);
    }
    const entries = Object.entries(columnMapping).filter(([, t]) => t);
    if (entries.length === 0) return c.json({ error: 'Sütun eşleştirmesi gerekli' }, 400);

    const transformValue = (row: Record<string, unknown>, s: string, t: string, rowIndex: number): unknown => {
      const val = row[s];
      const v = transformBoolColumn(val, t);
      const col = t.toLowerCase();
      if (col === 'code') {
        const str = String(v ?? '').trim();
        if (!str) {
          const nameVal = Object.entries(row).find(([k]) => /name|title|label/i.test(k))?.[1];
          const fromName = nameVal ? String(nameVal).trim().slice(0, 4).toUpperCase().replace(/\W/g, '') : '';
          return fromName ? `${fromName}${rowIndex}` : `C${rowIndex}`;
        }
        return str;
      }
      if (/^(name|category_name|title|label)$/.test(col)) {
        const str = String(v ?? '').trim();
        return str || 'Unnamed';
      }
      return v ?? null;
    };

    const targetCols = entries.map(([, t]) => t);
    const hasId = targetCols.some((col) => String(col).toLowerCase() === 'id');
    const safeTable = `"${targetTable.replace(/"/g, '""')}"`;
    const NOT_NULL_DEFAULTS: Record<string, (i: number) => unknown> = {
      name: () => 'Unnamed',
      category_name: () => 'Unnamed',
      title: () => 'Unnamed',
      label: () => 'Unnamed',
      code: (i) => `C${i}`,
      category_code: (i) => `C${i}`,
    };
    const isProductTable = /^product_(brands|units|groups|categories)$/.test(targetTable.replace(/"/g, ''));
    const requiredCols = isProductTable ? ['name', 'code'] : [];
    const missingRequired = requiredCols.filter(
      (col) => !targetCols.some((t) => String(t).toLowerCase() === col)
    );
    const allTargetCols = [...targetCols];
    const allEntries = [...entries];
    for (const col of missingRequired) {
      allTargetCols.push(col);
      allEntries.push([col, col]);
    }
    const finalColList = allTargetCols.map((col) => `"${String(col).replace(/"/g, '""')}"`).join(', ');
    const finalPlaceholders = allTargetCols.map(() => '?').join(', ');
    const safeTableFinal = safeTable;

    let inserted = 0;
    let updated = 0;
    const isAppSettings = targetTable === 'app_settings';

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      let values = allEntries.map(([s, t]) => {
        if (missingRequired.includes(String(t).toLowerCase())) {
          const def = NOT_NULL_DEFAULTS[String(t).toLowerCase()];
          return def ? def(rowIndex) : 'Unnamed';
        }
        return transformValue(row, s, t, rowIndex);
      });
      values = values.map((v, i) => {
        const col = String(allTargetCols[i]).toLowerCase();
        const def = NOT_NULL_DEFAULTS[col];
        if (def != null && (v == null || (typeof v === 'string' && !v.trim()))) return def(rowIndex);
        return v;
      });

      if (isAppSettings) {
        const catIdx = allTargetCols.findIndex((col) => String(col).toLowerCase() === 'category');
        const keyIdx = allTargetCols.findIndex((col) => String(col).toLowerCase() === 'key');
        const cat = (catIdx >= 0 ? values[catIdx] : null) ?? '';
        const k = (keyIdx >= 0 ? values[keyIdx] : null) ?? '';
        if (!String(cat).trim() || !String(k).trim()) continue;
        const existing = await c.env.DB.prepare(
          `SELECT id FROM app_settings WHERE category = ? AND "key" = ? AND is_deleted = 0`
        ).bind(String(cat).trim(), String(k).trim()).first();
        const valIdx = allTargetCols.findIndex((col) => String(col).toLowerCase() === 'value');
        const val = valIdx >= 0 ? values[valIdx] : '';
        if (existing) {
          await c.env.DB.prepare(
            `UPDATE app_settings SET value = ?, updated_at = datetime('now') WHERE id = ?`
          ).bind(val ?? '', (existing as { id: number }).id).run();
          updated++;
        } else {
          await c.env.DB.prepare(
            `INSERT INTO app_settings (category, "key", value) VALUES (?, ?, ?)`
          ).bind(String(cat).trim(), String(k).trim(), val ?? '').run();
          inserted++;
        }
        continue;
      }

      if (hasId) {
        const idIdx = allTargetCols.findIndex((col) => String(col).toLowerCase() === 'id');
        const idVal = values[idIdx];
        const existing = await c.env.DB.prepare(
          `SELECT 1 FROM ${safeTableFinal} WHERE id = ?`
        ).bind(idVal).first();
        const updateCols = allTargetCols.filter(
          (col) => { const l = String(col).toLowerCase(); return l !== 'id' && l !== 'updated_at'; }
        );
        const updateSet = updateCols
          .map((col) => `"${String(col).replace(/"/g, '""')}" = excluded."${String(col).replace(/"/g, '""')}"`)
          .join(', ');
        const setClause = updateSet ? `${updateSet}, "updated_at" = datetime('now')` : `"updated_at" = datetime('now')`;
        await c.env.DB.prepare(
          `INSERT INTO ${safeTableFinal} (${finalColList}) VALUES (${finalPlaceholders}) ON CONFLICT(id) DO UPDATE SET ${setClause}`
        ).bind(...values).run();
        if (existing) updated++;
        else inserted++;
      } else {
        const upsertCol = 'code';
        const colIdx = allTargetCols.findIndex((col) => String(col).toLowerCase() === upsertCol);
        const hasUpsertCol = colIdx >= 0;
        const upsertVal = hasUpsertCol ? values[colIdx] : null;
        let existing: { id: number } | null = null;
        if (hasUpsertCol && upsertVal != null && String(upsertVal).trim()) {
          existing = await c.env.DB.prepare(
            `SELECT id FROM ${safeTableFinal} WHERE "${upsertCol.replace(/"/g, '""')}" = ? AND is_deleted = 0`
          ).bind(String(upsertVal).trim()).first() as { id: number } | null;
        }
        if (existing) {
          const updateCols = allTargetCols.filter(
            (col) => { const l = String(col).toLowerCase(); return l !== 'id' && l !== 'created_at'; }
          );
          const updateSet = updateCols
            .map((col) => `"${String(col).replace(/"/g, '""')}" = ?`)
            .join(', ');
          const updateValues = updateCols.map((col) => values[allTargetCols.indexOf(col)]);
          await c.env.DB.prepare(
            `UPDATE ${safeTableFinal} SET ${updateSet}, "updated_at" = datetime('now') WHERE id = ?`
          ).bind(...updateValues, existing.id).run();
          updated++;
        } else {
          await c.env.DB.prepare(`INSERT INTO ${safeTableFinal} (${finalColList}) VALUES (${finalPlaceholders})`).bind(...values).run();
          inserted++;
        }
      }
    }
    return c.json({ ok: true, inserted, updated, total: rows.length });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

app.post('/api/transfer/execute', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'D1 bulunamadı' }, 500);
    const body = await c.req.json<{
      sourceTable: string;
      targetTable: string;
      columnMapping: Record<string, string>;
      selectedIndices: number[];
    }>();
    const { sourceTable, targetTable, columnMapping, selectedIndices } = body;
    if (!sourceTable || !targetTable || !columnMapping || !Array.isArray(selectedIndices)) {
      return c.json({ error: 'sourceTable, targetTable, columnMapping, selectedIndices gerekli' }, 400);
    }
    const config = await getMysqlConfig(c);
    if (!config) return c.json({ error: 'MySQL bağlantı ayarları yapılandırılmalı' }, 400);

    const connection = await createMysqlConnection(config);
    try {
      const conn = connection as unknown as { execute: (sql: string, values?: unknown[]) => Promise<[unknown[]]> };
      const [rows] = await conn.execute(`SELECT * FROM \`${sourceTable.replace(/`/g, '')}\``);
      const allRows = rows as Record<string, unknown>[];
      const selected = selectedIndices.filter((i: number) => i >= 0 && i < allRows.length).map((i) => allRows[i]);

      // columnMapping: { sourceCol: targetCol }
      const entries = Object.entries(columnMapping).filter(([, t]) => t);
      if (entries.length === 0) return c.json({ error: 'Sütun eşleştirmesi gerekli' }, 400);

      const transformValue = (row: Record<string, unknown>, s: string, t: string, rowIndex: number): unknown => {
        const val = row[s];
        const v = transformBoolColumn(val, t);
        const col = t.toLowerCase();
        // NOT NULL sütunlar: code, name boşsa varsayılan ver
        if (col === 'code') {
          const str = String(v ?? '').trim();
          if (!str) {
            const nameVal = Object.entries(row).find(([k]) => /name|title|label/i.test(k))?.[1];
            const fromName = nameVal ? String(nameVal).trim().slice(0, 4).toUpperCase().replace(/\W/g, '') : '';
            return fromName ? `${fromName}${rowIndex}` : `C${rowIndex}`;
          }
          return str;
        }
        // name, category_name, title vb. NOT NULL metin alanları
        if (/^(name|category_name|title|label)$/.test(col)) {
          const str = String(v ?? '').trim();
          return str || 'Unnamed';
        }
        return v ?? null;
      };

      const targetCols = entries.map(([, t]) => t);
      const hasId = targetCols.some((c) => String(c).toLowerCase() === 'id');
      const safeTable = `"${targetTable.replace(/"/g, '""')}"`;
      const colList = targetCols.map((col) => `"${String(col).replace(/"/g, '""')}"`).join(', ');
      const placeholders = targetCols.map(() => '?').join(', ');

      const NOT_NULL_DEFAULTS: Record<string, (i: number) => unknown> = {
        name: () => 'Unnamed',
        category_name: () => 'Unnamed',
        title: () => 'Unnamed',
        label: () => 'Unnamed',
        code: (i) => `C${i}`,
        category_code: (i) => `C${i}`,
      };
      const isProductTable = /^product_(brands|units|groups|categories)$/.test(targetTable.replace(/"/g, ''));
      const requiredCols = isProductTable ? ['name', 'code'] : [];
      const missingRequired = requiredCols.filter(
        (c) => !targetCols.some((t) => String(t).toLowerCase() === c)
      );
      const allTargetCols = [...targetCols];
      const allEntries = [...entries];
      for (const col of missingRequired) {
        allTargetCols.push(col);
        allEntries.push([col, col]);
      }
      const finalColList = allTargetCols.map((col) => `"${String(col).replace(/"/g, '""')}"`).join(', ');
      const finalPlaceholders = allTargetCols.map(() => '?').join(', ');
      const safeTableFinal = safeTable;

      let inserted = 0;
      let updated = 0;
      const isAppSettings = targetTable === 'app_settings';

      for (let rowIndex = 0; rowIndex < selected.length; rowIndex++) {
        const row = selected[rowIndex];
        let values = allEntries.map(([s, t]) => {
          if (missingRequired.includes(String(t).toLowerCase())) {
            const def = NOT_NULL_DEFAULTS[String(t).toLowerCase()];
            return def ? def(rowIndex) : 'Unnamed';
          }
          return transformValue(row, s, t, rowIndex);
        });
        values = values.map((v, i) => {
          const col = String(allTargetCols[i]).toLowerCase();
          const def = NOT_NULL_DEFAULTS[col];
          if (def != null && (v == null || (typeof v === 'string' && !v.trim()))) return def(rowIndex);
          return v;
        });

        if (isAppSettings) {
          const catIdx = allTargetCols.findIndex((c) => String(c).toLowerCase() === 'category');
          const keyIdx = allTargetCols.findIndex((c) => String(c).toLowerCase() === 'key');
          const cat = (catIdx >= 0 ? values[catIdx] : null) ?? '';
          const k = (keyIdx >= 0 ? values[keyIdx] : null) ?? '';
          if (!String(cat).trim() || !String(k).trim()) continue;
          const existing = await c.env.DB.prepare(
            `SELECT id FROM app_settings WHERE category = ? AND "key" = ? AND is_deleted = 0`
          ).bind(String(cat).trim(), String(k).trim()).first();
          const valIdx = allTargetCols.findIndex((c) => String(c).toLowerCase() === 'value');
          const val = valIdx >= 0 ? values[valIdx] : '';
          if (existing) {
            await c.env.DB.prepare(
              `UPDATE app_settings SET value = ?, updated_at = datetime('now') WHERE id = ?`
            ).bind(val ?? '', (existing as { id: number }).id).run();
            updated++;
          } else {
            await c.env.DB.prepare(
              `INSERT INTO app_settings (category, "key", value) VALUES (?, ?, ?)`
            ).bind(String(cat).trim(), String(k).trim(), val ?? '').run();
            inserted++;
          }
          continue;
        }

        if (hasId) {
          const idIdx = allTargetCols.findIndex((c) => String(c).toLowerCase() === 'id');
          const idVal = values[idIdx];
          const existing = await c.env.DB.prepare(
            `SELECT 1 FROM ${safeTableFinal} WHERE id = ?`
          ).bind(idVal).first();
          const updateCols = allTargetCols.filter(
            (c) => { const l = String(c).toLowerCase(); return l !== 'id' && l !== 'updated_at'; }
          );
          const updateSet = updateCols
            .map((col) => `"${String(col).replace(/"/g, '""')}" = excluded."${String(col).replace(/"/g, '""')}"`)
            .join(', ');
          const setClause = updateSet ? `${updateSet}, "updated_at" = datetime('now')` : `"updated_at" = datetime('now')`;
          await c.env.DB.prepare(
            `INSERT INTO ${safeTableFinal} (${finalColList}) VALUES (${finalPlaceholders}) ON CONFLICT(id) DO UPDATE SET ${setClause}`
          ).bind(...values).run();
          if (existing) updated++;
          else inserted++;
        } else {
          await c.env.DB.prepare(`INSERT INTO ${safeTableFinal} (${finalColList}) VALUES (${finalPlaceholders})`).bind(...values).run();
          inserted++;
        }
      }
      return c.json({ ok: true, inserted, updated, total: selected.length });
    } finally {
      await connection.end();
    }
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

// ========== SIDEBAR MENU ITEMS ==========
app.get('/api/sidebar-menu-items', async (c) => {
  try {
    if (!c.env.DB) {
      console.error('[Sidebar API] DB bulunamadı (c.env.DB yok)');
      return c.json({ error: 'DB bulunamadı' }, 500);
    }
    const { results } = await c.env.DB.prepare(
      `SELECT item_id as id, type, label, link, module_id as moduleId, icon_path as iconPath,
              separator_color as separatorColor, separator_thickness as separatorThickness
       FROM sidebar_menu_items ORDER BY sort_order, id`
    ).all();
    const items = (results || []).map((r: Record<string, unknown>) => ({
      id: r.id,
      type: r.type || 'menu',
      label: r.label || '',
      link: r.link || '',
      moduleId: r.moduleId || undefined,
      iconPath: r.iconPath || undefined,
      separatorColor: r.separatorColor || undefined,
      separatorThickness: r.separatorThickness ?? undefined,
    }));
    return c.json(items);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Sidebar API] sidebar-menu-items hatası:', { msg, err });
    if (msg.includes('no such table') || msg.includes('does not exist')) {
      return c.json([]);
    }
    return c.json({ error: msg }, 500);
  }
});

app.put('/api/sidebar-menu-items', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req.json<Array<{
      id: string;
      type?: string;
      label?: string;
      link?: string;
      moduleId?: string;
      iconPath?: string;
      separatorColor?: string;
      separatorThickness?: number;
    }>>();
    if (!Array.isArray(body)) return c.json({ error: 'items dizisi gerekli' }, 400);

    await c.env.DB.prepare(`DELETE FROM sidebar_menu_items`).run();

    for (let i = 0; i < body.length; i++) {
      const item = body[i];
      const item_id = (item?.id || `m-${Date.now()}-${i}`).toString();
      const type = (item?.type || 'menu').toString();
      const label = (item?.label || '').toString();
      const link = (item?.link || '').toString();
      const module_id = item?.moduleId?.toString().trim() || null;
      const icon_path = item?.iconPath?.toString().trim() || null;
      const separator_color = item?.separatorColor?.toString().trim() || null;
      const separator_thickness = item?.separatorThickness ?? null;

      await c.env.DB.prepare(
        `INSERT INTO sidebar_menu_items (item_id, sort_order, type, label, link, module_id, icon_path, separator_color, separator_thickness)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(item_id, i, type, label, link, module_id, icon_path, separator_color, separator_thickness).run();
    }

    const { results } = await c.env.DB.prepare(
      `SELECT item_id as id, type, label, link, module_id as moduleId, icon_path as iconPath,
              separator_color as separatorColor, separator_thickness as separatorThickness
       FROM sidebar_menu_items ORDER BY sort_order, id`
    ).all();
    const items = (results || []).map((r: Record<string, unknown>) => ({
      id: r.id,
      type: r.type || 'menu',
      label: r.label || '',
      link: r.link || '',
      moduleId: r.moduleId || undefined,
      iconPath: r.iconPath || undefined,
      separatorColor: r.separatorColor || undefined,
      separatorThickness: r.separatorThickness ?? undefined,
    }));
    return c.json(items);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 500);
  }
});

// ========== APP SETTINGS ==========
app.get('/api/app-settings', async (c) => {
  try {
    if (!c.env.DB) {
      console.error('[AppSettings API] DB bulunamadı (c.env.DB yok)');
      return c.json({ error: 'DB bulunamadı' }, 500);
    }
    const category = c.req.query('category');
    if (!category) return c.json({ error: 'category gerekli' }, 400);

    const { results } = await c.env.DB.prepare(
      `SELECT key, value FROM app_settings WHERE category = ? AND is_deleted = 0 AND status = 1`
    ).bind(category).all();

    const settings: Record<string, string> = {};
    for (const r of results as { key: string; value: string | null }[]) {
      if (r.key) settings[r.key] = r.value ?? '';
    }
    return c.json(settings);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[AppSettings API] app-settings hatası:', { msg, err });
    return c.json({ error: msg }, 500);
  }
});

app.put('/api/app-settings', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req.json<{ category: string; settings: Record<string, string> }>();
    const { category, settings } = body;
    if (!category?.trim() || !settings || typeof settings !== 'object') {
      return c.json({ error: 'category ve settings gerekli' }, 400);
    }

    for (const [key, value] of Object.entries(settings)) {
      if (!key?.trim()) continue;
      const val = value ?? '';
      const cat = category.trim();
      const k = key.trim();
      const existing = await c.env.DB.prepare(
        `SELECT id FROM app_settings WHERE category = ? AND "key" = ? AND is_deleted = 0`
      ).bind(cat, k).first();
      if (existing) {
        await c.env.DB.prepare(
          `UPDATE app_settings SET value = ?, updated_at = datetime('now') WHERE id = ?`
        ).bind(val, (existing as { id: number }).id).run();
      } else {
        await c.env.DB.prepare(
          `INSERT INTO app_settings (category, "key", value) VALUES (?, ?, ?)`
        ).bind(cat, k, val).run();
      }
    }

    const { results } = await c.env.DB.prepare(
      `SELECT key, value FROM app_settings WHERE category = ? AND is_deleted = 0 AND status = 1`
    ).bind(category.trim()).all();

    const out: Record<string, string> = {};
    for (const r of results as { key: string; value: string | null }[]) {
      if (r.key) out[r.key] = r.value ?? '';
    }
    return c.json(out);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

// Görsel URL proxy (CORS bypass - linkten indir için)
app.get('/storage/proxy-image', async (c) => {
  try {
    const url = c.req.query('url');
    if (!url || !url.startsWith('http')) return c.json({ error: 'Geçerli URL gerekli' }, 400);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; eSync+/1.0)',
        'Accept': 'image/*,*/*',
      },
    });
    if (!res.ok) return c.json({ error: 'Görsel alınamadı' }, 400);
    const ct = res.headers.get('content-type') || 'image/png';
    const isImage = ct.split(';')[0].trim().toLowerCase().startsWith('image/');
    if (!isImage) return c.json({ error: 'Geçerli görsel formatı değil' }, 400);
    const buf = await res.arrayBuffer();
    return new Response(buf, {
      headers: { 'Content-Type': ct, 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Proxy hatası' }, 500);
  }
});

export default app;
