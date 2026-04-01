import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createConnection } from 'mysql2/promise';
import {
  buildIdeasoftAuthorizeUrl,
  exchangeIdeasoftAuthorizationCode,
  getIdeasoftAccessToken,
  getIdeasoftRedirectUriFromRequest,
  ideasoftFindProductIdBySku,
  ideasoftGetProduct,
  ideasoftCreateCategory,
  ideasoftUpdateCategory,
  ideasoftDebugBrands,
  ideasoftDebugCategories,
  ideasoftDebugCurrencies,
  ideasoftFetchBrands,
  ideasoftFetchCurrencies,
  ideasoftFetchCategories,
  ideasoftCreateBrand,
  ideasoftUpsertProduct,
  ideasoftUploadProductImages,
  ideasoftChangeProductCategory,
  ideasoftPatchProductMarketingAndSeo,
  ideasoftDataUrlBase64PayloadNonEmpty,
  loadIdeasoftSettings,
  normalizeStoreBase,
  parseReturnToQuery,
  saveIdeasoftOAuthPending,
  verifyIdeasoftOAuthPending,
  clearIdeasoftOAuthPending,
} from './ideasoft';

/** Türkçe karakterleri arama için ASCII karşılıklarına çevirir. toLowerCase öncesi replace ile İ/ı sorunu önlenir. */
function normalizeForSearch(s: string): string {
  return (s || '')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/Ğ/g, 'g')
    .replace(/ğ/g, 'g')
    .replace(/Ü/g, 'u')
    .replace(/ü/g, 'u')
    .replace(/Ö/g, 'o')
    .replace(/ö/g, 'o')
    .replace(/Ş/g, 's')
    .replace(/ş/g, 's')
    .replace(/Ç/g, 'c')
    .replace(/ç/g, 'c')
    .toLowerCase();
}

/** LIKE pattern'da % ve _ literal olarak aranması için escape eder */
function escapeLikePattern(s: string): string {
  return (s || '')
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

/** SQLite'da sütun değerini normalize eden ifade (Türkçe karakter eşleşmesi için).
 * SQLite LOWER() sadece ASCII dönüştürür, Ü/Ö/Ğ/Ş/Ç/İ değişmez - bu yüzden hepsini REPLACE ile yapıyoruz. */
function sqlNormalizeCol(col: string): string {
  return `LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(${col}, ''), 'İ', 'i'), 'ı', 'i'), 'Ü', 'u'), 'ü', 'u'), 'Ö', 'o'), 'ö', 'o'), 'Ğ', 'g'), 'ğ', 'g'), 'Ş', 's'), 'ş', 's'), 'Ç', 'c'), 'ç', 'c'))`;
}

/** R2'den görsel alıp base64 data URL'e çevirir. Paraşüt gibi dış servisler URL'ye erişemeyebilir; data URL ile gönderim daha güvenilir. */
async function storagePathToDataUrl(storage: R2Bucket | undefined, path: string): Promise<string | null> {
  if (!path?.trim()) return null;
  const p = path.trim();
  if (p.startsWith('http://') || p.startsWith('https://')) return p;
  if (!storage) return null;
  try {
    const obj = await storage.get(p);
    if (!obj) return null;
    const buf = await obj.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    const chunk = 8192;
    for (let i = 0; i < bytes.length; i += chunk) {
      const slice = bytes.subarray(i, i + chunk);
      binary += String.fromCharCode.apply(null, Array.from(slice));
    }
    const base64 = btoa(binary);
    const ct = obj.httpMetadata?.contentType || (p.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
    return `data:${ct};base64,${base64}`;
  } catch {
    return null;
  }
}

type Bindings = {
  DB: D1Database;
  STORAGE: R2Bucket;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('/*', cors({
  origin: (origin) => {
    if (!origin) return '*';
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) return origin;
    return '*';
  },
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Accept'],
  exposeHeaders: ['Content-Length'],
  maxAge: 86400,
}));

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

// ========== E-DOCUMENTS - Mevcut yıllar (filtre için) ==========
app.get('/api/e-documents/years', async (c) => {
  try {
    if (!c.env.DB) return c.json({ years: [] });
    // date (YYYY-MM-DD veya DD.MM.YYYY) veya directory (e-documents/xxx/YYYY/mm/) üzerinden yıl çıkar
    const { results } = await c.env.DB.prepare(
      `SELECT DISTINCT year FROM (
        SELECT CAST(SUBSTR(date, 1, 4) AS INTEGER) as year FROM e_documents
        WHERE is_deleted = 0 AND date IS NOT NULL AND date GLOB '[0-9][0-9][0-9][0-9]-*'
        UNION
        SELECT CAST(SUBSTR(date, 7, 4) AS INTEGER) as year FROM e_documents
        WHERE is_deleted = 0 AND date IS NOT NULL AND date GLOB '[0-9][0-9].[0-9][0-9].[0-9][0-9][0-9][0-9]'
        UNION
        SELECT CAST(SUBSTR(directory, 20, 4) AS INTEGER) as year FROM e_documents
        WHERE is_deleted = 0 AND LENGTH(directory) >= 23 AND SUBSTR(directory, 20, 1) GLOB '[0-9]'
      ) WHERE year >= 2000 AND year <= 2100 ORDER BY year DESC`
    ).all();
    const years = (results as { year: number }[]).map((r) => r.year);
    return c.json({ years });
  } catch {
    return c.json({ years: [] });
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
    const year = (c.req.query('year') || '').trim();
    const month = (c.req.query('month') || '').trim();
    let dirPrefix = filter !== 'tumu' ? `e-documents/${filter}/` : 'e-documents/%/';
    if (year) {
      dirPrefix += `${year}/`;
      if (month) dirPrefix += `${month}/`;
    }
    if (filter !== 'tumu' || year) {
      where += ' AND directory LIKE ?';
      params.push(dirPrefix + '%');
    }
    if (search) {
      const n = normalizeForSearch(search);
      const pat = `%${escapeLikePattern(n)}%`;
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

// E-Documents - Gönderen/Alıcı güncelleme
app.patch('/api/e-documents/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'Veritabanı bulunamadı' }, 500);
    const id = parseInt(c.req.param('id') || '0');
    if (!id) return c.json({ error: 'Geçerli id gerekli' }, 400);
    const body = await c.req.json<{ seller_title?: string; buyer_title?: string }>().catch(() => ({}));
    const sellerTitle = typeof body?.seller_title === 'string' ? body.seller_title : undefined;
    const buyerTitle = typeof body?.buyer_title === 'string' ? body.buyer_title : undefined;
    if (sellerTitle === undefined && buyerTitle === undefined) {
      return c.json({ error: 'seller_title veya buyer_title gerekli' }, 400);
    }
    const updates: string[] = [];
    const params: (string | number)[] = [];
    if (sellerTitle !== undefined) {
      updates.push('seller_title = ?');
      params.push(sellerTitle);
    }
    if (buyerTitle !== undefined) {
      updates.push('buyer_title = ?');
      params.push(buyerTitle);
    }
    params.push(id);
    const res = await c.env.DB.prepare(
      `UPDATE e_documents SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ? AND is_deleted = 0`
    ).bind(...params).run();
    if (res.meta.changes === 0) return c.json({ error: 'Kayıt bulunamadı' }, 404);
    return c.json({ ok: true });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Güncelleme hatası' }, 500);
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
      const pat = `%${escapeLikePattern(n)}%`;
      where += ` AND (${sqlNormalizeCol('name')} LIKE ? OR ${sqlNormalizeCol('code')} LIKE ?)`;
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
    const filter_group_id = c.req.query('filter_group_id');
    const filter_type_id_raw = c.req.query('filter_type_id');
    const filter_type_id = Array.isArray(filter_type_id_raw)
      ? (filter_type_id_raw as string[]).join(',')
      : (filter_type_id_raw ?? '');
    const filter_no_image = c.req.query('filter_no_image') === '1';
    const sort_by = (c.req.query('sort_by') || 'sort_order').trim();
    const sort_order = (c.req.query('sort_order') || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const page = Math.max(1, parseInt(c.req.query('page') || '1'));
    const limit = Math.min(9999, Math.max(1, parseInt(c.req.query('limit') || '10')));
    const offset = (page - 1) * limit;
    const priceTypeIdRaw = c.req.query('price_type_id');
    const priceTypeId = priceTypeIdRaw ? parseInt(String(priceTypeIdRaw), 10) : 0;
    const usePriceType = priceTypeId > 0;
    let where = 'WHERE p.is_deleted = 0';
    const params: (string | number)[] = [];
    if (search) {
      const n = normalizeForSearch(search);
      const pat = `%${escapeLikePattern(n)}%`;
      const normName = sqlNormalizeCol('p.name');
      const normSku = sqlNormalizeCol('p.sku');
      const normBarcode = sqlNormalizeCol('p.barcode');
      where += ` AND (${normName} LIKE ? OR ${normSku} LIKE ? OR ${normBarcode} LIKE ?)`;
      params.push(pat, pat, pat);
    }
    if (filter_name) {
      where += ` AND ${sqlNormalizeCol('p.name')} LIKE ?`;
      params.push(`%${escapeLikePattern(normalizeForSearch(filter_name))}%`);
    }
    if (filter_sku) {
      where += ` AND ${sqlNormalizeCol('p.sku')} LIKE ?`;
      params.push(`%${escapeLikePattern(normalizeForSearch(filter_sku))}%`);
    }
    if (filter_brand_id) {
      where += ' AND p.brand_id = ?';
      params.push(Number(filter_brand_id));
    }
    if (filter_category_id) {
      where += ' AND p.category_id = ?';
      params.push(Number(filter_category_id));
    }
    if (filter_group_id) {
      const groupId = Number(filter_group_id);
      const { results: catRows } = await c.env.DB.prepare(
        `SELECT id FROM product_categories WHERE (id = ? OR group_id = ?) AND is_deleted = 0
         UNION
         SELECT sub.id FROM product_categories sub
         INNER JOIN product_categories cat ON sub.category_id = cat.id AND cat.is_deleted = 0
         WHERE cat.group_id = ? AND sub.is_deleted = 0`
      ).bind(groupId, groupId, groupId).all();
      const ids = (catRows as { id: number }[]).map((r) => r.id);
      if (ids.length > 0) {
        where += ` AND p.category_id IN (${ids.map(() => '?').join(',')})`;
        params.push(...ids);
      } else {
        where += ' AND 1=0';
      }
    }
    if (filter_type_id !== undefined && filter_type_id !== '') {
      const ids = String(filter_type_id)
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !Number.isNaN(n) && n > 0);
      if (ids.length === 1) {
        where += ' AND p.type_id = ?';
        params.push(ids[0]);
      } else if (ids.length > 1) {
        where += ` AND p.type_id IN (${ids.map(() => '?').join(',')})`;
        params.push(...ids);
      }
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
    const priceCol = usePriceType ? 'COALESCE(pp_offer.price, p.price)' : 'p.price';
    const currencySymbolCol = usePriceType ? 'COALESCE(cur_offer.symbol, cur.symbol)' : 'cur.symbol';
    const currencyIdCol = usePriceType ? 'COALESCE(pp_offer.currency_id, p.currency_id)' : 'p.currency_id';
    const ppOfferJoin = usePriceType
      ? `LEFT JOIN product_prices pp_offer ON pp_offer.product_id = p.id AND pp_offer.price_type_id = ${priceTypeId} AND pp_offer.is_deleted = 0 AND (pp_offer.status = 1 OR pp_offer.status IS NULL)
       LEFT JOIN product_currencies cur_offer ON pp_offer.currency_id = cur_offer.id AND cur_offer.is_deleted = 0`
      : '';
    const { results } = await c.env.DB.prepare(
      `SELECT p.id, p.name, p.sku, p.barcode, p.brand_id, p.category_id, p.type_id, p.product_item_group_id, p.unit_id, ${currencyIdCol} as currency_id,
       ${priceCol} as price, p.quantity, pp.price as ecommerce_price, pp.currency_id as ecommerce_currency_id, p.image, p.tax_rate, p.supplier_code, p.gtip_code, p.sort_order, p.status, COALESCE(p.ecommerce_enabled, 1) as ecommerce_enabled,
       p.created_at, p.updated_at,
       b.name as brand_name, b.code as brand_code, b.image as brand_image,
       grp.code as group_code, grp.name as group_name, grp.color as group_color,
       cat.code as category_code, cat.name as category_name, cat.color as category_color,
       CASE WHEN sub.category_id IS NOT NULL AND sub.category_id > 0 THEN sub.code END as subcategory_code,
       CASE WHEN sub.category_id IS NOT NULL AND sub.category_id > 0 THEN sub.name END as subcategory_name,
       CASE WHEN sub.category_id IS NOT NULL AND sub.category_id > 0 THEN sub.color END as subcategory_color,
       t.name as type_name, t.color as type_color, u.name as unit_name, ${currencySymbolCol} as currency_symbol,
       pig.name as product_item_group_name, pig.code as product_item_group_code, pig.color as product_item_group_color, pig.sort_order as product_item_group_sort_order
       FROM products p
       LEFT JOIN product_item_groups pig ON p.product_item_group_id = pig.id AND pig.is_deleted = 0
       LEFT JOIN product_brands b ON p.brand_id = b.id AND b.is_deleted = 0
       LEFT JOIN product_categories sub ON p.category_id = sub.id AND sub.is_deleted = 0
       LEFT JOIN product_categories cat ON cat.id = COALESCE(sub.category_id, CASE WHEN sub.group_id IS NOT NULL AND sub.group_id > 0 THEN sub.id END) AND cat.is_deleted = 0
       LEFT JOIN product_categories grp ON grp.id = COALESCE(cat.group_id, sub.group_id, sub.id) AND grp.is_deleted = 0
       LEFT JOIN product_types t ON p.type_id = t.id AND t.is_deleted = 0
       LEFT JOIN product_unit u ON p.unit_id = u.id AND u.is_deleted = 0
       LEFT JOIN product_currencies cur ON p.currency_id = cur.id AND cur.is_deleted = 0
       ${ppOfferJoin}
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

/** Ana ürün tablosunda isim veya SKU ile arama (otomatik tamamlama için) */
app.get('/api/products/search-by-name', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const q = (c.req.query('q') || '').trim();
    const limit = Math.min(parseInt(c.req.query('limit') || '20') || 20, 50);
    if (!q) return c.json({ products: [] });
    const words = q.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) return c.json({ products: [] });
    const escapeClause = /[%_]/.test(q) ? " ESCAPE '\\'" : '';
    const nameConditions = words
      .map(() => `${sqlNormalizeCol('p.name')} LIKE ?${escapeClause}`)
      .join(' AND ');
    const nameParams = words.map((w) => `%${escapeLikePattern(normalizeForSearch(w))}%`);
    const skuCondition = `${sqlNormalizeCol("TRIM(COALESCE(p.sku, ''))")} LIKE ?${escapeClause}`;
    const skuParam = `%${escapeLikePattern(normalizeForSearch(q))}%`;
    const whereClause = `(${nameConditions}) OR (${skuCondition})`;
    const params = [...nameParams, skuParam, limit];
    const { results } = await c.env.DB.prepare(
      `SELECT p.id, p.name, p.sku, p.barcode, p.category_id, b.name as brand_name
       FROM products p
       LEFT JOIN product_brands b ON p.brand_id = b.id AND b.is_deleted = 0
       WHERE p.is_deleted = 0 AND (${whereClause})
       ORDER BY p.sort_order, p.id
       LIMIT ?`
    )
      .bind(...params)
      .all<{ id: number; name: string; sku: string | null; barcode: string | null; category_id: number | null; brand_name: string | null }>();
    return c.json({ products: results ?? [] });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

/** Verilen kodların products.sku ile eşleşenlerini döner (parasut code = products.sku) */
app.get('/api/products/matched-skus', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const codesParam = (c.req.query('codes') || '').trim();
    if (!codesParam) return c.json({ matched: [] });
    const codes = codesParam.split(',').map((s) => s.trim()).filter(Boolean);
    if (codes.length === 0) return c.json({ matched: [] });
    const { results } = await c.env.DB.prepare(
      `SELECT TRIM(COALESCE(sku, '')) as sku FROM products WHERE is_deleted = 0 AND TRIM(COALESCE(sku, '')) != ''`
    ).all();
    const dbSkus = new Set((results as { sku: string }[]).map((r) => normalizeForSearch(r.sku)));
    const matched = codes.filter((code) => dbSkus.has(normalizeForSearch(code)));
    return c.json({ matched });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.get('/api/products/by-sku', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const sku = (c.req.query('sku') || '').trim();
    if (!sku) return c.json(null);
    const skuNorm = normalizeForSearch(sku);
    const productRow = await c.env.DB.prepare(
      `SELECT id, name, sku, barcode, price, quantity, currency_id FROM products
       WHERE is_deleted = 0 AND ${sqlNormalizeCol("TRIM(COALESCE(sku, ''))")} = ?
       ORDER BY id DESC LIMIT 1`
    )
      .bind(skuNorm)
      .first<{ id: number; name: string; sku: string; barcode: string | null; price: number; quantity: number; currency_id: number | null }>();
    if (!productRow) return c.json(null);
    const priceTypeSetting = await c.env.DB.prepare(
      `SELECT value FROM app_settings WHERE category = 'products' AND key = 'fiyat_getir_price_type' AND is_deleted = 0 AND (status = 1 OR status IS NULL) LIMIT 1`
    ).first<{ value: string | null }>();
    const priceType = (priceTypeSetting?.value ?? '1').trim();
    let price = productRow.price;
    if (priceType !== 'products' && priceType !== '') {
      const ptId = parseInt(priceType, 10);
      if (!Number.isNaN(ptId) && ptId > 0) {
        const ppRow = await c.env.DB.prepare(
          `SELECT price FROM product_prices
           WHERE product_id = ? AND price_type_id = ? AND is_deleted = 0 AND (status = 1 OR status IS NULL)
           LIMIT 1`
        )
          .bind(productRow.id, ptId)
          .first<{ price: number }>();
        if (ppRow != null && ppRow.price != null) price = ppRow.price;
      }
    }
    return c.json({ ...productRow, price });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

/** Ana üründen e-ticaret fiyatı, para birimi ve KDV oranını model/SKU ile getirir (OpenCart Getir butonu için) */
app.get('/api/products/ecommerce-price-by-sku', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const code = (c.req.query('sku') || c.req.query('model') || '').trim();
    if (!code) return c.json(null);
    const codeLower = code.toLowerCase();
    const productRow = await c.env.DB.prepare(
      `SELECT p.id, p.tax_rate, p.currency_id FROM products p
       WHERE p.is_deleted = 0 AND LOWER(TRIM(COALESCE(p.sku, ''))) = ?
       ORDER BY p.id DESC LIMIT 1`
    )
      .bind(codeLower)
      .first<{ id: number; tax_rate: number | null; currency_id: number | null }>();
    if (!productRow) return c.json(null);
    const ppRow = await c.env.DB.prepare(
      `SELECT pp.price, pp.currency_id FROM product_prices pp
       WHERE pp.product_id = ? AND pp.price_type_id = 1 AND pp.is_deleted = 0 AND (pp.status = 1 OR pp.status IS NULL)
       LIMIT 1`
    )
      .bind(productRow.id)
      .first<{ price: number; currency_id: number | null }>();
    const price = ppRow?.price ?? 0;
    const currencyId = ppRow?.currency_id ?? productRow.currency_id;
    let currencySymbol = '₺';
    if (currencyId) {
      const curRow = await c.env.DB.prepare(
        `SELECT symbol FROM product_currencies WHERE id = ? AND is_deleted = 0 LIMIT 1`
      )
        .bind(currencyId)
        .first<{ symbol: string | null }>();
      if (curRow?.symbol) currencySymbol = curRow.symbol;
    }
    return c.json({
      price,
      currency_symbol: currencySymbol,
      tax_rate: productRow.tax_rate ?? 0,
    });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.get('/api/products/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const productDetailSql = `SELECT p.*, pp.price as ecommerce_price, pp.currency_id as ecommerce_currency_id,
       b.name as brand_name, b.code as brand_code, b.image as brand_image,
       grp.code as group_code, grp.name as group_name, grp.color as group_color,
       cat.code as category_code, cat.name as category_name, cat.color as category_color,
       CASE WHEN sub.category_id IS NOT NULL AND sub.category_id > 0 THEN sub.code END as subcategory_code,
       CASE WHEN sub.category_id IS NOT NULL AND sub.category_id > 0 THEN sub.name END as subcategory_name,
       CASE WHEN sub.category_id IS NOT NULL AND sub.category_id > 0 THEN sub.color END as subcategory_color,
       t.name as type_name, t.color as type_color, u.name as unit_name, cur.name as currency_name, cur.symbol as currency_symbol,
       pig.name as product_item_group_name, pig.code as product_item_group_code, pig.color as product_item_group_color, pig.sort_order as product_item_group_sort_order,
       pd.ecommerce_name, pd.main_description, pd.seo_slug, pd.seo_title, pd.seo_description, pd.seo_keywords
       FROM products p
       LEFT JOIN product_item_groups pig ON p.product_item_group_id = pig.id AND pig.is_deleted = 0
       LEFT JOIN product_brands b ON p.brand_id = b.id AND b.is_deleted = 0
       LEFT JOIN product_categories sub ON p.category_id = sub.id AND sub.is_deleted = 0
       LEFT JOIN product_categories cat ON cat.id = COALESCE(sub.category_id, CASE WHEN sub.group_id IS NOT NULL AND sub.group_id > 0 THEN sub.id END) AND cat.is_deleted = 0
       LEFT JOIN product_categories grp ON grp.id = COALESCE(cat.group_id, sub.group_id, sub.id) AND grp.is_deleted = 0
       LEFT JOIN product_types t ON p.type_id = t.id AND t.is_deleted = 0
       LEFT JOIN product_unit u ON p.unit_id = u.id AND u.is_deleted = 0
       LEFT JOIN product_currencies cur ON p.currency_id = cur.id AND cur.is_deleted = 0
       LEFT JOIN product_prices pp ON pp.product_id = p.id AND pp.price_type_id = 1 AND pp.is_deleted = 0
       LEFT JOIN product_descriptions pd ON pd.product_id = p.id AND pd.is_deleted = 0
       WHERE p.id = ? AND p.is_deleted = 0`;
    const row = await d1FirstWithSeoKeywordsSelectFallback<Record<string, unknown>>(c.env.DB, productDetailSql, [id]);
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
      type_id?: number; product_item_group_id?: number; unit_id?: number; currency_id?: number; price?: number; quantity?: number;
      ecommerce_price?: number; ecommerce_currency_id?: number; ecommerce_enabled?: boolean;
      prices?: { price_type_id: number; price?: number; currency_id?: number | null; status?: number }[];
      image?: string; tax_rate?: number; supplier_code?: string; gtip_code?: string;
      sort_order?: number; status?: number;
      ecommerce_name?: string; main_description?: string; seo_slug?: string; seo_title?: string; seo_description?: string; seo_keywords?: string;
    }>();
    const name = (body.name || '').trim();
    if (!name) return c.json({ error: 'Ürün adı gerekli' }, 400);
    const sort_order = body.sort_order ?? 0;
    const status = body.status !== undefined ? (body.status ? 1 : 0) : 1;
    const ecommerce_enabled = body.ecommerce_enabled !== undefined ? (body.ecommerce_enabled ? 1 : 0) : 1;
    await c.env.DB.prepare(
      `INSERT INTO products (name, sku, barcode, brand_id, category_id, type_id, product_item_group_id, unit_id, currency_id, price, quantity, image, tax_rate, supplier_code, gtip_code, sort_order, status, ecommerce_enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      name,
      body.sku?.trim() || null,
      body.barcode?.trim() || null,
      body.brand_id || null,
      body.category_id || null,
      body.type_id || null,
      body.product_item_group_id || null,
      body.unit_id || null,
      body.currency_id || null,
      body.price ?? 0,
      body.quantity ?? 0,
      body.image?.trim() || null,
      body.tax_rate ?? 0,
      body.supplier_code?.trim() || null,
      body.gtip_code?.trim() || null,
      sort_order,
      status,
      ecommerce_enabled
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
    if (productId && (body.ecommerce_name !== undefined || body.main_description !== undefined || body.seo_slug !== undefined || body.seo_title !== undefined || body.seo_description !== undefined || body.seo_keywords !== undefined)) {
      const ecomName = body.ecommerce_name !== undefined ? (String(body.ecommerce_name).trim() || null) : null;
      const mainDesc = body.main_description !== undefined ? (String(body.main_description).trim() || null) : null;
      const seoSlug = body.seo_slug !== undefined ? (String(body.seo_slug).trim() || null) : null;
      const seoTitle = body.seo_title !== undefined ? (String(body.seo_title).trim() || null) : null;
      const seoDesc = body.seo_description !== undefined ? (String(body.seo_description).trim() || null) : null;
      const seoKeywords = body.seo_keywords !== undefined ? (String(body.seo_keywords).trim() || null) : null;
      const hasDesc = true;
      if (hasDesc) {
        const existingDesc = await c.env.DB.prepare(`SELECT id FROM product_descriptions WHERE product_id = ?`).bind(productId).first();
        if (existingDesc) {
          const updates: string[] = [];
          const vals: (string | null)[] = [];
          if (body.ecommerce_name !== undefined) { updates.push('ecommerce_name = ?'); vals.push(ecomName); }
          if (body.main_description !== undefined) { updates.push('main_description = ?'); vals.push(mainDesc); }
          if (body.seo_slug !== undefined) { updates.push('seo_slug = ?'); vals.push(seoSlug); }
          if (body.seo_title !== undefined) { updates.push('seo_title = ?'); vals.push(seoTitle); }
          if (body.seo_description !== undefined) { updates.push('seo_description = ?'); vals.push(seoDesc); }
          if (body.seo_keywords !== undefined) { updates.push('seo_keywords = ?'); vals.push(seoKeywords); }
          if (updates.length > 0) {
            updates.push("updated_at = datetime('now')");
            await updateProductDescriptionsWithSeoKeywordsFallback(c.env.DB, updates, vals, productId);
          }
        } else {
          await insertProductDescriptionsRowWithSeoKeywordsFallback(
            c.env.DB,
            productId,
            ecomName,
            mainDesc,
            seoSlug,
            seoTitle,
            seoDesc,
            seoKeywords
          );
        }
      }
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
      type_id?: number; product_item_group_id?: number; unit_id?: number; currency_id?: number; price?: number; quantity?: number;
      ecommerce_price?: number; ecommerce_currency_id?: number; ecommerce_enabled?: boolean;
      prices?: { price_type_id: number; price?: number; currency_id?: number | null; status?: number }[];
      image?: string; tax_rate?: number; supplier_code?: string; gtip_code?: string;
      sort_order?: number; status?: number;
      ecommerce_name?: string; main_description?: string; seo_slug?: string; seo_title?: string; seo_description?: string; seo_keywords?: string;
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
    if (body.product_item_group_id !== undefined) { updates.push('product_item_group_id = ?'); values.push(body.product_item_group_id || null); }
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
    if (body.ecommerce_enabled !== undefined) { updates.push('ecommerce_enabled = ?'); values.push(body.ecommerce_enabled ? 1 : 0); }
    if (updates.length === 0 && !(body.ecommerce_name !== undefined || body.main_description !== undefined || body.seo_slug !== undefined || body.seo_title !== undefined || body.seo_description !== undefined || body.seo_keywords !== undefined)) return c.json({ error: 'Güncellenecek alan yok' }, 400);
    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      await c.env.DB.prepare(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`).bind(...values, id).run();
    }
    if (body.ecommerce_name !== undefined || body.main_description !== undefined || body.seo_slug !== undefined || body.seo_title !== undefined || body.seo_description !== undefined || body.seo_keywords !== undefined) {
      const ecomName = body.ecommerce_name !== undefined ? (String(body.ecommerce_name).trim() || null) : null;
      const mainDesc = body.main_description !== undefined ? (String(body.main_description).trim() || null) : null;
      const seoSlug = body.seo_slug !== undefined ? (String(body.seo_slug).trim() || null) : null;
      const seoTitle = body.seo_title !== undefined ? (String(body.seo_title).trim() || null) : null;
      const seoDesc = body.seo_description !== undefined ? (String(body.seo_description).trim() || null) : null;
      const seoKeywords = body.seo_keywords !== undefined ? (String(body.seo_keywords).trim() || null) : null;
      const existingDesc = await c.env.DB.prepare(`SELECT id FROM product_descriptions WHERE product_id = ? AND is_deleted = 0`).bind(id).first();
      if (existingDesc) {
        const descUpdates: string[] = [];
        const descVals: (string | null)[] = [];
        if (body.ecommerce_name !== undefined) { descUpdates.push('ecommerce_name = ?'); descVals.push(ecomName); }
        if (body.main_description !== undefined) { descUpdates.push('main_description = ?'); descVals.push(mainDesc); }
        if (body.seo_slug !== undefined) { descUpdates.push('seo_slug = ?'); descVals.push(seoSlug); }
        if (body.seo_title !== undefined) { descUpdates.push('seo_title = ?'); descVals.push(seoTitle); }
        if (body.seo_description !== undefined) { descUpdates.push('seo_description = ?'); descVals.push(seoDesc); }
        if (body.seo_keywords !== undefined) { descUpdates.push('seo_keywords = ?'); descVals.push(seoKeywords); }
        if (descUpdates.length > 0) {
          descUpdates.push("updated_at = datetime('now')");
          await updateProductDescriptionsWithSeoKeywordsFallback(c.env.DB, descUpdates, descVals, Number(id));
        }
      } else {
        await insertProductDescriptionsRowWithSeoKeywordsFallback(
          c.env.DB,
          Number(id),
          ecomName,
          mainDesc,
          seoSlug,
          seoTitle,
          seoDesc,
          seoKeywords
        );
      }
    }
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

/** Toplu ürün güncelleme: kategori, tip veya ürün grubu değiştir */
app.patch('/api/products/bulk', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req.json<{
      ids: number[];
      category_id?: number | null;
      type_id?: number | null;
      product_item_group_id?: number | null;
    }>();
    const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is number => typeof x === 'number' && x > 0) : [];
    if (ids.length === 0) return c.json({ error: 'En az bir ürün ID gerekli' }, 400);
    const hasCategory = body.category_id !== undefined;
    const hasType = body.type_id !== undefined;
    const hasGroup = body.product_item_group_id !== undefined;
    if (!hasCategory && !hasType && !hasGroup) return c.json({ error: 'Güncellenecek alan belirtin (category_id, type_id veya product_item_group_id)' }, 400);
    const updates: string[] = [];
    const values: (number | null)[] = [];
    if (hasCategory) { updates.push('category_id = ?'); values.push(body.category_id ?? null); }
    if (hasType) { updates.push('type_id = ?'); values.push(body.type_id ?? null); }
    if (hasGroup) { updates.push('product_item_group_id = ?'); values.push(body.product_item_group_id ?? null); }
    updates.push("updated_at = datetime('now')");
    const placeholders = ids.map(() => '?').join(',');
    const stmt = c.env.DB.prepare(
      `UPDATE products SET ${updates.join(', ')} WHERE id IN (${placeholders}) AND is_deleted = 0`
    );
    await stmt.bind(...values, ...ids).run();
    return c.json({ ok: true, updated: ids.length });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

/** Ürün E-Ticaret bilgilerini OpenCart veritabanına yayınla. Eşleşmeyen ürünler OpenCart'ta yeni oluşturulur. Varolan ürünler için update_price, update_description, update_images ile seçimli güncelleme. */
app.post('/api/products/:id/publish/opencart', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const body = await c.req.json<{
      ecommerce_name?: string; main_description?: string; seo_slug?: string; seo_title?: string; seo_description?: string; seo_keywords?: string;
      images?: string[]; uploaded_image_paths?: string[];
      update_price?: boolean; update_description?: boolean; update_images?: boolean;
    }>().catch(() => null);
    const ocProductSql = `SELECT p.id, p.name, p.sku, p.image, p.quantity, COALESCE(p.ecommerce_enabled, 1) as ecommerce_enabled, pd.ecommerce_name, pd.main_description, pd.seo_slug, pd.seo_title, pd.seo_description, pd.seo_keywords
       FROM products p
       LEFT JOIN product_descriptions pd ON pd.product_id = p.id AND pd.is_deleted = 0
       WHERE p.id = ? AND p.is_deleted = 0`;
    const productRow = await d1FirstWithSeoKeywordsSelectFallback<{
      id: number;
      name: string;
      sku: string | null;
      image: string | null;
      quantity: number;
      ecommerce_enabled: number;
      ecommerce_name: string | null;
      main_description: string | null;
      seo_slug: string | null;
      seo_title: string | null;
      seo_description: string | null;
      seo_keywords: string | null;
    }>(c.env.DB, ocProductSql, [id]);
    if (!productRow) return c.json({ error: 'Ürün bulunamadı' }, 404);
    if (productRow.ecommerce_enabled === 0) return c.json({ error: 'Bu ürün e-ticarete kapalı. Önce ürün listesinde E-Ticaret anahtarını açın.' }, 400);

    const priceRow = await c.env.DB.prepare(
      `SELECT price FROM product_prices WHERE product_id = ? AND price_type_id = 1 AND is_deleted = 0 LIMIT 1`
    ).bind(id).first<{ price: number }>();
    const productPrice = priceRow?.price ?? 0;

    const ecommerceName = body?.ecommerce_name !== undefined ? String(body.ecommerce_name ?? '').trim() : (productRow.ecommerce_name ?? '').trim();
    const mainDescription = body?.main_description !== undefined ? String(body.main_description ?? '').trim() : (productRow.main_description ?? '').trim();
    const seoSlug = body?.seo_slug !== undefined ? String(body.seo_slug ?? '').trim() : (productRow.seo_slug ?? '').trim();
    const seoTitle = body?.seo_title !== undefined ? String(body.seo_title ?? '').trim() : (productRow.seo_title ?? '').trim();
    const seoDescription = body?.seo_description !== undefined ? String(body.seo_description ?? '').trim() : (productRow.seo_description ?? '').trim();
    const seoKeywords = body?.seo_keywords !== undefined ? String(body.seo_keywords ?? '').trim() : (productRow.seo_keywords ?? '').trim();
    const uploadedPaths = body?.uploaded_image_paths && Array.isArray(body.uploaded_image_paths)
      ? body.uploaded_image_paths.filter((x): x is string => typeof x === 'string' && (x.startsWith('catalog/') || x.startsWith('data/')))
      : null;

    const updatePrice = body?.update_price !== false;
    const updateDescription = body?.update_description !== false;
    const updateImages = body?.update_images !== false;

    let imagePaths: string[] = [];
    if (uploadedPaths && uploadedPaths.length > 0) {
      imagePaths = uploadedPaths;
    } else if (body?.images && Array.isArray(body.images)) {
      imagePaths = body.images.filter((x): x is string => typeof x === 'string');
    } else {
      try {
        const imgVal = productRow.image;
        if (imgVal) {
          const parsed = JSON.parse(imgVal);
          imagePaths = Array.isArray(parsed) ? parsed.filter((x: unknown) => typeof x === 'string') : [String(imgVal)];
        }
      } catch {
        if (productRow.image) imagePaths = [String(productRow.image)];
      }
    }

    const sku = (productRow.sku ?? '').trim();
    if (!sku) return c.json({ error: 'Ürün SKU\'su boş. OpenCart eşleşmesi/oluşturma için SKU gerekli.' }, 400);

    const config = await getOpencartMysqlConfig(c);
    if (!config) return c.json({ error: 'OpenCart MySQL bağlantı ayarları yapılandırılmalı. Ayarlar > Veri Aktarımı.' }, 400);
    const settings = await getOpencartMysqlSettings(c);
    if (!settings) return c.json({ error: 'OpenCart ayarları alınamadı' }, 500);

    const languageId = parseInt(settings.language_id ?? '1') || 1;
    const storeId = parseInt(settings.store_id ?? '0') || 0;
    const prefix = settings.table_prefix ?? 'oc_';
    const tblProduct = prefix + 'product';
    const tblDesc = prefix + 'product_description';
    const tblImage = prefix + 'product_image';
    const tblProductToCategory = prefix + 'product_to_category';
    const tblProductToStore = prefix + 'product_to_store';
    const ocSettings = settings as Record<string, string>;
    const imageUploadUrl = ocSettings.image_upload_url?.trim();

    const connection = await createMysqlConnection(config);
    try {
      const conn = connection as unknown as { execute: (sql: string, values?: unknown[]) => Promise<[unknown[]]> };

      const [ocRows] = await conn.execute(
        `SELECT product_id FROM ${tblProduct} WHERE TRIM(COALESCE(model, '')) = ? LIMIT 1`,
        [sku]
      );
      let ocProductId = (ocRows as { product_id?: number }[])[0]?.product_id;
      const isNewProduct = !ocProductId;

      if (isNewProduct) {
        const [catRows] = await conn.execute(
          `SELECT category_id FROM ${prefix}category WHERE status = 1 ORDER BY sort_order ASC, category_id ASC LIMIT 1`
        );
        const defaultCategoryId = (catRows as { category_id?: number }[])[0]?.category_id ?? 0;
        const defaultCat = parseInt(ocSettings.default_category_id ?? '') || defaultCategoryId;

        const ocName = ecommerceName || productRow.name;
        const ocDesc = mainDescription;
        const ocMetaTitle = seoTitle;
        const ocMetaDesc = seoDescription;
        const ocMetaKeyword = seoKeywords || seoSlug;

        await conn.execute(
          `INSERT INTO ${tblProduct} (model, sku, quantity, stock_status_id, image, manufacturer_id, shipping, price, weight, weight_class_id, length_class_id, subtract, minimum, sort_order, status, viewed, date_added, date_modified, tax_class_id)
           VALUES (?, ?, ?, 5, '', 0, 1, ?, 0, 1, 1, 1, 1, 0, 1, 0, NOW(), NOW(), 0)`,
          [sku, sku, productRow.quantity ?? 0, productPrice]
        );
        const [insertRows] = await conn.execute(`SELECT LAST_INSERT_ID() as id`);
        ocProductId = (insertRows as { id?: number }[])[0]?.id ?? 0;
        if (!ocProductId) return c.json({ error: 'OpenCart ürün oluşturulamadı' }, 500);

        await conn.execute(
          `INSERT INTO ${tblDesc} (product_id, language_id, name, description, meta_title, meta_description, meta_keyword) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [ocProductId, languageId, ocName, ocDesc, ocMetaTitle, ocMetaDesc, ocMetaKeyword]
        );
        await conn.execute(
          `INSERT INTO ${tblProductToCategory} (product_id, category_id) VALUES (?, ?)`,
          [ocProductId, defaultCat]
        );
        await conn.execute(
          `INSERT INTO ${tblProductToStore} (product_id, store_id) VALUES (?, ?)`,
          [ocProductId, storeId]
        );
      }

      const ocName = ecommerceName || productRow.name;
      const ocDesc = mainDescription;
      const ocMetaTitle = seoTitle;
      const ocMetaDesc = seoDescription;
      const ocMetaKeyword = seoKeywords || seoSlug;

      if (!isNewProduct) {
        if (updateDescription) {
          await conn.execute(
            `UPDATE ${tblDesc} SET name = ?, description = ?, meta_title = ?, meta_description = ?, meta_keyword = ? WHERE product_id = ? AND language_id = ?`,
            [ocName, ocDesc, ocMetaTitle, ocMetaDesc, ocMetaKeyword, ocProductId, languageId]
          );
        }
        if (updatePrice) {
          await conn.execute(`UPDATE ${tblProduct} SET price = ? WHERE product_id = ?`, [productPrice, ocProductId]);
        }
      }

      let ocImagePaths: string[] = [];
      const shouldUpdateImages = isNewProduct || updateImages;
      if (shouldUpdateImages) {
        if (uploadedPaths && uploadedPaths.length > 0) {
          ocImagePaths = uploadedPaths;
        } else {
          const toOcPath = async (r2Key: string): Promise<string> => {
            if (r2Key.startsWith('catalog/') || r2Key.startsWith('data/')) return r2Key;
            if (!imageUploadUrl || !c.env.STORAGE) return `catalog/${r2Key.replace(/^\/+/, '')}`;
            const obj = await c.env.STORAGE.get(r2Key);
            if (!obj) return `catalog/${r2Key.replace(/^\/+/, '')}`;
            const buf = await obj.arrayBuffer();
            const ext = r2Key.split('.').pop()?.toLowerCase() || 'webp';
            const filename = `product_${ocProductId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
            const formData = new FormData();
            formData.append('file', new Blob([buf], { type: obj.httpMetadata?.contentType || 'image/webp' }), filename);
            formData.append('product_id', String(ocProductId));
            const uploadRes = await fetch(imageUploadUrl, { method: 'POST', body: formData });
            const uploadJson = (await uploadRes.json().catch(() => ({}))) as { path?: string; error?: string };
            if (uploadJson.path) return uploadJson.path;
            return `catalog/${r2Key.replace(/^\/+/, '')}`;
          };
          for (const path of imagePaths) {
            const p = (path ?? '').trim();
            if (!p || p.startsWith('http')) continue;
            try {
              ocImagePaths.push(await toOcPath(p));
            } catch {
              ocImagePaths.push(`catalog/${p.replace(/^\/+/, '')}`);
            }
          }
        }

        const mainOcPath = ocImagePaths[0];
        if (mainOcPath) {
          await conn.execute(`UPDATE ${tblProduct} SET image = ? WHERE product_id = ?`, [mainOcPath, ocProductId]);
        }
        await conn.execute(`DELETE FROM ${tblImage} WHERE product_id = ?`, [ocProductId]);
        for (let i = 1; i < ocImagePaths.length; i++) {
          const ocPath = ocImagePaths[i];
          if (!ocPath) continue;
          await conn.execute(`INSERT INTO ${tblImage} (product_id, image, sort_order) VALUES (?, ?, ?)`, [ocProductId, ocPath, i]);
        }
      }

      const imagesUploaded = (!!uploadedPaths && uploadedPaths.length > 0) || (!!imageUploadUrl && ocImagePaths.length > 0);
      return c.json({
        ok: true,
        message: isNewProduct ? 'OpenCart\'ta yeni ürün oluşturuldu' : 'OpenCart\'a yayınlandı',
        created: isNewProduct,
        opencart_product_id: ocProductId,
        updated: {
          name: ocName,
          description: !!ocDesc,
          meta_title: !!ocMetaTitle,
          meta_description: !!ocMetaDesc,
          price: productPrice,
          images: ocImagePaths.length,
          images_uploaded: imagesUploaded,
        },
        image_upload_hint: !imagesUploaded && imagePaths.length > 0 && shouldUpdateImages
          ? 'Görseller OpenCart sunucusuna yüklenmedi. Ayarlar > app_settings opencart_mysql kategorisine image_upload_url ekleyin. scripts/opencart-image-upload.php dosyasını OpenCart image/catalog/ klasörüne yükleyin.'
          : undefined,
      });
    } finally {
      await connection.end();
    }
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Yayınlama başarısız' }, 500);
  }
});

async function ensureIdeasoftMarketplaceId(db: D1Database): Promise<number> {
  const select = () =>
    db.prepare(
      `SELECT id FROM product_marketplaces WHERE code = 'ideasoft' AND is_deleted = 0 LIMIT 1`
    ).first<{ id: number }>();

  let row = await select();
  if (row?.id) return row.id;

  try {
    await db.prepare(
      `INSERT INTO product_marketplaces (name, code, status, is_deleted) VALUES ('IdeaSoft', 'ideasoft', 1, 0)`
    ).run();
  } catch {
    /* Aynı anda iki istek marketplace eklerse UNIQUE ihlali — satırı tekrar oku */
  }

  row = await select();
  if (row?.id) return row.id;

  const last = await db.prepare(`SELECT last_insert_rowid() as id`).first<{ id: number }>();
  return last?.id ?? 0;
}

const IDEASOFT_CATEGORY_MAPPINGS_KEY = 'ideasoft_category_mappings';
const IDEASOFT_BRAND_MAPPINGS_KEY = 'ideasoft_brand_mappings';
const IDEASOFT_CURRENCY_MAPPINGS_KEY = 'ideasoft_currency_mappings';

/**
 * Eşleştirmede bazen yalnızca sayısal id gerekirken URL, /admin-api/categories/123 veya kopya-yapıştır kalıntısı gelir.
 * Ideasoft Admin API kategori ilişkileri sayısal id ile çalışır.
 */
function normalizeIdeasoftCategoryMappingId(raw: string): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (/^\d+$/.test(s)) return s;
  const fromPath = s.match(/\/categories\/(\d+)(?:\/|$|\?|#)/i);
  if (fromPath) return fromPath[1];
  const parts = s.split(/[/\\]/).map((p) => p.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/^\d+$/.test(parts[i])) return parts[i];
  }
  return s;
}

/** Master para birimi id → Ideasoft Currency id (URL veya düz sayı) */
function normalizeIdeasoftCurrencyMappingId(raw: string): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (/^\d+$/.test(s)) return s;
  const fromPath = s.match(/\/(?:currencies|product_currencies)\/(\d+)(?:\/|$|\?|#)/i);
  if (fromPath) return fromPath[1];
  const parts = s.split(/[/\\]/).map((p) => p.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/^\d+$/.test(parts[i])) return parts[i];
  }
  return s;
}

function resolveIdeasoftCurrencyIdFromMapping(
  map: Record<string, string>,
  masterCurrencyId: number | null
): string | null {
  if (masterCurrencyId == null || masterCurrencyId <= 0) return null;
  const hit = (map[String(masterCurrencyId)] ?? '').trim();
  if (!hit) return null;
  const norm = normalizeIdeasoftCurrencyMappingId(hit);
  return norm || null;
}

/** Seçilen kategori ve alt kategorilerdeki ürünleri listelemek için (product_categories.category_id üst bağlantısı) */
async function collectCategorySubtreeIds(db: D1Database, rootId: number): Promise<number[]> {
  const out = new Set<number>([rootId]);
  let frontier: number[] = [rootId];
  for (let depth = 0; depth < 48 && frontier.length > 0; depth++) {
    const next: number[] = [];
    for (const parentId of frontier) {
      const { results } = await db
        .prepare(`SELECT id FROM product_categories WHERE category_id = ? AND is_deleted = 0`)
        .bind(parentId)
        .all();
      for (const r of results as { id: number }[]) {
        if (!out.has(r.id)) {
          out.add(r.id);
          next.push(r.id);
        }
      }
    }
    frontier = next;
  }
  return [...out];
}

async function loadIdeasoftJsonSettingMap(db: D1Database, key: string): Promise<Record<string, string>> {
  try {
    const { results } = await db.prepare(
      `SELECT value FROM app_settings WHERE category = 'ideasoft' AND "key" = ? AND is_deleted = 0 AND (status = 1 OR status IS NULL) LIMIT 1`
    )
      .bind(key)
      .all();
    const raw = (results as { value?: string }[])[0]?.value;
    if (!raw?.trim()) return {};
    const p = JSON.parse(raw) as Record<string, unknown>;
    if (typeof p !== 'object' || p === null) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(p)) {
      const s = String(v ?? '').trim();
      if (s) out[String(k)] = s;
    }
    return out;
  } catch {
    return {};
  }
}

/** Ürünün doğrudan category_id’si için eşleme yoksa üst (category_id) ve grup (group_id) zincirinde arar */
async function resolveIdeasoftCategoryIdFromMapping(
  db: D1Database,
  catMap: Record<string, string>,
  categoryId: number | null
): Promise<string | null> {
  if (categoryId == null || categoryId <= 0) return null;
  const visited = new Set<number>();
  let cur: number | null = categoryId;
  for (let i = 0; i < 48 && cur != null && cur > 0; i++) {
    if (visited.has(cur)) break;
    visited.add(cur);
    const hit = (catMap[String(cur)] ?? '').trim();
    if (hit) {
      const norm = normalizeIdeasoftCategoryMappingId(hit);
      if (norm) return norm;
    }
    const row = await db
      .prepare(
        `SELECT category_id, group_id FROM product_categories WHERE id = ? AND is_deleted = 0`
      )
      .bind(cur)
      .first<{ category_id: number | null; group_id: number | null }>();
    if (!row) break;
    if (row.category_id != null && row.category_id > 0) {
      cur = row.category_id;
      continue;
    }
    if (row.group_id != null && row.group_id > 0) {
      cur = row.group_id;
      continue;
    }
    break;
  }
  return null;
}

/** `0068_add_seo_keywords_to_product_descriptions` henüz uygulanmamış D1 ortamları */
function d1ErrorIsMissingSeoKeywordsColumn(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err);
  return /no such column:\s*seo_keywords/i.test(raw);
}

/** SELECT’te `pd.seo_keywords` → `NULL AS seo_keywords` (sonuç alanı aynı kalır). */
function sqlSelectWithoutSeoKeywordsColumn(sql: string): string {
  return sql.replace(/\bpd\.seo_keywords\b/g, 'NULL AS seo_keywords');
}

async function d1FirstWithSeoKeywordsSelectFallback<T>(
  db: D1Database,
  sql: string,
  bindArgs: unknown[]
): Promise<T | null> {
  try {
    return await db.prepare(sql).bind(...bindArgs).first<T>();
  } catch (e: unknown) {
    if (d1ErrorIsMissingSeoKeywordsColumn(e)) {
      return await db.prepare(sqlSelectWithoutSeoKeywordsColumn(sql)).bind(...bindArgs).first<T>();
    }
    throw e;
  }
}

async function d1AllWithSeoKeywordsSelectFallback<T>(
  db: D1Database,
  sql: string,
  bindArgs: unknown[]
): Promise<{ results: T[] | null }> {
  try {
    return await db.prepare(sql).bind(...bindArgs).all<T>();
  } catch (e: unknown) {
    if (d1ErrorIsMissingSeoKeywordsColumn(e)) {
      return await db.prepare(sqlSelectWithoutSeoKeywordsColumn(sql)).bind(...bindArgs).all<T>();
    }
    throw e;
  }
}

async function insertProductDescriptionsRowWithSeoKeywordsFallback(
  db: D1Database,
  productId: number,
  ecomName: string | null,
  mainDesc: string | null,
  seoSlug: string | null,
  seoTitle: string | null,
  seoDesc: string | null,
  seoKeywords: string | null
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO product_descriptions (product_id, ecommerce_name, main_description, seo_slug, seo_title, seo_description, seo_keywords) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(productId, ecomName, mainDesc, seoSlug, seoTitle, seoDesc, seoKeywords)
      .run();
  } catch (e: unknown) {
    if (!d1ErrorIsMissingSeoKeywordsColumn(e)) throw e;
    await db
      .prepare(
        `INSERT INTO product_descriptions (product_id, ecommerce_name, main_description, seo_slug, seo_title, seo_description) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(productId, ecomName, mainDesc, seoSlug, seoTitle, seoDesc)
      .run();
  }
}

async function updateProductDescriptionsWithSeoKeywordsFallback(
  db: D1Database,
  descUpdates: string[],
  descVals: (string | null)[],
  productId: number
): Promise<void> {
  try {
    await db
      .prepare(`UPDATE product_descriptions SET ${descUpdates.join(', ')} WHERE product_id = ?`)
      .bind(...descVals, productId)
      .run();
  } catch (e: unknown) {
    if (!d1ErrorIsMissingSeoKeywordsColumn(e)) throw e;
    const idx = descUpdates.findIndex((u) => u.startsWith('seo_keywords'));
    if (idx === -1) throw e;
    const newU = descUpdates.filter((_, i) => i !== idx);
    const newV = descVals.filter((_, i) => i !== idx);
    await db
      .prepare(`UPDATE product_descriptions SET ${newU.join(', ')} WHERE product_id = ?`)
      .bind(...newV, productId)
      .run();
  }
}

/** Ideasoft push / önizleme: ürün + açıklama satırı. `ecommerce_enabled` migration’ı yoksa sütunsuz sorguya düşer. */
type IdeasoftPushProductDbRow = {
  id: number;
  name: string;
  sku: string | null;
  quantity: number;
  category_id: number | null;
  brand_id: number | null;
  image: string | null;
  ecommerce_enabled: number;
  ecommerce_name: string | null;
  main_description: string | null;
  seo_slug: string | null;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string | null;
};

async function fetchProductRowForIdeasoft(db: D1Database, productId: number): Promise<IdeasoftPushProductDbRow | null> {
  const sqlWithEcommerce = `SELECT p.id, p.name, p.sku, p.quantity, p.category_id, p.brand_id, p.image,
       COALESCE(p.ecommerce_enabled, 1) as ecommerce_enabled,
       pd.ecommerce_name, pd.main_description,
       pd.seo_slug, pd.seo_title, pd.seo_description, pd.seo_keywords
       FROM products p
       LEFT JOIN product_descriptions pd ON pd.product_id = p.id AND pd.is_deleted = 0
       WHERE p.id = ? AND p.is_deleted = 0`;
  const sqlLegacy = `SELECT p.id, p.name, p.sku, p.quantity, p.category_id, p.brand_id, p.image,
       1 as ecommerce_enabled,
       pd.ecommerce_name, pd.main_description,
       pd.seo_slug, pd.seo_title, pd.seo_description, pd.seo_keywords
       FROM products p
       LEFT JOIN product_descriptions pd ON pd.product_id = p.id AND pd.is_deleted = 0
       WHERE p.id = ? AND p.is_deleted = 0`;

  try {
    return await d1FirstWithSeoKeywordsSelectFallback<IdeasoftPushProductDbRow>(db, sqlWithEcommerce, [productId]);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/no such column:\s*ecommerce_enabled/i.test(msg)) {
      return await d1FirstWithSeoKeywordsSelectFallback<IdeasoftPushProductDbRow>(db, sqlLegacy, [productId]);
    }
    throw e;
  }
}

/** Ideasoft ürün gövdesi: SEO + dahili ad (slug vitrin adı / seo_slug ile `ideasoftUpsertProduct` içinde üretilir) */
function ideasoftSeoFieldsFromProductRow(row: IdeasoftPushProductDbRow) {
  return {
    internalName: row.name,
    seoSlug: row.seo_slug,
    pageTitle: (row.seo_title ?? '').trim() || null,
    metaDescription: (row.seo_description ?? '').trim() || null,
    metaKeywords: (row.seo_keywords ?? '').trim() || null,
    searchKeywords: (row.seo_keywords ?? '').trim() || null,
  };
}

function ideasoftHasSeoContentInRow(row: IdeasoftPushProductDbRow): boolean {
  const s = (v: string | null | undefined) => (v ?? '').trim().length > 0;
  return s(row.seo_slug) || s(row.seo_title) || s(row.seo_description) || s(row.seo_keywords);
}

/** Ideasoft aktarım sonrası arayüzde tik / çarpı listesi için */
function buildIdeasoftTransferReport(params: {
  productCategoryId: number | null;
  productBrandId: number | null;
  categoryIdeasoftId: string | null;
  brandIdeasoftId: string | null;
  /** Master product_currencies.id (fiyat satırı); eşleme tablosu anahtarı */
  masterCurrencyId: number | null;
  currencyCode: string;
  /** ideasoft_currency_mappings’ten gelen Ideasoft currency id (sayısal string) */
  currencyIdeasoftId: string | null;
  hasSeoInDb: boolean;
  categoryWarning?: string;
  brandWarning?: string;
  imageCount: number;
  imagesUploaded: number;
  imageWarnings: string[];
}): { steps: { id: string; label: string; ok: boolean; detail?: string }[] } {
  const steps: { id: string; label: string; ok: boolean; detail?: string }[] = [];

  steps.push({
    id: 'core',
    label: 'Ürün adı ve açıklama',
    ok: true,
    detail: 'Ideasoft ürün kaydına yazıldı',
  });

  if (params.hasSeoInDb) {
    steps.push({
      id: 'seo',
      label: 'SEO içerikleri',
      ok: true,
      detail: 'Meta başlık / açıklama / anahtar kelime isteğe dahil',
    });
  } else {
    steps.push({
      id: 'seo',
      label: 'SEO içerikleri',
      ok: true,
      detail: 'Kayıtta doldurulmuş SEO alanı yok',
    });
  }

  const cid = params.productCategoryId;
  const cMap = (params.categoryIdeasoftId ?? '').trim();
  const cw = (params.categoryWarning ?? '').trim();
  if (cid == null || cid <= 0) {
    steps.push({
      id: 'category',
      label: 'Kategori',
      ok: true,
      detail: 'Üründe yerel kategori seçili değil',
    });
  } else if (!cMap) {
    steps.push({
      id: 'category',
      label: 'Kategori',
      ok: false,
      detail: 'Ideasoft kategori eşlemesi tanımlı değil',
    });
  } else if (cw) {
    steps.push({
      id: 'category',
      label: 'Kategori',
      ok: false,
      detail: cw,
    });
  } else {
    steps.push({
      id: 'category',
      label: 'Kategori',
      ok: true,
      detail: `Ideasoft kategori: ${cMap}`,
    });
  }

  const bid = params.productBrandId;
  const bMap = (params.brandIdeasoftId ?? '').trim();
  const bw = (params.brandWarning ?? '').trim();
  if (bid == null || bid <= 0) {
    steps.push({
      id: 'brand',
      label: 'Marka',
      ok: true,
      detail: 'Üründe yerel marka seçili değil',
    });
  } else if (!bMap) {
    steps.push({
      id: 'brand',
      label: 'Marka',
      ok: false,
      detail: 'Ideasoft marka eşlemesi tanımlı değil',
    });
  } else if (bw) {
    steps.push({
      id: 'brand',
      label: 'Marka',
      ok: false,
      detail: bw,
    });
  } else {
    steps.push({
      id: 'brand',
      label: 'Marka',
      ok: true,
      detail: `Ideasoft marka: ${bMap}`,
    });
  }

  const curIso = (params.currencyCode ?? 'TRY').trim().toUpperCase();
  const curMap = (params.currencyIdeasoftId ?? '').trim();
  const mid = params.masterCurrencyId;
  if (curMap) {
    steps.push({
      id: 'currency',
      label: 'Para birimi',
      ok: true,
      detail:
        mid != null && mid > 0
          ? `Master pb #${mid} → Ideasoft currency #${curMap} (${curIso})`
          : `Ideasoft currency #${curMap} (${curIso})`,
    });
  } else {
    steps.push({
      id: 'currency',
      label: 'Para birimi',
      ok: true,
      detail:
        mid != null && mid > 0
          ? `Eşleşme yok — ${curIso} kodu ile mağaza para birimi aranıyor (master pb #${mid})`
          : `Eşleşme yok — ${curIso} kodu ile mağaza para birimi aranıyor`,
    });
  }

  if (params.imageCount <= 0) {
    steps.push({
      id: 'images',
      label: 'Görseller',
      ok: true,
      detail: 'Aktarılacak görsel yok',
    });
  } else {
    const hasErr = params.imageWarnings.length > 0;
    const allOk = params.imageCount > 0 && params.imagesUploaded >= params.imageCount && !hasErr;
    steps.push({
      id: 'images',
      label: 'Görseller',
      ok: allOk,
      detail: allOk
        ? `${params.imagesUploaded} görsel gönderildi`
        : `${params.imagesUploaded}/${params.imageCount} görsel; ${params.imageWarnings.slice(0, 2).join(' · ') || 'bazı görsellerde hata'}`,
    });
  }

  return { steps };
}

/** D1’de migration uygulanmamışsa (tablo yok) ham SQLITE metni yerine açıklayıcı mesaj */
function d1SchemaErrorMessage(err: unknown): string | null {
  const raw = err instanceof Error ? err.message : String(err);
  if (!/no such table/i.test(raw)) return null;
  const m = raw.match(/no such table:\s*(\S+)/i);
  const table = m?.[1]?.replace(/[:;]/g, '') ?? 'tablo';
  return `Veritabanı şeması eksik: "${table}" tablosu yok. Bu ortamdaki D1 veritabanına migration uygulanmalı (apps/api: npx wrangler d1 migrations apply esync-db --remote).`;
}

/** E-ticaret fiyatı (price_type_id=1) + ISO 4217 para kodu (product_prices → product_currencies) */
async function getEcommercePriceAndCurrency(
  db: D1Database,
  productId: number
): Promise<{ price: number; currencyCode: string }> {
  const row = await db
    .prepare(
      `SELECT pp.price, pc.code as currency_code
       FROM product_prices pp
       LEFT JOIN product_currencies pc ON pc.id = pp.currency_id AND pc.is_deleted = 0 AND (pc.status = 1 OR pc.status IS NULL)
       WHERE pp.product_id = ? AND pp.price_type_id = 1 AND pp.is_deleted = 0 AND (pp.status = 1 OR pp.status IS NULL)
       LIMIT 1`
    )
    .bind(productId)
    .first<{ price: number | null; currency_code: string | null }>();

  const price =
    typeof row?.price === 'number' && !Number.isNaN(row.price) ? row.price : 0;
  let code = (row?.currency_code ?? '').trim().toUpperCase();
  if (!code) {
    const def = await db
      .prepare(
        `SELECT code FROM product_currencies WHERE is_default = 1 AND is_deleted = 0 AND (status = 1 OR status IS NULL) LIMIT 1`
      )
      .first<{ code: string }>();
    code = (def?.code ?? 'TRY').trim().toUpperCase();
  }
  if (!/^[A-Z]{3}$/.test(code)) code = 'TRY';
  return { price, currencyCode: code };
}

/** Genel fiyat (products.price) + ISO 4217 para kodu (products.currency_id → product_currencies) — Ideasoft aktarımı için */
async function getGeneralPriceAndCurrency(
  db: D1Database,
  productId: number
): Promise<{ price: number; currencyCode: string; currencyId: number | null }> {
  const row = await db
    .prepare(
      `SELECT p.price, p.currency_id as master_currency_id, pc.code as currency_code
       FROM products p
       LEFT JOIN product_currencies pc ON pc.id = p.currency_id AND pc.is_deleted = 0 AND (pc.status = 1 OR pc.status IS NULL)
       WHERE p.id = ? AND p.is_deleted = 0
       LIMIT 1`
    )
    .bind(productId)
    .first<{ price: number | null; master_currency_id: number | null; currency_code: string | null }>();

  const price =
    typeof row?.price === 'number' && !Number.isNaN(row.price) ? row.price : 0;
  let currencyId: number | null =
    typeof row?.master_currency_id === 'number' && row.master_currency_id > 0
      ? row.master_currency_id
      : null;
  let code = (row?.currency_code ?? '').trim().toUpperCase();
  if (!code) {
    const def = await db
      .prepare(
        `SELECT id, code FROM product_currencies WHERE is_default = 1 AND is_deleted = 0 AND (status = 1 OR status IS NULL) LIMIT 1`
      )
      .first<{ id: number; code: string }>();
    code = (def?.code ?? 'TRY').trim().toUpperCase();
    /** Join başarısız (silinmiş/pasif para birimi) veya kod boş — eşleştirme anahtarı için varsayılan satırı kullan */
    if (def?.id != null && def.id > 0) {
      currencyId = def.id;
    }
  }
  if (!/^[A-Z]{3}$/.test(code)) code = 'TRY';
  return { price, currencyCode: code, currencyId };
}

/** Ideasoft bağlantı durumu: token var mı, süresi dolmuş mu? */
app.get('/api/ideasoft/status', async (c) => {
  try {
    if (!c.env.DB) return c.json({ connected: false, error: 'DB bulunamadı' });
    const settings = await loadIdeasoftSettings(c.env.DB);
    const storeBase = normalizeStoreBase(settings.store_base_url || '');
    const hasConfig = !!(storeBase && settings.client_id?.trim());
    if (!hasConfig) return c.json({ connected: false, reason: 'config_missing' });
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = parseInt(settings.IDEASOFT_TOKEN_EXPIRES_AT || '0', 10);
    const hasToken = !!(settings.IDEASOFT_ACCESS_TOKEN?.trim());
    const isExpired = hasToken && expiresAt > 0 && expiresAt <= now;
    const expiresInSec = hasToken && expiresAt > now ? expiresAt - now : 0;
    return c.json({
      connected: hasToken && !isExpired,
      hasToken,
      isExpired,
      expiresInSec,
      storeBase,
      reason: !hasToken ? 'no_token' : isExpired ? 'expired' : 'ok',
    });
  } catch {
    return c.json({ connected: false, reason: 'error' });
  }
});

/** Ideasoft OAuth: yetkilendirme sayfasına yönlendir */
app.get('/api/ideasoft/oauth/start', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const settings = await loadIdeasoftSettings(c.env.DB);
    const base = normalizeStoreBase(settings.store_base_url || '');
    const clientId = (settings.client_id || '').trim();
    const clientSecret = (settings.client_secret || '').trim();
    if (!base || !clientId || !clientSecret) {
      return c.json(
        { error: 'Mağaza adresi, Client ID ve Client Secret gerekli (Ayarlar > Entegrasyonlar > IdeaSoft).' },
        400
      );
    }
    const redirectUri = getIdeasoftRedirectUriFromRequest(c.req.url);
    const returnTo = parseReturnToQuery(c.req.query('return_to'), c.req.url);
    const nonce = crypto.randomUUID();
    const exp = Math.floor(Date.now() / 1000) + 600;
    await saveIdeasoftOAuthPending(c.env.DB, { nonce, exp, returnTo });
    let scope = (settings.oauth_scope ?? '').trim();
    if (scope === 'public') scope = '';
    let authorizePath = (settings.oauth_authorize_path || '/panel/auth').trim() || '/panel/auth';
    /** Eski varsayılanlar — bu mağazada /admin/oauth/authorize sık 404 veriyor; resmi yol /panel/auth */
    if (authorizePath === '/admin/user/auth' || authorizePath === '/admin/oauth/authorize') {
      authorizePath = '/panel/auth';
    }
    const url = buildIdeasoftAuthorizeUrl(base, clientId, redirectUri, nonce, scope || undefined, authorizePath);
    return c.redirect(url, 302);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'OAuth başlatılamadı' }, 500);
  }
});

/** Ideasoft OAuth callback — token alır, ayarlara yazar */
app.get('/oauth/ideasoft/callback', async (c) => {
  try {
    if (!c.env.DB) return c.text('Veritabanı yok', 500);
    const errQ = (c.req.query('error') || '').trim();
    const state = (c.req.query('state') || '').trim();
    const code = (c.req.query('code') || '').trim();
    const pending = state ? await verifyIdeasoftOAuthPending(c.env.DB, state) : null;
    const returnTo = pending?.returnTo || parseReturnToQuery(undefined, c.req.url);
    const safeReturnUrl = (): URL => {
      try {
        return new URL(returnTo);
      } catch {
        return new URL('https://app.e-syncplus.com/ayarlar/entegrasyonlar/ideasoft');
      }
    };
    const failRedirect = async (msg: string) => {
      await clearIdeasoftOAuthPending(c.env.DB);
      const u = safeReturnUrl();
      u.searchParams.set('ideasoft_error', msg);
      return c.redirect(u.toString(), 302);
    };
    if (errQ) {
      const errDesc = (c.req.query('error_description') || '').trim();
      let msg = errQ;
      if (errDesc) {
        try {
          msg = `${errQ}: ${decodeURIComponent(errDesc.replace(/\+/g, ' '))}`;
        } catch {
          msg = `${errQ}: ${errDesc}`;
        }
      }
      return failRedirect(msg);
    }
    if (!code || !pending) {
      return failRedirect('Geçersiz veya süresi dolmuş OAuth isteği');
    }
    const settings = await loadIdeasoftSettings(c.env.DB);
    const base = normalizeStoreBase(settings.store_base_url || '');
    const clientId = (settings.client_id || '').trim();
    const clientSecret = (settings.client_secret || '').trim();
    const redirectUri = getIdeasoftRedirectUriFromRequest(c.req.url);
    if (!base || !clientId || !clientSecret) {
      return failRedirect('IdeaSoft ayarları eksik');
    }
    const ex = await exchangeIdeasoftAuthorizationCode(c.env.DB, base, clientId, clientSecret, code, redirectUri);
    if (!ex.ok) {
      return failRedirect(ex.error);
    }
    await clearIdeasoftOAuthPending(c.env.DB);
    const okUrl = safeReturnUrl();
    okUrl.searchParams.set('ideasoft_connected', '1');
    return c.redirect(okUrl.toString(), 302);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Callback hatası';
    try {
      const u = new URL(parseReturnToQuery(undefined, c.req.url));
      u.searchParams.set('ideasoft_error', msg);
      return c.redirect(u.toString(), 302);
    } catch {
      return c.text(msg, 500);
    }
  }
});

/** Ürünü Ideasoft Admin API ile oluşturur veya günceller */
app.post('/api/products/:id/publish/ideasoft', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const body = await c.req.json<{
      ecommerce_name?: string;
      main_description?: string;
      update_price?: boolean;
      update_description?: boolean;
    }>().catch(() => null);

    const productId = Number(id);
    if (!Number.isFinite(productId) || productId <= 0) return c.json({ error: 'Geçersiz ürün id' }, 400);

    const productRow = await fetchProductRowForIdeasoft(c.env.DB, productId);
    if (!productRow) return c.json({ error: 'Ürün bulunamadı' }, 404);
    if (productRow.ecommerce_enabled === 0) {
      return c.json({ error: 'Bu ürün e-ticarete kapalı.' }, 400);
    }

    const { price: productPrice, currencyCode, currencyId: masterCurrencyId } = await getGeneralPriceAndCurrency(
      c.env.DB,
      productRow.id
    );

    const settings = await loadIdeasoftSettings(c.env.DB);
    const storeBase = normalizeStoreBase(settings.store_base_url || '');
    if (!storeBase) {
      return c.json({ error: 'Ideasoft mağaza adresi ayarlı değil (Ayarlar > IdeaSoft).' }, 400);
    }

    const token = await getIdeasoftAccessToken(c.env);
    if (!token) {
      return c.json(
        {
          error:
            'Ideasoft OAuth bağlantısı yok veya süresi doldu. Ayarlar > IdeaSoft üzerinden "Ideasoft ile bağlan" ile yetkilendirin.',
        },
        401
      );
    }

    const sku = (productRow.sku ?? '').trim();
    if (!sku) {
      return c.json({ error: 'Ürün SKU\'su zorunlu.' }, 400);
    }

    const ecommerceName =
      body?.ecommerce_name !== undefined
        ? String(body.ecommerce_name ?? '').trim()
        : (productRow.ecommerce_name ?? '').trim();
    const mainDescription =
      body?.main_description !== undefined
        ? String(body.main_description ?? '').trim()
        : (productRow.main_description ?? '').trim();
    const name = ecommerceName || productRow.name;
    /** Uzun metin: e-ticaret açıklaması; güncelleme kapalıysa yalnızca kısa metin için vitrin adı (önceki davranış) */
    const desc =
      body?.update_description === false ? name : (mainDescription || name);

    const seo = ideasoftSeoFieldsFromProductRow(productRow);

    const marketplaceId = await ensureIdeasoftMarketplaceId(c.env.DB);
    const mapRow = await c.env.DB.prepare(
      `SELECT id, marketplace_model_code FROM product_mappings WHERE product_id = ? AND marketplace_id = ? AND is_deleted = 0 LIMIT 1`
    )
      .bind(productRow.id, marketplaceId)
      .first<{ id: number; marketplace_model_code: string | null }>();

    let remoteId = (mapRow?.marketplace_model_code || '').trim() || null;
    if (!remoteId) {
      remoteId = await ideasoftFindProductIdBySku(storeBase, token, sku);
    }

    const qty = productRow.quantity ?? 0;

    const catMap = await loadIdeasoftJsonSettingMap(c.env.DB, IDEASOFT_CATEGORY_MAPPINGS_KEY);
    const brandMap = await loadIdeasoftJsonSettingMap(c.env.DB, IDEASOFT_BRAND_MAPPINGS_KEY);
    const currencyMap = await loadIdeasoftJsonSettingMap(c.env.DB, IDEASOFT_CURRENCY_MAPPINGS_KEY);
    const categoryIdeasoftId = await resolveIdeasoftCategoryIdFromMapping(
      c.env.DB,
      catMap,
      productRow.category_id
    );
    const brandIdeasoftId =
      productRow.brand_id != null && productRow.brand_id > 0
        ? (brandMap[String(productRow.brand_id)] || '').trim() || null
        : null;
    const currencyIdeasoftId = resolveIdeasoftCurrencyIdFromMapping(currencyMap, masterCurrencyId);

    const up = await ideasoftUpsertProduct({
      storeBase,
      accessToken: token,
      existingId: remoteId,
      sku,
      name,
      description: desc || name,
      price: productPrice,
      quantity: qty,
      currency: currencyCode,
      currencyIdeasoftId,
      categoryIdeasoftId,
      brandIdeasoftId,
      ...seo,
    });

    if (!up.ok) {
      return c.json(
        {
          error: up.error,
          ideasoft_status: up.status,
          ideasoft_response: up.raw,
        },
        502
      );
    }

    const ideasoftId = up.id;
    const requestOrigin = new URL(c.req.url).origin;
    const imageBuild = await buildIdeasoftImageUploads(c.env.STORAGE, productRow.image, requestOrigin);
    const imageUpload = imageBuild.images.length > 0
      ? await ideasoftUploadProductImages({
          storeBase,
          accessToken: token,
          productId: ideasoftId,
          images: imageBuild.images,
        })
      : { uploaded: 0, errors: [] as string[] };
    const imageWarnings = [...imageBuild.warnings, ...imageUpload.errors];
    const transfer_report = buildIdeasoftTransferReport({
      productCategoryId: productRow.category_id,
      productBrandId: productRow.brand_id,
      categoryIdeasoftId,
      brandIdeasoftId,
      masterCurrencyId,
      currencyCode,
      currencyIdeasoftId,
      hasSeoInDb: ideasoftHasSeoContentInRow(productRow),
      categoryWarning: up.categoryWarning,
      brandWarning: up.brandWarning,
      imageCount: imageBuild.images.length,
      imagesUploaded: imageUpload.uploaded,
      imageWarnings,
    });

    if (mapRow?.id) {
      await c.env.DB.prepare(
        `UPDATE product_mappings SET marketplace_sku = ?, marketplace_model_code = ?, updated_at = datetime('now') WHERE id = ?`
      )
        .bind(sku, ideasoftId, mapRow.id)
        .run();
    } else {
      await c.env.DB.prepare(
        `INSERT INTO product_mappings (product_id, marketplace_id, marketplace_sku, marketplace_model_code, status, is_deleted)
         VALUES (?, ?, ?, ?, 1, 0)`
      )
        .bind(productRow.id, marketplaceId, sku, ideasoftId)
        .run();
    }

    return c.json({
      ok: true,
      message: remoteId ? 'Ideasoft ürünü güncellendi' : 'Ideasoft\'ta yeni ürün oluşturuldu',
      created: !remoteId,
      ideasoft_product_id: ideasoftId,
      ...(up.brandWarning ? { brand_warning: up.brandWarning } : {}),
      ...(up.categoryWarning ? { category_warning: up.categoryWarning } : {}),
      updated: {
        name,
        description: !!desc,
        price: productPrice,
        currency: currencyCode,
        master_currency_id: masterCurrencyId,
        ideasoft_currency_id: currencyIdeasoftId,
        quantity: qty,
      },
      images_uploaded: imageUpload.uploaded,
      ...(imageWarnings.length > 0 ? { image_warnings: imageWarnings } : {}),
      transfer_report,
    });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Yayınlama başarısız' }, 500);
  }
});

/** Ideasoft mağaza kategorileri (Admin API, hydra sayfalı) */
app.get('/api/ideasoft/categories', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const settings = await loadIdeasoftSettings(c.env.DB);
    const storeBase = normalizeStoreBase(settings.store_base_url || '');
    if (!storeBase) {
      return c.json({ error: 'Ideasoft mağaza adresi ayarlı değil (Ayarlar > IdeaSoft).' }, 400);
    }
    const token = await getIdeasoftAccessToken(c.env);
    if (!token) {
      return c.json(
        {
          error:
            'Ideasoft OAuth bağlantısı yok veya süresi doldu. Ayarlar > IdeaSoft üzerinden "Ideasoft ile bağlan" ile yetkilendirin.',
        },
        401
      );
    }
    const result = await ideasoftFetchCategories(storeBase, token);
    if (!result.ok) return c.json({ error: result.error }, 400);
    return c.json({ data: result.categories });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Kategoriler alınamadı' }, 500);
  }
});

/** Ideasoft kategorisi güncelle (sortOrder vb.) */
app.patch('/api/ideasoft/categories/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const settings = await loadIdeasoftSettings(c.env.DB);
    const storeBase = normalizeStoreBase(settings.store_base_url || '');
    if (!storeBase) return c.json({ error: 'Ideasoft mağaza adresi ayarlı değil.' }, 400);
    const token = await getIdeasoftAccessToken(c.env);
    if (!token) return c.json({ error: 'Ideasoft OAuth bağlantısı yok veya süresi doldu.' }, 401);
    const body = await c.req.json<{ sortOrder?: number }>().catch(() => ({}));
    if (body.sortOrder !== undefined && (typeof body.sortOrder !== 'number' || !Number.isFinite(body.sortOrder))) {
      return c.json({ error: 'sortOrder geçerli bir sayı olmalı.' }, 400);
    }
    const result = await ideasoftUpdateCategory(storeBase, token, id, { sortOrder: body.sortOrder });
    if (!result.ok) return c.json({ error: result.error }, 400);
    return c.json({ ok: true });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Kategori güncellenemedi' }, 500);
  }
});

/** Ideasoft kategori oluşturma tanı — ham Ideasoft yanıtını döndürür, kayıt yapmaz */
app.post('/api/ideasoft/debug/create-category', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const settings = await loadIdeasoftSettings(c.env.DB);
    const storeBase = normalizeStoreBase(settings.store_base_url || '');
    if (!storeBase) return c.json({ error: 'Mağaza adresi ayarlı değil' }, 400);
    const token = await getIdeasoftAccessToken(c.env);
    if (!token) return c.json({ error: 'OAuth bağlantısı yok' }, 401);
    const reqBody = await c.req.json<{ testBody?: Record<string, unknown> }>().catch(() => ({}));
    const testBody = reqBody.testBody ?? { name: 'Test Kategori', slug: `test-${Date.now()}`, status: 1 };
    const results: { body: unknown; status: number; response: unknown }[] = [];
    for (const prefix of ['admin-api', 'api']) {
      const url = `${storeBase}/${prefix}/categories`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(testBody),
      });
      const text = await res.text();
      let parsed: unknown = text;
      try { parsed = JSON.parse(text); } catch { /* ignore */ }
      results.push({ body: testBody, status: res.status, response: parsed });
      if (res.ok) break;
    }
    return c.json({ storeBase, results });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Tanı başarısız' }, 500);
  }
});

/** Ideasoft'ta yeni kategori oluştur */
app.post('/api/ideasoft/categories', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const settings = await loadIdeasoftSettings(c.env.DB);
    const storeBase = normalizeStoreBase(settings.store_base_url || '');
    if (!storeBase) return c.json({ error: 'Ideasoft mağaza adresi ayarlı değil.' }, 400);
    const token = await getIdeasoftAccessToken(c.env);
    if (!token) return c.json({ error: 'Ideasoft OAuth bağlantısı yok veya süresi doldu.' }, 401);
    const body = await c.req.json<{ name?: string; parentId?: string | null }>().catch(() => ({}));
    const name = (body.name || '').trim();
    if (!name) return c.json({ error: 'Kategori adı gerekli.' }, 400);
    const result = await ideasoftCreateCategory(storeBase, token, name, body.parentId);
    if (!result.ok) return c.json({ error: result.error }, 400);
    return c.json({ id: result.id, name: result.name });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Kategori oluşturulamadı' }, 500);
  }
});

/** Ideasoft kategori API tanı (ham Ideasoft yanıtı + denenen yollar) */
app.get('/api/ideasoft/debug/categories', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const settings = await loadIdeasoftSettings(c.env.DB);
    const storeBase = normalizeStoreBase(settings.store_base_url || '');
    if (!storeBase) return c.json({ error: 'Mağaza adresi ayarlı değil' }, 400);
    const token = await getIdeasoftAccessToken(c.env);
    if (!token) return c.json({ error: 'OAuth bağlantısı yok veya süresi doldu', hint: 'Ayarlar > IdeaSoft > Ideasoft ile bağlan' }, 401);
    const results = await ideasoftDebugCategories(storeBase, token);
    return c.json({ storeBase, results });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Tanı başarısız' }, 500);
  }
});

/** Master kategori id → Ideasoft kategori id (IDEASOFT_CATEGORY_MAPPINGS_KEY) */
app.get('/api/ideasoft/category-mappings', async (c) => {
  try {
    if (!c.env.DB) return c.json({ mappings: {} });
    const { results } = await c.env.DB.prepare(
      `SELECT value FROM app_settings WHERE category = 'ideasoft' AND "key" = ? AND is_deleted = 0 AND (status = 1 OR status IS NULL) LIMIT 1`
    ).bind(IDEASOFT_CATEGORY_MAPPINGS_KEY).all();
    const raw = (results as { value?: string }[])[0]?.value;
    if (!raw?.trim()) return c.json({ mappings: {} });
    const parsed = JSON.parse(raw) as Record<string, string>;
    return c.json({ mappings: typeof parsed === 'object' && parsed !== null ? parsed : {} });
  } catch {
    return c.json({ mappings: {} });
  }
});

app.put('/api/ideasoft/category-mappings', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req.json<{ mappings?: Record<string, string> }>().catch(() => ({}));
    const mappings = body.mappings;
    if (!mappings || typeof mappings !== 'object') return c.json({ error: 'mappings gerekli' }, 400);
    const toSave = Object.fromEntries(
      Object.entries(mappings)
        .filter(([k, v]) => k && v && String(k).trim() && String(v).trim())
        .map(([k, v]) => {
          const norm = normalizeIdeasoftCategoryMappingId(String(v));
          return [String(k).trim(), norm || String(v).trim()];
        })
    );
    const existing = await c.env.DB.prepare(
      `SELECT id FROM app_settings WHERE category = 'ideasoft' AND "key" = ? AND is_deleted = 0 LIMIT 1`
    ).bind(IDEASOFT_CATEGORY_MAPPINGS_KEY).first();
    if (existing) {
      await c.env.DB.prepare(
        `UPDATE app_settings SET value = ?, updated_at = datetime('now') WHERE category = 'ideasoft' AND "key" = ? AND is_deleted = 0`
      ).bind(JSON.stringify(toSave), IDEASOFT_CATEGORY_MAPPINGS_KEY).run();
    } else {
      await c.env.DB.prepare(`INSERT INTO app_settings (category, "key", value) VALUES ('ideasoft', ?, ?)`)
        .bind(IDEASOFT_CATEGORY_MAPPINGS_KEY, JSON.stringify(toSave))
        .run();
    }
    return c.json({ ok: true, mappings: toSave });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Kaydetme hatası' }, 500);
  }
});

/** Master marka id → Ideasoft marka id (IDEASOFT_BRAND_MAPPINGS_KEY) */
app.get('/api/ideasoft/brands', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const settings = await loadIdeasoftSettings(c.env.DB);
    const storeBase = normalizeStoreBase(settings.store_base_url || '');
    if (!storeBase) {
      return c.json({ error: 'Ideasoft mağaza adresi ayarlı değil (Ayarlar > IdeaSoft).' }, 400);
    }
    const token = await getIdeasoftAccessToken(c.env);
    if (!token) {
      return c.json(
        {
          error:
            'Ideasoft OAuth bağlantısı yok veya süresi doldu. Ayarlar > IdeaSoft üzerinden "Ideasoft ile bağlan" ile yetkilendirin.',
        },
        401
      );
    }
    const result = await ideasoftFetchBrands(storeBase, token);
    if (!result.ok) return c.json({ error: result.error }, 400);
    return c.json({ data: result.brands });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Markalar alınamadı' }, 500);
  }
});

app.post('/api/ideasoft/brands', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const settings = await loadIdeasoftSettings(c.env.DB);
    const storeBase = normalizeStoreBase(settings.store_base_url || '');
    if (!storeBase) return c.json({ error: 'Ideasoft mağaza adresi ayarlı değil.' }, 400);
    const token = await getIdeasoftAccessToken(c.env);
    if (!token) return c.json({ error: 'Ideasoft OAuth bağlantısı yok veya süresi doldu.' }, 401);
    const body = await c.req.json<{ name?: string }>().catch(() => ({}));
    const name = (body.name || '').trim();
    if (!name) return c.json({ error: 'Marka adı gerekli.' }, 400);
    const result = await ideasoftCreateBrand(storeBase, token, name);
    if (!result.ok) return c.json({ error: result.error }, 400);
    return c.json({ id: result.id, name: result.name });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Marka oluşturulamadı' }, 500);
  }
});

app.get('/api/ideasoft/debug/brands', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const settings = await loadIdeasoftSettings(c.env.DB);
    const storeBase = normalizeStoreBase(settings.store_base_url || '');
    if (!storeBase) return c.json({ error: 'Mağaza adresi ayarlı değil' }, 400);
    const token = await getIdeasoftAccessToken(c.env);
    if (!token) return c.json({ error: 'OAuth bağlantısı yok veya süresi doldu', hint: 'Ayarlar > IdeaSoft > Ideasoft ile bağlan' }, 401);
    const results = await ideasoftDebugBrands(storeBase, token);
    return c.json({ storeBase, results });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Tanı başarısız' }, 500);
  }
});

app.get('/api/ideasoft/debug/currencies', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const settings = await loadIdeasoftSettings(c.env.DB);
    const storeBase = normalizeStoreBase(settings.store_base_url || '');
    if (!storeBase) return c.json({ error: 'Mağaza adresi ayarlı değil' }, 400);
    const token = await getIdeasoftAccessToken(c.env);
    if (!token) return c.json({ error: 'OAuth bağlantısı yok veya süresi doldu', hint: 'Ayarlar > IdeaSoft > Ideasoft ile bağlan' }, 401);
    const results = await ideasoftDebugCurrencies(storeBase, token);
    return c.json({ storeBase, results });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Tanı başarısız' }, 500);
  }
});

app.get('/api/ideasoft/brand-mappings', async (c) => {
  try {
    if (!c.env.DB) return c.json({ mappings: {} });
    const { results } = await c.env.DB.prepare(
      `SELECT value FROM app_settings WHERE category = 'ideasoft' AND "key" = ? AND is_deleted = 0 AND (status = 1 OR status IS NULL) LIMIT 1`
    ).bind(IDEASOFT_BRAND_MAPPINGS_KEY).all();
    const raw = (results as { value?: string }[])[0]?.value;
    if (!raw?.trim()) return c.json({ mappings: {} });
    const parsed = JSON.parse(raw) as Record<string, string>;
    return c.json({ mappings: typeof parsed === 'object' && parsed !== null ? parsed : {} });
  } catch {
    return c.json({ mappings: {} });
  }
});

app.put('/api/ideasoft/brand-mappings', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req.json<{ mappings?: Record<string, string> }>().catch(() => ({}));
    const mappings = body.mappings;
    if (!mappings || typeof mappings !== 'object') return c.json({ error: 'mappings gerekli' }, 400);
    const toSave = Object.fromEntries(
      Object.entries(mappings).filter(([k, v]) => k && v && String(k).trim() && String(v).trim())
    );
    const existing = await c.env.DB.prepare(
      `SELECT id FROM app_settings WHERE category = 'ideasoft' AND "key" = ? AND is_deleted = 0 LIMIT 1`
    ).bind(IDEASOFT_BRAND_MAPPINGS_KEY).first();
    if (existing) {
      await c.env.DB.prepare(
        `UPDATE app_settings SET value = ?, updated_at = datetime('now') WHERE category = 'ideasoft' AND "key" = ? AND is_deleted = 0`
      ).bind(JSON.stringify(toSave), IDEASOFT_BRAND_MAPPINGS_KEY).run();
    } else {
      await c.env.DB.prepare(`INSERT INTO app_settings (category, "key", value) VALUES ('ideasoft', ?, ?)`)
        .bind(IDEASOFT_BRAND_MAPPINGS_KEY, JSON.stringify(toSave))
        .run();
    }
    return c.json({ ok: true, mappings: toSave });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Kaydetme hatası' }, 500);
  }
});

/** Master product_currencies.id → Ideasoft Currency id (IDEASOFT_CURRENCY_MAPPINGS_KEY) */
app.get('/api/ideasoft/currency-mappings', async (c) => {
  try {
    if (!c.env.DB) return c.json({ mappings: {} });
    const { results } = await c.env.DB.prepare(
      `SELECT value FROM app_settings WHERE category = 'ideasoft' AND "key" = ? AND is_deleted = 0 AND (status = 1 OR status IS NULL) LIMIT 1`
    ).bind(IDEASOFT_CURRENCY_MAPPINGS_KEY).all();
    const raw = (results as { value?: string }[])[0]?.value;
    if (!raw?.trim()) return c.json({ mappings: {} });
    const parsed = JSON.parse(raw) as Record<string, string>;
    return c.json({ mappings: typeof parsed === 'object' && parsed !== null ? parsed : {} });
  } catch {
    return c.json({ mappings: {} });
  }
});

app.put('/api/ideasoft/currency-mappings', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req.json<{ mappings?: Record<string, string> }>().catch(() => ({}));
    const mappings = body.mappings;
    if (!mappings || typeof mappings !== 'object') return c.json({ error: 'mappings gerekli' }, 400);
    const toSave = Object.fromEntries(
      Object.entries(mappings).filter(([k, v]) => k && v && String(k).trim() && String(v).trim())
    );
    const existing = await c.env.DB.prepare(
      `SELECT id FROM app_settings WHERE category = 'ideasoft' AND "key" = ? AND is_deleted = 0 LIMIT 1`
    ).bind(IDEASOFT_CURRENCY_MAPPINGS_KEY).first();
    if (existing) {
      await c.env.DB.prepare(
        `UPDATE app_settings SET value = ?, updated_at = datetime('now') WHERE category = 'ideasoft' AND "key" = ? AND is_deleted = 0`
      ).bind(JSON.stringify(toSave), IDEASOFT_CURRENCY_MAPPINGS_KEY).run();
    } else {
      await c.env.DB.prepare(`INSERT INTO app_settings (category, "key", value) VALUES ('ideasoft', ?, ?)`)
        .bind(IDEASOFT_CURRENCY_MAPPINGS_KEY, JSON.stringify(toSave))
        .run();
    }
    return c.json({ ok: true, mappings: toSave });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Kaydetme hatası' }, 500);
  }
});

app.get('/api/ideasoft/currencies', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const settings = await loadIdeasoftSettings(c.env.DB);
    const storeBase = normalizeStoreBase(settings.store_base_url || '');
    if (!storeBase) {
      return c.json({ error: 'Ideasoft mağaza adresi ayarlı değil (Ayarlar > IdeaSoft).' }, 400);
    }
    const token = await getIdeasoftAccessToken(c.env);
    if (!token) {
      return c.json(
        {
          error:
            'Ideasoft OAuth bağlantısı yok veya süresi doldu. Ayarlar > IdeaSoft üzerinden "Ideasoft ile bağlan" ile yetkilendirin.',
        },
        401
      );
    }
    const result = await ideasoftFetchCurrencies(storeBase, token);
    if (!result.ok) return c.json({ error: result.error }, 400);
    return c.json({ data: result.currencies });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Para birimleri alınamadı' }, 500);
  }
});

/** Ideasoft ürün listesi (eşleştirme / aktarım ekranı) — isteğe bağlı kategori (alt ağaç) ve marka filtresi */
app.get('/api/ideasoft/products/overview', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '50', 10) || 50));
    const page = Math.max(1, parseInt(c.req.query('page') || '1', 10) || 1);
    const offset = (page - 1) * limit;
    const mpId = await ensureIdeasoftMarketplaceId(c.env.DB);

    const catQ = c.req.query('category_id');
    const brandQ = c.req.query('brand_id');
    const categoryFilterId = catQ != null && String(catQ).trim() !== '' ? parseInt(String(catQ), 10) : NaN;
    const brandFilterId = brandQ != null && String(brandQ).trim() !== '' ? parseInt(String(brandQ), 10) : NaN;

    const filterBinds: number[] = [];
    let extraWhere = '';
    if (Number.isFinite(categoryFilterId) && categoryFilterId > 0) {
      const ids = await collectCategorySubtreeIds(c.env.DB, categoryFilterId);
      if (ids.length === 0) {
        extraWhere += ' AND 1=0';
      } else {
        extraWhere += ` AND p.category_id IN (${ids.map(() => '?').join(',')})`;
        filterBinds.push(...ids);
      }
    }
    if (Number.isFinite(brandFilterId) && brandFilterId > 0) {
      extraWhere += ' AND p.brand_id = ?';
      filterBinds.push(brandFilterId);
    }

    const listSqlWithEcommerce = `SELECT p.id, p.name, p.sku, p.category_id, p.brand_id, COALESCE(p.ecommerce_enabled, 1) as ecommerce_enabled,
       pm.marketplace_model_code as ideasoft_product_id
       FROM products p
       LEFT JOIN product_mappings pm ON pm.product_id = p.id AND pm.marketplace_id = ? AND pm.is_deleted = 0
       WHERE p.is_deleted = 0${extraWhere}
       ORDER BY p.id DESC
       LIMIT ? OFFSET ?`;

    const listSqlLegacy = `SELECT p.id, p.name, p.sku, p.category_id, p.brand_id, 1 as ecommerce_enabled,
       pm.marketplace_model_code as ideasoft_product_id
       FROM products p
       LEFT JOIN product_mappings pm ON pm.product_id = p.id AND pm.marketplace_id = ? AND pm.is_deleted = 0
       WHERE p.is_deleted = 0${extraWhere}
       ORDER BY p.id DESC
       LIMIT ? OFFSET ?`;

    let results: unknown;
    try {
      ({ results } = await c.env.DB
        .prepare(listSqlWithEcommerce)
        .bind(mpId, ...filterBinds, limit, offset)
        .all());
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/no such column:\s*ecommerce_enabled/i.test(msg)) {
        ({ results } = await c.env.DB
          .prepare(listSqlLegacy)
          .bind(mpId, ...filterBinds, limit, offset)
          .all());
      } else {
        throw e;
      }
    }

    const countRow = await c.env.DB
      .prepare(`SELECT COUNT(*) as c FROM products p WHERE p.is_deleted = 0${extraWhere}`)
      .bind(...filterBinds)
      .first<{ c: number }>();
    const total = typeof countRow?.c === 'number' ? countRow.c : 0;
    return c.json({
      data: results ?? [],
      total,
      page,
      limit,
    });
  } catch (err: unknown) {
    const hint = d1SchemaErrorMessage(err);
    return c.json({ error: hint ?? (err instanceof Error ? err.message : 'Liste alınamadı') }, 500);
  }
});

/** Ideasoft’a aktar önizlemesi — SKU / kayıtlı eşleşme / kategori-marka eşlemesi */
app.post('/api/ideasoft/products/push-preview', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req.json<{ product_id?: number }>().catch(() => ({}));
    const productId = Number(body.product_id);
    if (!Number.isFinite(productId) || productId <= 0) return c.json({ error: 'product_id gerekli' }, 400);

    const settings = await loadIdeasoftSettings(c.env.DB);
    const storeBase = normalizeStoreBase(settings.store_base_url || '');
    if (!storeBase) return c.json({ error: 'Ideasoft mağaza adresi ayarlı değil (Ayarlar > IdeaSoft).' }, 400);
    const token = await getIdeasoftAccessToken(c.env);
    if (!token) {
      return c.json(
        {
          error:
            'Ideasoft OAuth bağlantısı yok veya süresi doldu. Ayarlar > IdeaSoft üzerinden "Ideasoft ile bağlan" ile yetkilendirin.',
        },
        401
      );
    }

    const productRow = await fetchProductRowForIdeasoft(c.env.DB, productId);
    if (!productRow) return c.json({ error: 'Ürün bulunamadı' }, 404);
    if (productRow.ecommerce_enabled === 0) return c.json({ error: 'Bu ürün e-ticarete kapalı.' }, 400);

    const sku = (productRow.sku ?? '').trim();
    if (!sku) return c.json({ error: 'Ideasoft aktarımı için SKU zorunlu.' }, 400);

    const { price: productPrice, currencyCode, currencyId: masterCurrencyId } = await getGeneralPriceAndCurrency(
      c.env.DB,
      productId
    );

    const marketplaceId = await ensureIdeasoftMarketplaceId(c.env.DB);
    const mapRow = await c.env.DB.prepare(
      `SELECT marketplace_model_code FROM product_mappings WHERE product_id = ? AND marketplace_id = ? AND is_deleted = 0 LIMIT 1`
    )
      .bind(productId, marketplaceId)
      .first<{ marketplace_model_code: string | null }>();
    let ideasoftId = (mapRow?.marketplace_model_code || '').trim() || null;
    if (!ideasoftId) {
      ideasoftId = await ideasoftFindProductIdBySku(storeBase, token, sku);
    }

    const catMap = await loadIdeasoftJsonSettingMap(c.env.DB, IDEASOFT_CATEGORY_MAPPINGS_KEY);
    const brandMap = await loadIdeasoftJsonSettingMap(c.env.DB, IDEASOFT_BRAND_MAPPINGS_KEY);
    const currencyMap = await loadIdeasoftJsonSettingMap(c.env.DB, IDEASOFT_CURRENCY_MAPPINGS_KEY);
    const mappedCategoryId = await resolveIdeasoftCategoryIdFromMapping(
      c.env.DB,
      catMap,
      productRow.category_id
    );
    const mappedBrandId =
      productRow.brand_id != null && productRow.brand_id > 0
        ? (brandMap[String(productRow.brand_id)] || '').trim() || null
        : null;
    const mappedCurrencyIdeasoftId = resolveIdeasoftCurrencyIdFromMapping(currencyMap, masterCurrencyId);

    let ideasoftProductName: string | null = null;
    let ideasoftProductSku: string | null = null;
    if (ideasoftId) {
      const gp = await ideasoftGetProduct(storeBase, token, ideasoftId);
      if (gp.ok) {
        const r = gp.raw;
        ideasoftProductName = typeof r.name === 'string' ? r.name : null;
        const sk = r.sku ?? r.code;
        ideasoftProductSku = typeof sk === 'string' ? sk : null;
      }
    }

    const displayName = (productRow.ecommerce_name ?? '').trim() || productRow.name;
    const desc = (productRow.main_description ?? '').trim() || displayName;

    const attributes_display: Record<string, string> = {
      name: displayName,
      sku,
      list_price: String(productPrice),
      currency: mappedCurrencyIdeasoftId
        ? `${currencyCode} → Ideasoft #${mappedCurrencyIdeasoftId}`
        : `${currencyCode} (ISO ile çözüm)`,
      quantity: String(productRow.quantity ?? 0),
      description: desc,
    };

    const selected_fields = [
      { ideasoft: 'name', master: 'name' },
      { ideasoft: 'sku', master: 'sku' },
      { ideasoft: 'listPrice', master: 'list_price' },
      { ideasoft: 'currency', master: 'currency' },
      { ideasoft: 'stockAmount', master: 'quantity' },
      { ideasoft: 'longDescription', master: 'description' },
    ];

    const hasPhoto = !!(productRow.image && String(productRow.image).trim());

    return c.json({
      ideasoft_id: ideasoftId,
      ideasoft_product: ideasoftId
        ? {
            id: ideasoftId,
            name: ideasoftProductName || displayName,
            sku: ideasoftProductSku || sku,
          }
        : null,
      sku_used: sku,
      currency_code: currencyCode,
      master_currency_id: masterCurrencyId,
      mapped_currency_ideasoft_id: mappedCurrencyIdeasoftId,
      attributes_display,
      selected_fields,
      mapped_category_id: mappedCategoryId,
      mapped_brand_id: mappedBrandId,
      has_photo: hasPhoto,
    });
  } catch (err: unknown) {
    const hint = d1SchemaErrorMessage(err);
    return c.json({ error: hint ?? (err instanceof Error ? err.message : 'Önizleme hatası') }, 500);
  }
});

/** Ideasoft’a aktar (oluştur veya güncelle) — [Product POST/PUT](https://apidoc.ideasoft.dev/docs/admin-api/8pzfiy7v4vow9-product-post) */
app.post('/api/ideasoft/products/push', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req
      .json<{
        product_id?: number;
        ideasoft_product_id?: string | null;
        attribute_overrides?: Record<string, unknown>;
        create_new?: boolean;
      }>()
      .catch(() => ({}));
    const productId = Number(body.product_id);
    if (!Number.isFinite(productId) || productId <= 0) return c.json({ error: 'product_id gerekli' }, 400);

    const settings = await loadIdeasoftSettings(c.env.DB);
    const storeBase = normalizeStoreBase(settings.store_base_url || '');
    if (!storeBase) return c.json({ error: 'Ideasoft mağaza adresi ayarlı değil.' }, 400);
    const token = await getIdeasoftAccessToken(c.env);
    if (!token) {
      return c.json(
        {
          error:
            'Ideasoft OAuth bağlantısı yok veya süresi doldu. Ayarlar > IdeaSoft üzerinden "Ideasoft ile bağlan" ile yetkilendirin.',
        },
        401
      );
    }

    const productRow = await fetchProductRowForIdeasoft(c.env.DB, productId);
    if (!productRow) return c.json({ error: 'Ürün bulunamadı' }, 404);
    if (productRow.ecommerce_enabled === 0) return c.json({ error: 'Bu ürün e-ticarete kapalı.' }, 400);

    const skuBase = (productRow.sku ?? '').trim();
    if (!skuBase) return c.json({ error: 'SKU zorunlu.' }, 400);

    const { price: basePrice, currencyCode, currencyId: masterCurrencyId } = await getGeneralPriceAndCurrency(
      c.env.DB,
      productId
    );
    let productPrice = basePrice;

    const marketplaceId = await ensureIdeasoftMarketplaceId(c.env.DB);
    const mapRow = await c.env.DB.prepare(
      `SELECT id, marketplace_model_code FROM product_mappings WHERE product_id = ? AND marketplace_id = ? AND is_deleted = 0 LIMIT 1`
    )
      .bind(productId, marketplaceId)
      .first<{ id: number; marketplace_model_code: string | null }>();

    const manualId = body.ideasoft_product_id != null ? String(body.ideasoft_product_id).trim() : '';
    const wantsCreate = !!body.create_new && !manualId;

    let remoteId: string | null = manualId || (mapRow?.marketplace_model_code || '').trim() || null;
    if (!remoteId && !wantsCreate) {
      remoteId = await ideasoftFindProductIdBySku(storeBase, token, skuBase);
    }
    if (wantsCreate) remoteId = null;

    const catMap = await loadIdeasoftJsonSettingMap(c.env.DB, IDEASOFT_CATEGORY_MAPPINGS_KEY);
    const brandMap = await loadIdeasoftJsonSettingMap(c.env.DB, IDEASOFT_BRAND_MAPPINGS_KEY);
    const currencyMap = await loadIdeasoftJsonSettingMap(c.env.DB, IDEASOFT_CURRENCY_MAPPINGS_KEY);
    const categoryIdeasoftId = await resolveIdeasoftCategoryIdFromMapping(
      c.env.DB,
      catMap,
      productRow.category_id
    );
    const brandIdeasoftId =
      productRow.brand_id != null && productRow.brand_id > 0
        ? (brandMap[String(productRow.brand_id)] || '').trim() || null
        : null;
    const currencyIdeasoftId = resolveIdeasoftCurrencyIdFromMapping(currencyMap, masterCurrencyId);

    const ov = body.attribute_overrides ?? {};
    let displayName = (productRow.ecommerce_name ?? '').trim() || productRow.name;
    if (ov.name != null && String(ov.name).trim() !== '') displayName = String(ov.name).trim();
    let desc = (productRow.main_description ?? '').trim() || displayName;
    if (ov.description != null && String(ov.description).trim() !== '') desc = String(ov.description).trim();
    let sku = skuBase;
    if (ov.sku != null && String(ov.sku).trim() !== '') sku = String(ov.sku).trim();
    if (ov.list_price != null && String(ov.list_price).trim() !== '') {
      const n = parseFloat(String(ov.list_price).replace(',', '.'));
      if (!Number.isNaN(n)) productPrice = n;
    }
    let qty = productRow.quantity ?? 0;
    if (ov.quantity != null && String(ov.quantity).trim() !== '') {
      const n = parseFloat(String(ov.quantity).replace(',', '.'));
      if (!Number.isNaN(n)) qty = Math.round(n);
    }

    if (!displayName) return c.json({ error: 'Ürün adı boş olamaz.' }, 400);

    const seo = ideasoftSeoFieldsFromProductRow(productRow);

    const up = await ideasoftUpsertProduct({
      storeBase,
      accessToken: token,
      existingId: remoteId,
      sku,
      name: displayName,
      description: desc || displayName,
      price: productPrice,
      quantity: qty,
      currency: currencyCode,
      currencyIdeasoftId,
      categoryIdeasoftId,
      brandIdeasoftId,
      ...seo,
    });

    if (!up.ok) {
      const rawSnippet = (() => {
        if (!up.raw) return '';
        try { return JSON.stringify(up.raw).slice(0, 400); } catch { return ''; }
      })();
      const errorMsg = rawSnippet
        ? `${up.error} — Ideasoft yanıtı: ${rawSnippet}`
        : up.error;
      return c.json(
        { error: errorMsg, ideasoft_status: up.status, ideasoft_response: up.raw },
        up.status >= 400 && up.status < 600 ? up.status : 502
      );
    }

    const ideasoftId = up.id;
    const requestOrigin = new URL(c.req.url).origin;
    const imageBuild = await buildIdeasoftImageUploads(c.env.STORAGE, productRow.image, requestOrigin);
    const imageUpload = imageBuild.images.length > 0
      ? await ideasoftUploadProductImages({
          storeBase,
          accessToken: token,
          productId: ideasoftId,
          images: imageBuild.images,
        })
      : { uploaded: 0, errors: [] as string[] };
    const imageWarnings = [...imageBuild.warnings, ...imageUpload.errors];
    const transfer_report = buildIdeasoftTransferReport({
      productCategoryId: productRow.category_id,
      productBrandId: productRow.brand_id,
      categoryIdeasoftId,
      brandIdeasoftId,
      masterCurrencyId,
      currencyCode,
      currencyIdeasoftId,
      hasSeoInDb: ideasoftHasSeoContentInRow(productRow),
      categoryWarning: up.categoryWarning,
      brandWarning: up.brandWarning,
      imageCount: imageBuild.images.length,
      imagesUploaded: imageUpload.uploaded,
      imageWarnings,
    });

    if (mapRow?.id) {
      await c.env.DB.prepare(
        `UPDATE product_mappings SET marketplace_sku = ?, marketplace_model_code = ?, updated_at = datetime('now') WHERE id = ?`
      )
        .bind(sku, ideasoftId, mapRow.id)
        .run();
    } else {
      await c.env.DB.prepare(
        `INSERT INTO product_mappings (product_id, marketplace_id, marketplace_sku, marketplace_model_code, status, is_deleted)
         VALUES (?, ?, ?, ?, 1, 0)`
      )
        .bind(productId, marketplaceId, sku, ideasoftId)
        .run();
    }

    return c.json({
      ok: true,
      message: remoteId ? 'Ideasoft ürünü güncellendi' : 'Ideasoft’ta yeni ürün oluşturuldu',
      created: !remoteId,
      ideasoft_product_id: ideasoftId,
      ...(up.brandWarning ? { brand_warning: up.brandWarning } : {}),
      ...(up.categoryWarning ? { category_warning: up.categoryWarning } : {}),
      master_currency_id: masterCurrencyId,
      ideasoft_currency_id: currencyIdeasoftId,
      currency_code: currencyCode,
      images_uploaded: imageUpload.uploaded,
      ...(imageWarnings.length > 0 ? { image_warnings: imageWarnings } : {}),
      transfer_report,
    });
  } catch (err: unknown) {
    const hint = d1SchemaErrorMessage(err);
    return c.json({ error: hint ?? (err instanceof Error ? err.message : 'Aktarım başarısız') }, 500);
  }
});

/** Kayıtlı Ideasoft ürünü için yalnız görsel / SEO metinleri / kategori senkronu (tam aktarım sonrası) */
app.post('/api/ideasoft/products/partial-sync', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req
      .json<{ product_id?: number; part?: 'images' | 'seo' | 'category' }>()
      .catch(() => ({}));
    const productId = Number(body.product_id);
    const part = body.part;
    if (!Number.isFinite(productId) || productId <= 0) return c.json({ error: 'product_id gerekli' }, 400);
    if (part !== 'images' && part !== 'seo' && part !== 'category') {
      return c.json({ error: 'part: images | seo | category gerekli' }, 400);
    }

    const settings = await loadIdeasoftSettings(c.env.DB);
    const storeBase = normalizeStoreBase(settings.store_base_url || '');
    if (!storeBase) return c.json({ error: 'Ideasoft mağaza adresi ayarlı değil.' }, 400);
    const token = await getIdeasoftAccessToken(c.env);
    if (!token) {
      return c.json(
        {
          error:
            'Ideasoft OAuth bağlantısı yok veya süresi doldu. Ayarlar > IdeaSoft üzerinden "Ideasoft ile bağlan" ile yetkilendirin.',
        },
        401
      );
    }

    const productRow = await fetchProductRowForIdeasoft(c.env.DB, productId);
    if (!productRow) return c.json({ error: 'Ürün bulunamadı' }, 404);
    if (productRow.ecommerce_enabled === 0) return c.json({ error: 'Bu ürün e-ticarete kapalı.' }, 400);

    const marketplaceId = await ensureIdeasoftMarketplaceId(c.env.DB);
    const mapRow = await c.env.DB.prepare(
      `SELECT marketplace_model_code FROM product_mappings WHERE product_id = ? AND marketplace_id = ? AND is_deleted = 0 LIMIT 1`
    )
      .bind(productId, marketplaceId)
      .first<{ marketplace_model_code: string | null }>();
    const ideasoftId = (mapRow?.marketplace_model_code ?? '').trim();
    if (!ideasoftId) {
      return c.json(
        { error: 'Önce ürünü Ideasoft’a tam aktarın; kayıtlı Ideasoft ürün kimliği yok.' },
        400
      );
    }

    const requestOrigin = new URL(c.req.url).origin;

    if (part === 'images') {
      const imageBuild = await buildIdeasoftImageUploads(c.env.STORAGE, productRow.image, requestOrigin);
      if (imageBuild.images.length === 0) {
        return c.json({
          ok: true,
          message: 'Aktarılacak görsel yok.',
          images_uploaded: 0,
          ...(imageBuild.warnings.length > 0 ? { image_warnings: imageBuild.warnings } : {}),
        });
      }
      const imageUpload = await ideasoftUploadProductImages({
        storeBase,
        accessToken: token,
        productId: ideasoftId,
        images: imageBuild.images,
      });
      const imageWarnings = [...imageBuild.warnings, ...imageUpload.errors];
      return c.json({
        ok: true,
        message: `${imageUpload.uploaded} görsel gönderildi.`,
        images_uploaded: imageUpload.uploaded,
        ...(imageWarnings.length > 0 ? { image_warnings: imageWarnings } : {}),
      });
    }

    if (part === 'seo') {
      const seo = ideasoftSeoFieldsFromProductRow(productRow);
      const displayName = (productRow.ecommerce_name ?? '').trim() || productRow.name;
      const desc = (productRow.main_description ?? '').trim() || displayName;
      const pageTitle = (seo.pageTitle ?? '').trim() || displayName;
      await ideasoftPatchProductMarketingAndSeo(storeBase, token, ideasoftId, {
        longDescription: desc,
        pageTitle,
        metaDescription: (seo.metaDescription ?? '').trim(),
        metaKeywords: (seo.metaKeywords ?? '').trim(),
        searchKeywords: (seo.searchKeywords ?? '').trim(),
      });
      return c.json({ ok: true, message: 'SEO ve vitrin metinleri Ideasoft’a yazıldı.' });
    }

    const catMap = await loadIdeasoftJsonSettingMap(c.env.DB, IDEASOFT_CATEGORY_MAPPINGS_KEY);
    const categoryIdeasoftId = await resolveIdeasoftCategoryIdFromMapping(
      c.env.DB,
      catMap,
      productRow.category_id
    );
    if (!categoryIdeasoftId) {
      return c.json({ error: 'Ürün veya üst kategoriler için Ideasoft kategori eşlemesi tanımlı değil.' }, 400);
    }
    const ch = await ideasoftChangeProductCategory(storeBase, token, ideasoftId, categoryIdeasoftId, {});
    if (!ch.ok) {
      return c.json(
        { error: ch.error, ideasoft_status: ch.status },
        ch.status >= 400 && ch.status < 600 ? ch.status : 502
      );
    }
    return c.json({ ok: true, message: 'Kategori Ideasoft ürününe güncellendi.' });
  } catch (err: unknown) {
    const hint = d1SchemaErrorMessage(err);
    return c.json({ error: hint ?? (err instanceof Error ? err.message : 'Senkron hatası') }, 500);
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
      const pat = `%${escapeLikePattern(n)}%`;
      where += ` AND (${sqlNormalizeCol('name')} LIKE ? OR ${sqlNormalizeCol('code')} LIKE ?)`;
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
      const pat = `%${escapeLikePattern(n)}%`;
      where += ` AND (${sqlNormalizeCol('name')} LIKE ? OR ${sqlNormalizeCol('code')} LIKE ?)`;
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

// ========== PRODUCT ITEM GROUPS (Ürün Grupları: Ürün, Yedek Parça, Aksesuar) ==========
app.get('/api/product-item-groups', async (c) => {
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
      const pat = `%${escapeLikePattern(n)}%`;
      where += ` AND (${sqlNormalizeCol('name')} LIKE ? OR ${sqlNormalizeCol('code')} LIKE ?)`;
      params.push(pat, pat);
    }
    const countRes = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM product_item_groups ${where}`
    ).bind(...params).first<{ total: number }>();
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, code, description, color, sort_order, status, created_at FROM product_item_groups ${where}
       ORDER BY sort_order, name LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all();
    return c.json({ data: results, total: countRes?.total ?? 0, page, limit });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.get('/api/product-item-groups/next-sort-order', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const row = await c.env.DB.prepare(
      `SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM product_item_groups WHERE is_deleted = 0`
    ).first<{ next: number }>();
    return c.json({ next: row?.next ?? 1 });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.post('/api/product-item-groups', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req.json<{ name: string; code?: string; description?: string; color?: string; sort_order?: number; status?: number }>();
    const name = (body.name || '').trim();
    if (!name) return c.json({ error: 'Ürün grubu adı gerekli' }, 400);
    const code = (body.code || name.slice(0, 2).toUpperCase()).trim();
    const description = body.description?.trim() || null;
    const sort_order = body.sort_order ?? 0;
    const status = body.status !== undefined ? (body.status ? 1 : 0) : 1;
    const existing = await c.env.DB.prepare(
      `SELECT id FROM product_item_groups WHERE code = ? AND is_deleted = 0`
    ).bind(code).first();
    if (existing) return c.json({ error: 'Bu kod zaten kullanılıyor' }, 409);
    const color = body.color?.trim() || null;
    await c.env.DB.prepare(
      `INSERT INTO product_item_groups (name, code, description, color, sort_order, status) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(name, code, description, color, sort_order, status).run();
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, code, description, color, sort_order, status, created_at FROM product_item_groups WHERE id = last_insert_rowid()`
    ).all();
    return c.json(results![0], 201);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.put('/api/product-item-groups/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const body = await c.req.json<{ name?: string; code?: string; description?: string; color?: string; sort_order?: number; status?: number }>();
    const existing = await c.env.DB.prepare(`SELECT id FROM product_item_groups WHERE id = ? AND is_deleted = 0`).bind(id).first();
    if (!existing) return c.json({ error: 'Ürün grubu bulunamadı' }, 404);
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
    await c.env.DB.prepare(`UPDATE product_item_groups SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    const row = await c.env.DB.prepare(
      `SELECT id, name, code, description, color, sort_order, status, created_at, updated_at FROM product_item_groups WHERE id = ?`
    ).bind(id).first();
    return c.json(row);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.delete('/api/product-item-groups/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const res = await c.env.DB.prepare(
      `UPDATE product_item_groups SET is_deleted = 1, status = 0, updated_at = datetime('now') WHERE id = ? AND is_deleted = 0`
    ).bind(id).run();
    if (res.meta.changes === 0) return c.json({ error: 'Ürün grubu bulunamadı' }, 404);
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
      const pat = `%${escapeLikePattern(n)}%`;
      where += ` AND (${sqlNormalizeCol('name')} LIKE ? OR ${sqlNormalizeCol('code')} LIKE ? OR ${sqlNormalizeCol('symbol')} LIKE ?)`;
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
      const pat = `%${escapeLikePattern(n)}%`;
      where += ` AND (${sqlNormalizeCol('name')} LIKE ? OR ${sqlNormalizeCol('code')} LIKE ?)`;
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
      const pat = `%${escapeLikePattern(n)}%`;
      where += ` AND (${sqlNormalizeCol('name')} LIKE ? OR ${sqlNormalizeCol('description')} LIKE ?)`;
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
      const pat = `%${escapeLikePattern(n)}%`;
      where += ` AND (${sqlNormalizeCol('name')} LIKE ? OR ${sqlNormalizeCol('code')} LIKE ? OR ${sqlNormalizeCol('description')} LIKE ?)`;
      params.push(pat, pat, pat);
    }
    const countRes = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM customer_types ${where}`
    ).bind(...params).first<{ total: number }>();
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, code, description, color, type, sort_order, status, created_at FROM customer_types ${where}
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
    const body = await c.req.json<{ name: string; code?: string; description?: string; color?: string; type?: string; sort_order?: number; status?: number }>();
    const name = (body.name || '').trim();
    if (!name) return c.json({ error: 'Müşteri tipi adı gerekli' }, 400);
    const code = (body.code || name.slice(0, 2).toUpperCase()).trim();
    const description = body.description?.trim() || null;
    const sort_order = body.sort_order ?? 0;
    const status = body.status !== undefined ? (body.status ? 1 : 0) : 1;
    const typeVal = body.type === 'şahıs' ? 'şahıs' : 'firma';
    const existing = await c.env.DB.prepare(
      `SELECT id FROM customer_types WHERE code = ? AND is_deleted = 0`
    ).bind(code).first();
    if (existing) return c.json({ error: 'Bu kod zaten kullanılıyor' }, 409);
    const color = body.color?.trim() || null;
    await c.env.DB.prepare(
      `INSERT INTO customer_types (name, code, description, color, type, sort_order, status) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(name, code, description, color, typeVal, sort_order, status).run();
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, code, description, color, type, sort_order, status, created_at FROM customer_types WHERE id = last_insert_rowid()`
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
    const body = await c.req.json<{ name?: string; code?: string; description?: string; color?: string; type?: string; sort_order?: number; status?: number }>();
    const existing = await c.env.DB.prepare(`SELECT id FROM customer_types WHERE id = ? AND is_deleted = 0`).bind(id).first();
    if (!existing) return c.json({ error: 'Müşteri tipi bulunamadı' }, 404);
    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name.trim()); }
    if (body.code !== undefined) { updates.push('code = ?'); values.push(body.code.trim()); }
    if (body.description !== undefined) { updates.push('description = ?'); values.push(body.description?.trim() || null); }
    if (body.color !== undefined) { updates.push('color = ?'); values.push(body.color?.trim() || null); }
    if (body.type !== undefined) { updates.push('type = ?'); values.push(body.type === 'şahıs' ? 'şahıs' : 'firma'); }
    if (body.sort_order !== undefined) { updates.push('sort_order = ?'); values.push(body.sort_order); }
    if (body.status !== undefined) { updates.push('status = ?'); values.push(body.status ? 1 : 0); }
    if (updates.length === 0) return c.json({ error: 'Güncellenecek alan yok' }, 400);
    updates.push("updated_at = datetime('now')");
    values.push(id);
    await c.env.DB.prepare(`UPDATE customer_types SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    const row = await c.env.DB.prepare(
      `SELECT id, name, code, description, color, type, sort_order, status, created_at, updated_at FROM customer_types WHERE id = ?`
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

// ========== CUSTOMER GROUPS (Müşteri Grupları) ==========
app.get('/api/customer-groups', async (c) => {
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
      const pat = `%${escapeLikePattern(n)}%`;
      where += ` AND (${sqlNormalizeCol('name')} LIKE ? OR ${sqlNormalizeCol('code')} LIKE ? OR ${sqlNormalizeCol('description')} LIKE ?)`;
      params.push(pat, pat, pat);
    }
    const countRes = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM customer_groups ${where}`
    ).bind(...params).first<{ total: number }>();
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, code, description, sort_order, status, color, created_at FROM customer_groups ${where}
       ORDER BY sort_order, name LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all();
    return c.json({ data: results, total: countRes?.total ?? 0, page, limit });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.get('/api/customer-groups/next-sort-order', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const row = await c.env.DB.prepare(
      `SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM customer_groups WHERE is_deleted = 0`
    ).first<{ next: number }>();
    return c.json({ next: row?.next ?? 1 });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.post('/api/customer-groups', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req.json<{ name: string; code?: string; description?: string; sort_order?: number; status?: number; color?: string }>();
    const name = (body.name || '').trim();
    if (!name) return c.json({ error: 'Grup adı gerekli' }, 400);
    const code = (body.code || name.slice(0, 2).toUpperCase()).trim();
    const description = body.description?.trim() || null;
    const sort_order = body.sort_order ?? 0;
    const status = body.status !== undefined ? (body.status ? 1 : 0) : 1;
    const color = body.color?.trim() || null;
    const existing = await c.env.DB.prepare(
      `SELECT id FROM customer_groups WHERE name = ? AND is_deleted = 0`
    ).bind(name).first();
    if (existing) return c.json({ error: 'Bu isim zaten kullanılıyor' }, 409);
    await c.env.DB.prepare(
      `INSERT INTO customer_groups (name, code, description, sort_order, status, color) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(name, code, description, sort_order, status, color).run();
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, code, description, sort_order, status, color, created_at FROM customer_groups WHERE id = last_insert_rowid()`
    ).all();
    return c.json(results![0], 201);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.put('/api/customer-groups/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const body = await c.req.json<{ name?: string; code?: string; description?: string; sort_order?: number; status?: number; color?: string }>();
    const existing = await c.env.DB.prepare(`SELECT id FROM customer_groups WHERE id = ? AND is_deleted = 0`).bind(id).first();
    if (!existing) return c.json({ error: 'Grup bulunamadı' }, 404);
    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name.trim()); }
    if (body.code !== undefined) { updates.push('code = ?'); values.push(body.code.trim()); }
    if (body.description !== undefined) { updates.push('description = ?'); values.push(body.description?.trim() || null); }
    if (body.sort_order !== undefined) { updates.push('sort_order = ?'); values.push(body.sort_order); }
    if (body.status !== undefined) { updates.push('status = ?'); values.push(body.status ? 1 : 0); }
    if (body.color !== undefined) { updates.push('color = ?'); values.push(body.color?.trim() || null); }
    if (updates.length === 0) return c.json({ error: 'Güncellenecek alan yok' }, 400);
    updates.push("updated_at = datetime('now')");
    values.push(id);
    await c.env.DB.prepare(`UPDATE customer_groups SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    const row = await c.env.DB.prepare(
      `SELECT id, name, code, description, sort_order, status, color, created_at, updated_at FROM customer_groups WHERE id = ?`
    ).bind(id).first();
    return c.json(row);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.delete('/api/customer-groups/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const res = await c.env.DB.prepare(
      `UPDATE customer_groups SET is_deleted = 1, status = 0, updated_at = datetime('now') WHERE id = ? AND is_deleted = 0`
    ).bind(id).run();
    if (res.meta.changes === 0) return c.json({ error: 'Grup bulunamadı' }, 404);
    return c.json({ success: true });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

// ========== CUSTOMER LEGAL TYPES (Yasal Tipler) ==========
app.get('/api/customer-legal-types', async (c) => {
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
      const pat = `%${escapeLikePattern(n)}%`;
      where += ` AND (${sqlNormalizeCol('name')} LIKE ? OR ${sqlNormalizeCol('description')} LIKE ?)`;
      params.push(pat, pat);
    }
    const countRes = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM customer_legal_types ${where}`
    ).bind(...params).first<{ total: number }>();
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, description, sort_order, status, created_at FROM customer_legal_types ${where}
       ORDER BY sort_order, name LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all();
    return c.json({ data: results, total: countRes?.total ?? 0, page, limit });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.put('/api/customer-legal-types/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const body = await c.req.json<{ description?: string; sort_order?: number; status?: number }>();
    const existing = await c.env.DB.prepare(`SELECT id FROM customer_legal_types WHERE id = ? AND is_deleted = 0`).bind(id).first();
    if (!existing) return c.json({ error: 'Yasal tip bulunamadı' }, 404);
    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    if (body.description !== undefined) { updates.push('description = ?'); values.push(body.description?.trim() || null); }
    if (body.sort_order !== undefined) { updates.push('sort_order = ?'); values.push(body.sort_order); }
    if (body.status !== undefined) { updates.push('status = ?'); values.push(body.status ? 1 : 0); }
    if (updates.length === 0) return c.json({ error: 'Güncellenecek alan yok' }, 400);
    updates.push("updated_at = datetime('now')");
    values.push(id);
    await c.env.DB.prepare(`UPDATE customer_legal_types SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    const row = await c.env.DB.prepare(
      `SELECT id, name, description, sort_order, status, created_at, updated_at FROM customer_legal_types WHERE id = ?`
    ).bind(id).first();
    return c.json(row);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

// ========== CUSTOMERS (Müşteriler) ==========
app.get('/api/customers', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const search = (c.req.query('search') || '').trim().slice(0, 200);
    const page = Math.max(1, parseInt(c.req.query('page') || '1'));
    const limit = Math.min(9999, Math.max(1, parseInt(c.req.query('limit') || '10')));
    const offset = (page - 1) * limit;
    let where = 'WHERE is_deleted = 0 AND status = 1';
    const params: (string | number)[] = [];
    if (search) {
      const words = search.split(/\s+/).map((w) => w.trim()).filter(Boolean).slice(0, 8);
      const escapeClause = " ESCAPE '\\'";
      const wordConditions = words.map(() => {
        return `(${sqlNormalizeCol('title')} LIKE ?${escapeClause} OR ${sqlNormalizeCol('code')} LIKE ?${escapeClause} OR ${sqlNormalizeCol('tax_no')} LIKE ?${escapeClause} OR ${sqlNormalizeCol('email')} LIKE ?${escapeClause})`;
      }).join(' AND ');
      where += ` AND ${wordConditions}`;
      for (const w of words) {
        const pat = `%${escapeLikePattern(normalizeForSearch(w))}%`;
        params.push(pat, pat, pat, pat);
      }
    }
    const countRes = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM customers ${where}`
    ).bind(...params).first<{ total: number }>();
    const { results } = await c.env.DB.prepare(
      `SELECT id, title, code, group_id, type_id, legal_type_id, tax_no, tax_office, email, phone, phone_mobile, status, created_at FROM customers ${where}
       ORDER BY sort_order, title LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all();
    return c.json({ data: results, total: countRes?.total ?? 0, page, limit });
  } catch (err: unknown) {
    console.error('[customers]', err);
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.get('/api/customers/next-sort-order', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const row = await c.env.DB.prepare(
      `SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM customers WHERE is_deleted = 0`
    ).first<{ next: number }>();
    return c.json({ next: row?.next ?? 1 });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.get('/api/customers/next-code', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const year = new Date().getFullYear();
    const prefix = `${year}-`;
    const { results } = await c.env.DB.prepare(
      `SELECT code FROM customers WHERE is_deleted = 0 AND code LIKE ? ORDER BY CAST(SUBSTR(code, 6) AS INTEGER) DESC LIMIT 1`
    ).bind(prefix + '%').all();
    let nextNum = 1;
    if (results && results.length > 0) {
      const last = (results[0] as { code: string }).code || '';
      const numPart = last.replace(prefix, '').replace(/\D/g, '');
      const n = parseInt(numPart, 10);
      if (!isNaN(n) && n >= 0) nextNum = n + 1;
    }
    const code = `${prefix}${String(nextNum).padStart(4, '0')}`;
    return c.json({ code });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

/** Benzer müşteri/cari kart arama - customers + dia_carikartlar, kelime kelime (tüm kelimeler eşleşmeli) */
app.get('/api/customers/similar', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const q = (c.req.query('q') || '').trim().slice(0, 150);
    if (!q || q.length < 2) return c.json({ data: [] });
    const words = q.split(/\s+/).filter((w) => w.length >= 2).slice(0, 8);
    if (words.length === 0) return c.json({ data: [] });
    const limit = Math.min(20, Math.max(5, parseInt(c.req.query('limit') || '15')));
    const escapeClause = /[%_]/.test(q) ? " ESCAPE '\\'" : '';
    const likeConditions = words
      .map((w) => {
        const n = escapeLikePattern(normalizeForSearch(w));
        return `${sqlNormalizeCol('title')} LIKE ?${escapeClause}`;
      })
      .join(' AND ');
    const likeConditionsDia = words
      .map((w) => {
        const n = escapeLikePattern(normalizeForSearch(w));
        return `${sqlNormalizeCol('unvan')} LIKE ?${escapeClause}`;
      })
      .join(' AND ');
    const pats = words.map((w) => `%${escapeLikePattern(normalizeForSearch(w))}%`);
    const customers: { source: string; id: number; title: string }[] = [];
    const dia: { source: string; id: number; title: string }[] = [];
    try {
      const custWhere = `is_deleted = 0 AND status = 1 AND ${likeConditions}`;
      const { results: custRes } = await c.env.DB.prepare(
        `SELECT id, title FROM customers WHERE ${custWhere} ORDER BY title LIMIT ?`
      ).bind(...pats, limit).all();
      for (const r of (custRes || []) as { id: number; title: string }[]) {
        customers.push({ source: 'customers', id: r.id, title: r.title || '' });
      }
    } catch {
      /* ignore */
    }
    try {
      const { results: diaRes } = await c.env.DB.prepare(
        `SELECT id, unvan FROM dia_carikartlar WHERE ${likeConditionsDia} ORDER BY unvan LIMIT ?`
      ).bind(...pats, limit).all();
      for (const r of (diaRes || []) as { id: number; unvan: string | null }[]) {
        dia.push({ source: 'dia_carikartlar', id: r.id, title: r.unvan || '' });
      }
    } catch {
      /* ignore */
    }
    const data = [...customers, ...dia];
    return c.json({ data });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.get('/api/customers/check-tax-no', async (c) => {
  try {
    if (!c.env.DB) return c.json({ exists: false });
    const taxNo = (c.req.query('tax_no') || '').replace(/\D/g, '');
    if (!taxNo) return c.json({ exists: false });
    if (taxNo === '11111111111') return c.json({ exists: false });
    const excludeId = parseInt(c.req.query('exclude_id') || '0');
    const params: (string | number)[] = [taxNo];
    const excludeClause = excludeId > 0 ? ' AND id != ?' : '';
    if (excludeId > 0) params.push(excludeId);
    const row = await c.env.DB.prepare(
      `SELECT id, title FROM customers WHERE is_deleted = 0 AND REPLACE(REPLACE(REPLACE(COALESCE(tax_no,''), ' ', ''), '-', ''), '.', '') = ?${excludeClause}`
    ).bind(...params).first();
    return c.json({ exists: !!row, customer: row ? { id: (row as { id: number }).id, title: (row as { title: string }).title } : null });
  } catch (err: unknown) {
    return c.json({ exists: false });
  }
});

/** DIA + Paraşüt müşteri arama - yeni müşteri eklerken kullanılır, seçilen sonuç customers'a kaydedilir */
app.get('/api/customers/search-external', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const q = (c.req.query('q') || '').trim().slice(0, 150);
    if (!q || q.length < 2) return c.json({ data: [] });
    const limit = Math.min(15, Math.max(5, parseInt(c.req.query('limit') || '10')));
    const escapeClause = /[%_]/.test(q) ? " ESCAPE '\\'" : '';
    const pat = `%${escapeLikePattern(normalizeForSearch(q))}%`;
    const results: { source: string; id: string; title: string; tax_no?: string; tax_office?: string; email?: string; phone?: string; code?: string }[] = [];

    // DIA dia_carikartlar
    try {
      const diaWhere = `(${sqlNormalizeCol('unvan')} LIKE ?${escapeClause} OR ${sqlNormalizeCol('carikartkodu')} LIKE ?${escapeClause} OR ${sqlNormalizeCol('verginumarasi')} LIKE ?${escapeClause} OR ${sqlNormalizeCol('tckimlikno')} LIKE ?${escapeClause} OR ${sqlNormalizeCol('eposta')} LIKE ?${escapeClause})`;
      const { results: diaRes } = await c.env.DB.prepare(
        `SELECT c.id, c.unvan, c.carikartkodu, c.verginumarasi, c.tckimlikno, c.eposta, c.adresler_adres_telefon1, c.adresler_adres_ceptel, v.vergidairesiadi as vergidairesi_adi
         FROM dia_carikartlar c
         LEFT JOIN dia_vergidaireleri v ON c.vergidairesi = v.vdkod
         WHERE ${diaWhere}
         ORDER BY c.unvan LIMIT ?`
      ).bind(pat, pat, pat, pat, pat, limit).all();
      for (const r of (diaRes || []) as { id: number; unvan?: string | null; carikartkodu?: string | null; verginumarasi?: string | null; tckimlikno?: string | null; eposta?: string | null; adresler_adres_telefon1?: string | null; adresler_adres_ceptel?: string | null; vergidairesi_adi?: string | null }[]) {
        const taxNo = (r.verginumarasi || r.tckimlikno || '').trim().replace(/\s/g, '');
        const phone = (r.adresler_adres_telefon1 || r.adresler_adres_ceptel || '').trim();
        results.push({
          source: 'dia',
          id: String(r.id),
          title: (r.unvan || '').trim() || '—',
          tax_no: taxNo || undefined,
          tax_office: (r.vergidairesi_adi || '').trim() || undefined,
          email: (r.eposta || '').trim() || undefined,
          phone: phone || undefined,
          code: (r.carikartkodu || '').trim() || undefined,
        });
      }
    } catch {
      /* ignore DIA errors */
    }

    // Paraşüt contacts
    try {
      const auth = await getParasutAuth(c);
      if (auth) {
        const base = 'https://api.parasut.com';
        const params = new URLSearchParams();
        params.set('filter[name]', q);
        params.set('filter[account_type]', 'customer');
        params.set('page[size]', String(Math.min(10, limit - results.length)));
        const res = await fetch(`${base}/v4/${auth.companyId}/contacts?${params.toString()}`, {
          headers: { 'Authorization': `Bearer ${auth.token}`, 'Accept': 'application/json' },
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok) {
          const data = (json as { data?: unknown[] }).data ?? [];
          for (const item of data as { id?: string; attributes?: Record<string, unknown> }[]) {
            const attrs = item.attributes ?? {};
            const name = (attrs.name as string) || '';
            if (!name) continue;
            results.push({
              source: 'parasut',
              id: item.id || '',
              title: name,
              tax_no: (attrs.tax_number as string)?.trim() || undefined,
              tax_office: (attrs.tax_office as string)?.trim() || undefined,
              email: (attrs.email as string)?.trim() || undefined,
              phone: (attrs.phone as string)?.trim() || undefined,
            });
          }
        }
      }
    } catch {
      /* ignore Paraşüt errors */
    }

    return c.json({ data: results });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

// Customer addresses - must be before /api/customers/:id
app.get('/api/customers/:id/addresses', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const customer = await c.env.DB.prepare(`SELECT id FROM customers WHERE id = ? AND is_deleted = 0`).bind(id).first();
    if (!customer) return c.json({ error: 'Müşteri bulunamadı' }, 404);
    const { results } = await c.env.DB.prepare(
      `SELECT id, customer_id, type, title, contact_name, phone, email, phone_mobile, country_code, city, district, post_code, address_line_1, address_line_2, is_default, status, created_at
       FROM customer_addresses WHERE customer_id = ? AND is_deleted = 0 ORDER BY is_default DESC, type, id`
    ).bind(id).all();
    return c.json({ data: results || [] });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.post('/api/customers/:id/addresses', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const customer = await c.env.DB.prepare(`SELECT id FROM customers WHERE id = ? AND is_deleted = 0`).bind(id).first();
    if (!customer) return c.json({ error: 'Müşteri bulunamadı' }, 404);
    const body = await c.req.json<{
      type?: string; title?: string; contact_name?: string; phone?: string; email?: string; phone_mobile?: string;
      country_code?: string; city?: string; district?: string; post_code?: string; address_line_1?: string; address_line_2?: string;
      is_default?: boolean;
    }>();
    const type = (body.type || 'Fatura').trim();
    const validTypes = ['Fatura', 'Sevkiyat', 'Project', 'Other'];
    const finalType = validTypes.includes(type) ? type : 'Fatura';
    const title = body.title?.trim() || null;
    const contact_name = body.contact_name?.trim() || null;
    const phone = body.phone?.trim() || null;
    const email = body.email?.trim() || null;
    const phone_mobile = body.phone_mobile?.trim() || null;
    const country_code = body.country_code?.trim() || 'TR';
    const city = body.city?.trim() || null;
    const district = body.district?.trim() || null;
    const post_code = body.post_code?.trim() || null;
    const address_line_1 = body.address_line_1?.trim() || null;
    const address_line_2 = body.address_line_2?.trim() || null;
    const is_default = body.is_default ? 1 : 0;
    await c.env.DB.prepare(
      `INSERT INTO customer_addresses (customer_id, type, title, contact_name, phone, email, phone_mobile, country_code, city, district, post_code, address_line_1, address_line_2, is_default, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    ).bind(id, finalType, title, contact_name, phone, email, phone_mobile, country_code, city, district, post_code, address_line_1, address_line_2, is_default).run();
    const row = await c.env.DB.prepare(`SELECT * FROM customer_addresses WHERE id = last_insert_rowid()`).first();
    return c.json(row, 201);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.put('/api/customers/:id/addresses/:addressId', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const addressId = c.req.param('addressId');
    const existing = await c.env.DB.prepare(
      `SELECT id FROM customer_addresses WHERE id = ? AND customer_id = ? AND is_deleted = 0`
    ).bind(addressId, id).first();
    if (!existing) return c.json({ error: 'Adres bulunamadı' }, 404);
    const body = await c.req.json<{
      type?: string; title?: string; contact_name?: string; phone?: string; email?: string; phone_mobile?: string;
      country_code?: string; city?: string; district?: string; post_code?: string; address_line_1?: string; address_line_2?: string;
      is_default?: boolean;
    }>();
    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    if (body.type !== undefined) {
      const validTypes = ['Fatura', 'Sevkiyat', 'Project', 'Other'];
      const finalType = validTypes.includes(body.type.trim()) ? body.type.trim() : 'Fatura';
      updates.push('type = ?'); values.push(finalType);
    }
    if (body.title !== undefined) { updates.push('title = ?'); values.push(body.title?.trim() || null); }
    if (body.contact_name !== undefined) { updates.push('contact_name = ?'); values.push(body.contact_name?.trim() || null); }
    if (body.phone !== undefined) { updates.push('phone = ?'); values.push(body.phone?.trim() || null); }
    if (body.email !== undefined) { updates.push('email = ?'); values.push(body.email?.trim() || null); }
    if (body.phone_mobile !== undefined) { updates.push('phone_mobile = ?'); values.push(body.phone_mobile?.trim() || null); }
    if (body.country_code !== undefined) { updates.push('country_code = ?'); values.push(body.country_code?.trim() || 'TR'); }
    if (body.city !== undefined) { updates.push('city = ?'); values.push(body.city?.trim() || null); }
    if (body.district !== undefined) { updates.push('district = ?'); values.push(body.district?.trim() || null); }
    if (body.post_code !== undefined) { updates.push('post_code = ?'); values.push(body.post_code?.trim() || null); }
    if (body.address_line_1 !== undefined) { updates.push('address_line_1 = ?'); values.push(body.address_line_1?.trim() || null); }
    if (body.address_line_2 !== undefined) { updates.push('address_line_2 = ?'); values.push(body.address_line_2?.trim() || null); }
    if (body.is_default !== undefined) { updates.push('is_default = ?'); values.push(body.is_default ? 1 : 0); }
    if (updates.length === 0) return c.json({ error: 'Güncellenecek alan yok' }, 400);
    updates.push("updated_at = datetime('now')");
    values.push(addressId);
    await c.env.DB.prepare(`UPDATE customer_addresses SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    const row = await c.env.DB.prepare(`SELECT * FROM customer_addresses WHERE id = ?`).bind(addressId).first();
    return c.json(row);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.delete('/api/customers/:id/addresses/:addressId', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const addressId = c.req.param('addressId');
    const res = await c.env.DB.prepare(
      `UPDATE customer_addresses SET is_deleted = 1, status = 0, updated_at = datetime('now') WHERE id = ? AND customer_id = ? AND is_deleted = 0`
    ).bind(addressId, id).run();
    if (res.meta.changes === 0) return c.json({ error: 'Adres bulunamadı' }, 404);
    return c.json({ success: true });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

// Customer contacts - must be before /api/customers/:id
app.get('/api/customers/:id/contacts', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const customer = await c.env.DB.prepare(`SELECT id FROM customers WHERE id = ? AND is_deleted = 0`).bind(id).first();
    if (!customer) return c.json({ error: 'Müşteri bulunamadı' }, 404);
    const { results } = await c.env.DB.prepare(
      `SELECT id, customer_id, full_name, role, phone, phone_mobile, email, is_primary, notes, sort_order, status, created_at
       FROM customer_contacts WHERE customer_id = ? AND is_deleted = 0 ORDER BY is_primary DESC, sort_order, full_name`
    ).bind(id).all();
    return c.json({ data: results || [] });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.post('/api/customers/:id/contacts', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const customer = await c.env.DB.prepare(`SELECT id FROM customers WHERE id = ? AND is_deleted = 0`).bind(id).first();
    if (!customer) return c.json({ error: 'Müşteri bulunamadı' }, 404);
    const body = await c.req.json<{ full_name: string; role?: string; phone?: string; phone_mobile?: string; email?: string; is_primary?: boolean; notes?: string }>();
    const full_name = (body.full_name || '').trim();
    if (!full_name) return c.json({ error: 'Ad soyad gerekli' }, 400);
    const role = body.role?.trim() || null;
    const phone = body.phone?.trim() || null;
    const phone_mobile = body.phone_mobile?.trim() || null;
    const email = body.email?.trim() || null;
    const is_primary = body.is_primary ? 1 : 0;
    const notes = body.notes?.trim() || null;
    const { results: maxRes } = await c.env.DB.prepare(`SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM customer_contacts WHERE customer_id = ?`).bind(id).all();
    const sort_order = (maxRes?.[0] as { next: number })?.next ?? 0;
    await c.env.DB.prepare(
      `INSERT INTO customer_contacts (customer_id, full_name, role, phone, phone_mobile, email, is_primary, notes, sort_order, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    ).bind(id, full_name, role, phone, phone_mobile, email, is_primary, notes, sort_order).run();
    const row = await c.env.DB.prepare(`SELECT * FROM customer_contacts WHERE id = last_insert_rowid()`).first();
    return c.json(row, 201);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.put('/api/customers/:id/contacts/:contactId', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const contactId = c.req.param('contactId');
    const existing = await c.env.DB.prepare(
      `SELECT id FROM customer_contacts WHERE id = ? AND customer_id = ? AND is_deleted = 0`
    ).bind(contactId, id).first();
    if (!existing) return c.json({ error: 'İletişim kişisi bulunamadı' }, 404);
    const body = await c.req.json<{ full_name?: string; role?: string; phone?: string; phone_mobile?: string; email?: string; is_primary?: boolean; notes?: string }>();
    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    if (body.full_name !== undefined) { updates.push('full_name = ?'); values.push(body.full_name?.trim() || ''); }
    if (body.role !== undefined) { updates.push('role = ?'); values.push(body.role?.trim() || null); }
    if (body.phone !== undefined) { updates.push('phone = ?'); values.push(body.phone?.trim() || null); }
    if (body.phone_mobile !== undefined) { updates.push('phone_mobile = ?'); values.push(body.phone_mobile?.trim() || null); }
    if (body.email !== undefined) { updates.push('email = ?'); values.push(body.email?.trim() || null); }
    if (body.is_primary !== undefined) { updates.push('is_primary = ?'); values.push(body.is_primary ? 1 : 0); }
    if (body.notes !== undefined) { updates.push('notes = ?'); values.push(body.notes?.trim() || null); }
    if (updates.length === 0) return c.json({ error: 'Güncellenecek alan yok' }, 400);
    updates.push("updated_at = datetime('now')");
    values.push(contactId);
    await c.env.DB.prepare(`UPDATE customer_contacts SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    const row = await c.env.DB.prepare(`SELECT * FROM customer_contacts WHERE id = ?`).bind(contactId).first();
    return c.json(row);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.delete('/api/customers/:id/contacts/:contactId', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const contactId = c.req.param('contactId');
    const res = await c.env.DB.prepare(
      `UPDATE customer_contacts SET is_deleted = 1, status = 0, updated_at = datetime('now') WHERE id = ? AND customer_id = ? AND is_deleted = 0`
    ).bind(contactId, id).run();
    if (res.meta.changes === 0) return c.json({ error: 'İletişim kişisi bulunamadı' }, 404);
    return c.json({ success: true });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.get('/api/customers/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const row = await c.env.DB.prepare(
      `SELECT * FROM customers WHERE id = ? AND is_deleted = 0`
    ).bind(id).first();
    if (!row) return c.json({ error: 'Müşteri bulunamadı' }, 404);
    return c.json(row);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.post('/api/customers', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req.json<{
      title: string; code?: string; group_id?: number | null; type_id?: number | null; legal_type_id?: number | null;
      tags?: string; tax_no?: string; tax_office?: string; email?: string; phone?: string; phone_mobile?: string;
      sort_order?: number; status?: number;
    }>();
    const title = (body.title || '').trim();
    if (!title) return c.json({ error: 'Müşteri adı gerekli' }, 400);
    const code = body.code?.trim() || null;
    const group_id = body.group_id ?? null;
    const type_id = body.type_id ?? null;
    const legal_type_id = body.legal_type_id ?? null;
    const tags = body.tags?.trim() || null;
    const tax_no = body.tax_no?.trim() || null;
    const tax_office = body.tax_office?.trim() || null;
    const email = body.email?.trim() || null;
    const phone = body.phone?.trim() || null;
    const phone_mobile = body.phone_mobile?.trim() || null;
    const sort_order = body.sort_order ?? 0;
    const status = body.status !== undefined ? (body.status ? 1 : 0) : 1;
    await c.env.DB.prepare(
      `INSERT INTO customers (title, code, group_id, type_id, legal_type_id, tags, tax_no, tax_office, email, phone, phone_mobile, sort_order, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(title, code, group_id, type_id, legal_type_id, tags, tax_no, tax_office, email, phone, phone_mobile, sort_order, status).run();
    const row = await c.env.DB.prepare(`SELECT * FROM customers WHERE id = last_insert_rowid()`).first();
    return c.json(row, 201);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.put('/api/customers/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const body = await c.req.json<{
      title?: string; code?: string; group_id?: number | null; type_id?: number | null; legal_type_id?: number | null;
      tags?: string; tax_no?: string; tax_office?: string; email?: string; phone?: string; phone_mobile?: string;
      sort_order?: number; status?: number;
    }>();
    const existing = await c.env.DB.prepare(`SELECT id FROM customers WHERE id = ? AND is_deleted = 0`).bind(id).first();
    if (!existing) return c.json({ error: 'Müşteri bulunamadı' }, 404);
    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    if (body.title !== undefined) { updates.push('title = ?'); values.push(body.title.trim()); }
    if (body.code !== undefined) { updates.push('code = ?'); values.push(body.code?.trim() || null); }
    if (body.group_id !== undefined) { updates.push('group_id = ?'); values.push(body.group_id); }
    if (body.type_id !== undefined) { updates.push('type_id = ?'); values.push(body.type_id); }
    if (body.legal_type_id !== undefined) { updates.push('legal_type_id = ?'); values.push(body.legal_type_id); }
    if (body.tags !== undefined) { updates.push('tags = ?'); values.push(body.tags?.trim() || null); }
    if (body.tax_no !== undefined) { updates.push('tax_no = ?'); values.push(body.tax_no?.trim() || null); }
    if (body.tax_office !== undefined) { updates.push('tax_office = ?'); values.push(body.tax_office?.trim() || null); }
    if (body.email !== undefined) { updates.push('email = ?'); values.push(body.email?.trim() || null); }
    if (body.phone !== undefined) { updates.push('phone = ?'); values.push(body.phone?.trim() || null); }
    if (body.phone_mobile !== undefined) { updates.push('phone_mobile = ?'); values.push(body.phone_mobile?.trim() || null); }
    if (body.sort_order !== undefined) { updates.push('sort_order = ?'); values.push(body.sort_order); }
    if (body.status !== undefined) { updates.push('status = ?'); values.push(body.status ? 1 : 0); }
    if (updates.length === 0) return c.json({ error: 'Güncellenecek alan yok' }, 400);
    updates.push("updated_at = datetime('now')");
    values.push(id);
    await c.env.DB.prepare(`UPDATE customers SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    const row = await c.env.DB.prepare(`SELECT * FROM customers WHERE id = ?`).bind(id).first();
    return c.json(row);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.delete('/api/customers/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const res = await c.env.DB.prepare(
      `UPDATE customers SET is_deleted = 1, status = 0, updated_at = datetime('now') WHERE id = ? AND is_deleted = 0`
    ).bind(id).run();
    if (res.meta.changes === 0) return c.json({ error: 'Müşteri bulunamadı' }, 404);
    return c.json({ success: true });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

// ========== OFFERS (Teklifler) ==========
app.get('/api/offers', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const search = (c.req.query('search') || '').trim();
    const page = Math.max(1, parseInt(c.req.query('page') || '1'));
    const limit = Math.min(9999, Math.max(1, parseInt(c.req.query('limit') || '10')));
    const offset = (page - 1) * limit;
    let where = 'WHERE o.is_deleted = 0';
    const params: (string | number)[] = [];
    if (search) {
      const n = normalizeForSearch(search);
      const pat = `%${escapeLikePattern(n)}%`;
      where += ` AND (${sqlNormalizeCol('o.order_no')} LIKE ? OR ${sqlNormalizeCol('c.title')} LIKE ? OR ${sqlNormalizeCol('o.description')} LIKE ?)`;
      params.push(pat, pat, pat);
    }
    const countRes = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM offers o LEFT JOIN customers c ON o.customer_id = c.id AND c.is_deleted = 0 ${where}`
    ).bind(...params).first<{ total: number }>();
    const { results } = await c.env.DB.prepare(
      `SELECT o.id, o.date, o.order_no, o.customer_id, o.contact_id, o.description, o.notes, o.discount_1, o.discount_2, o.discount_3, o.discount_4, o.status, o.currency_id, o.exchange_rate,
       c.title as customer_title, c.code as customer_code,
       cur.code as currency_code, cur.symbol as currency_symbol,
       (SELECT COALESCE(SUM(oi.amount * oi.unit_price - COALESCE(oi.line_discount, 0)), 0) FROM offer_items oi WHERE oi.offer_id = o.id AND oi.is_deleted = 0) as subtotal
       FROM offers o LEFT JOIN customers c ON o.customer_id = c.id AND c.is_deleted = 0
       LEFT JOIN product_currencies cur ON o.currency_id = cur.id AND cur.is_deleted = 0
       ${where} ORDER BY o.date DESC, o.id DESC LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all();
    let exchangeRates: Record<string, number> = {};
    try {
      const ratesRow = await c.env.DB.prepare(
        `SELECT value FROM app_settings WHERE category = 'parabirimleri' AND "key" = 'exchange_rates' AND is_deleted = 0 LIMIT 1`
      ).first<{ value: string | null }>();
      if (ratesRow?.value) {
        const parsed = JSON.parse(ratesRow.value) as Record<string, number>;
        if (parsed && typeof parsed === 'object') exchangeRates = parsed;
      }
    } catch { /* ignore */ }
    const rows = (results || []) as { id: number; subtotal?: number; discount_1?: number; currency_id?: number | null; exchange_rate?: number | null; currency_code?: string | null; currency_symbol?: string | null }[];
    const data = rows.map((r) => {
      const subtotal = Number(r.subtotal) ?? 0;
      const discountPct = Number(r.discount_1) ?? 0;
      const totalAmount = subtotal * (1 - discountPct / 100);
      const rate = r.currency_id && r.exchange_rate != null && r.exchange_rate > 0 ? Number(r.exchange_rate) : 1;
      const code = (r.currency_code || 'TRY').toUpperCase();
      const currentRate = (code === 'TRY' || code === 'TL' || code === '') ? 1 : (exchangeRates[code] ?? rate);
      const total_tl_offer = totalAmount * rate;
      const total_tl_current = totalAmount * currentRate;
      const { subtotal: _s, ...rest } = r;
      return { ...rest, total_amount: totalAmount, total_tl_offer, total_tl_current, currency_code: code || 'TRY' };
    });
    return c.json({ data, total: countRes?.total ?? 0, page, limit });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.get('/api/offers/check-order-no', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const order_no = (c.req.query('order_no') || '').trim();
    const exclude_id = c.req.query('exclude_id');
    if (!order_no) return c.json({ available: true });
    let sql = `SELECT id FROM offers WHERE is_deleted = 0 AND order_no = ?`;
    const params: (string | number)[] = [order_no];
    if (exclude_id) {
      const exId = parseInt(exclude_id, 10);
      if (!isNaN(exId)) {
        sql += ' AND id != ?';
        params.push(exId);
      }
    }
    const existing = await c.env.DB.prepare(sql).bind(...params).first();
    return c.json({ available: !existing });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.get('/api/offers/next-order-no', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const year = new Date().getFullYear();
    const prefix = `OR-${year}-`;
    const { results } = await c.env.DB.prepare(
      `SELECT order_no FROM offers WHERE is_deleted = 0 AND order_no LIKE ? ORDER BY order_no DESC LIMIT 1`
    ).bind(prefix + '%').all();
    let nextNum = 1;
    if (results && results.length > 0) {
      const last = (results[0] as { order_no: string }).order_no || '';
      const numPart = last.replace(prefix, '').replace(/\D/g, '');
      const n = parseInt(numPart, 10);
      if (!isNaN(n) && n >= 0) nextNum = n + 1;
    }
    const order_no = `${prefix}${String(nextNum).padStart(4, '0')}`;
    return c.json({ order_no });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.get('/api/offers/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const row = await c.env.DB.prepare(
      `SELECT o.*, c.title as customer_title, c.code as customer_code
       FROM offers o LEFT JOIN customers c ON o.customer_id = c.id AND c.is_deleted = 0
       WHERE o.id = ? AND o.is_deleted = 0`
    ).bind(id).first();
    if (!row) return c.json({ error: 'Teklif bulunamadı' }, 404);
    const { results: items } = await c.env.DB.prepare(
      `SELECT oi.*, p.name as product_name, p.sku as product_sku, u.name as unit_name, p.currency_id as currency_id, cur.symbol as currency_symbol
       FROM offer_items oi
       LEFT JOIN products p ON oi.product_id = p.id AND p.is_deleted = 0
       LEFT JOIN product_unit u ON p.unit_id = u.id AND u.is_deleted = 0
       LEFT JOIN product_currencies cur ON p.currency_id = cur.id AND cur.is_deleted = 0
       WHERE oi.offer_id = ? AND oi.is_deleted = 0 ORDER BY oi.sort_order, oi.id`
    ).bind(id).all();
    return c.json({ ...row, items: items || [] });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.post('/api/offers', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req.json<{
      date?: string; order_no?: string; customer_id?: number | null; contact_id?: number | null;
      description?: string; notes?: string; discount_1?: number; discount_2?: number; discount_3?: number; discount_4?: number;
      currency_id?: number | null; exchange_rate?: number | null;
      company_name?: string; authorized_name?: string; company_phone?: string; company_email?: string;
      tax_office?: string; tax_no?: string; project_name?: string; project_description?: string;
      note_selections?: string; prepared_by_name?: string; prepared_by_title?: string; prepared_by_phone?: string; prepared_by_email?: string;
      include_cover_page?: number; include_attachment_ids?: string;
      include_tag_ids?: string; exclude_tag_ids?: string;
      items?: Array<{ type?: string; product_id?: number | null; description?: string; amount?: number; unit_price?: number; line_discount?: number; tax_rate?: number; discount_1?: number; discount_2?: number; discount_3?: number; discount_4?: number; discount_5?: number }>;
    }>();
    const date = body.date?.trim() || new Date().toISOString().slice(0, 10);
    const order_no = body.order_no?.trim() || null;
    const currency_id = body.currency_id ?? null;
    const exchange_rate = body.exchange_rate != null && body.exchange_rate > 0 ? Number(body.exchange_rate) : 1;
    if (order_no) {
      const dup = await c.env.DB.prepare(`SELECT id FROM offers WHERE is_deleted = 0 AND order_no = ?`).bind(order_no).first();
      if (dup) return c.json({ error: 'Bu teklif numarası zaten kullanılıyor' }, 400);
    }
    const customer_id = body.customer_id ?? null;
    const contact_id = body.contact_id ?? null;
    const description = body.description?.trim() || null;
    const notes = body.notes?.trim() || null;
    const discount_1 = body.discount_1 ?? 0;
    const discount_2 = body.discount_2 ?? 0;
    const discount_3 = body.discount_3 ?? 0;
    const discount_4 = body.discount_4 ?? 0;
    const company_name = body.company_name?.trim() || null;
    const authorized_name = body.authorized_name?.trim() || null;
    const company_phone = body.company_phone?.trim() || null;
    const company_email = body.company_email?.trim() || null;
    const tax_office = body.tax_office?.trim() || null;
    const tax_no = body.tax_no?.trim() || null;
    const project_name = body.project_name?.trim() || null;
    const project_description = body.project_description?.trim() || null;
    const note_selections = body.note_selections ? (typeof body.note_selections === 'string' ? body.note_selections : JSON.stringify(body.note_selections)) : null;
    const prepared_by_name = body.prepared_by_name?.trim() || null;
    const prepared_by_title = body.prepared_by_title?.trim() || null;
    const prepared_by_phone = body.prepared_by_phone?.trim() || null;
    const prepared_by_email = body.prepared_by_email?.trim() || null;
    const include_cover_page = body.include_cover_page ? 1 : 0;
    const include_attachment_ids = body.include_attachment_ids ? (typeof body.include_attachment_ids === 'string' ? body.include_attachment_ids : JSON.stringify(body.include_attachment_ids)) : null;
    const include_tag_ids = body.include_tag_ids ? (typeof body.include_tag_ids === 'string' ? body.include_tag_ids : JSON.stringify(body.include_tag_ids)) : null;
    const exclude_tag_ids = body.exclude_tag_ids ? (typeof body.exclude_tag_ids === 'string' ? body.exclude_tag_ids : JSON.stringify(body.exclude_tag_ids)) : null;
    const uuid = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO offers (date, order_no, uuid, customer_id, contact_id, description, notes, discount_1, discount_2, discount_3, discount_4, currency_id, exchange_rate, company_name, authorized_name, company_phone, company_email, tax_office, tax_no, project_name, project_description, note_selections, prepared_by_name, prepared_by_title, prepared_by_phone, prepared_by_email, include_cover_page, include_attachment_ids, include_tag_ids, exclude_tag_ids, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    ).bind(date, order_no, uuid, customer_id, contact_id, description, notes, discount_1, discount_2, discount_3, discount_4, currency_id, exchange_rate, company_name, authorized_name, company_phone, company_email, tax_office, tax_no, project_name, project_description, note_selections, prepared_by_name, prepared_by_title, prepared_by_phone, prepared_by_email, include_cover_page, include_attachment_ids, include_tag_ids, exclude_tag_ids).run();
    const offerId = (await c.env.DB.prepare(`SELECT last_insert_rowid() as id`).first()) as { id: number };
    const id = offerId.id;
    const items = body.items || [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const type = it.type === 'expense' ? 'expense' : 'product';
      const desc = it.description?.trim() || null;
      const d1 = it.discount_1 ?? 0, d2 = it.discount_2 ?? 0, d3 = it.discount_3 ?? 0, d4 = it.discount_4 ?? 0, d5 = it.discount_5 ?? 0;
      const lineDisc = it.line_discount ?? (d1 + d2 + d3 + d4 + d5);
      await c.env.DB.prepare(
        `INSERT INTO offer_items (offer_id, product_id, amount, unit_price, line_discount, tax_rate, sort_order, type, description, discount_1, discount_2, discount_3, discount_4, discount_5)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, it.product_id ?? null, it.amount ?? 1, it.unit_price ?? 0, lineDisc, it.tax_rate ?? 0, i, type, desc, d1, d2, d3, d4, d5).run();
    }
    const row = await c.env.DB.prepare(`SELECT * FROM offers WHERE id = ?`).bind(id).first();
    return c.json(row, 201);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.put('/api/offers/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const body = await c.req.json<{
      date?: string; order_no?: string; customer_id?: number | null; contact_id?: number | null;
      description?: string; notes?: string; discount_1?: number; discount_2?: number; discount_3?: number; discount_4?: number;
      currency_id?: number | null; exchange_rate?: number | null;
      company_name?: string; authorized_name?: string; company_phone?: string; company_email?: string;
      tax_office?: string; tax_no?: string; project_name?: string; project_description?: string;
      note_selections?: string; prepared_by_name?: string; prepared_by_title?: string; prepared_by_phone?: string; prepared_by_email?: string;
      include_cover_page?: number; include_attachment_ids?: string;
      include_tag_ids?: string; exclude_tag_ids?: string;
      items?: Array<{ type?: string; product_id?: number | null; description?: string; amount?: number; unit_price?: number; line_discount?: number; tax_rate?: number; discount_1?: number; discount_2?: number; discount_3?: number; discount_4?: number; discount_5?: number }>;
    }>();
    const existing = await c.env.DB.prepare(`SELECT id FROM offers WHERE id = ? AND is_deleted = 0`).bind(id).first();
    if (!existing) return c.json({ error: 'Teklif bulunamadı' }, 404);
    if (body.order_no !== undefined) {
      const order_no = (body.order_no as string)?.trim() || null;
      if (order_no) {
        const dup = await c.env.DB.prepare(`SELECT id FROM offers WHERE is_deleted = 0 AND order_no = ? AND id != ?`).bind(order_no, id).first();
        if (dup) return c.json({ error: 'Bu teklif numarası başka bir teklifte kullanılıyor' }, 400);
      }
    }
    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    if (body.date !== undefined) { updates.push('date = ?'); values.push(body.date?.trim() || new Date().toISOString().slice(0, 10)); }
    if (body.order_no !== undefined) { updates.push('order_no = ?'); values.push(body.order_no?.trim() || null); }
    if (body.customer_id !== undefined) { updates.push('customer_id = ?'); values.push(body.customer_id); }
    if (body.contact_id !== undefined) { updates.push('contact_id = ?'); values.push(body.contact_id); }
    if (body.description !== undefined) { updates.push('description = ?'); values.push(body.description?.trim() || null); }
    if (body.notes !== undefined) { updates.push('notes = ?'); values.push(body.notes?.trim() || null); }
    if (body.discount_1 !== undefined) { updates.push('discount_1 = ?'); values.push(body.discount_1); }
    if (body.discount_2 !== undefined) { updates.push('discount_2 = ?'); values.push(body.discount_2); }
    if (body.discount_3 !== undefined) { updates.push('discount_3 = ?'); values.push(body.discount_3); }
    if (body.discount_4 !== undefined) { updates.push('discount_4 = ?'); values.push(body.discount_4); }
    if (body.currency_id !== undefined) { updates.push('currency_id = ?'); values.push(body.currency_id); }
    if (body.exchange_rate !== undefined) { updates.push('exchange_rate = ?'); values.push(body.exchange_rate != null && body.exchange_rate > 0 ? body.exchange_rate : 1); }
    if (body.company_name !== undefined) { updates.push('company_name = ?'); values.push(body.company_name?.trim() || null); }
    if (body.authorized_name !== undefined) { updates.push('authorized_name = ?'); values.push(body.authorized_name?.trim() || null); }
    if (body.company_phone !== undefined) { updates.push('company_phone = ?'); values.push(body.company_phone?.trim() || null); }
    if (body.company_email !== undefined) { updates.push('company_email = ?'); values.push(body.company_email?.trim() || null); }
    if (body.tax_office !== undefined) { updates.push('tax_office = ?'); values.push(body.tax_office?.trim() || null); }
    if (body.tax_no !== undefined) { updates.push('tax_no = ?'); values.push(body.tax_no?.trim() || null); }
    if (body.project_name !== undefined) { updates.push('project_name = ?'); values.push(body.project_name?.trim() || null); }
    if (body.project_description !== undefined) { updates.push('project_description = ?'); values.push(body.project_description?.trim() || null); }
    if (body.note_selections !== undefined) { updates.push('note_selections = ?'); values.push(body.note_selections ? (typeof body.note_selections === 'string' ? body.note_selections : JSON.stringify(body.note_selections)) : null); }
    if (body.prepared_by_name !== undefined) { updates.push('prepared_by_name = ?'); values.push(body.prepared_by_name?.trim() || null); }
    if (body.prepared_by_title !== undefined) { updates.push('prepared_by_title = ?'); values.push(body.prepared_by_title?.trim() || null); }
    if (body.prepared_by_phone !== undefined) { updates.push('prepared_by_phone = ?'); values.push(body.prepared_by_phone?.trim() || null); }
    if (body.prepared_by_email !== undefined) { updates.push('prepared_by_email = ?'); values.push(body.prepared_by_email?.trim() || null); }
    if (body.include_cover_page !== undefined) { updates.push('include_cover_page = ?'); values.push(body.include_cover_page ? 1 : 0); }
    if (body.include_attachment_ids !== undefined) { updates.push('include_attachment_ids = ?'); values.push(body.include_attachment_ids ? (typeof body.include_attachment_ids === 'string' ? body.include_attachment_ids : JSON.stringify(body.include_attachment_ids)) : null); }
    if (body.include_tag_ids !== undefined) { updates.push('include_tag_ids = ?'); values.push(body.include_tag_ids ? (typeof body.include_tag_ids === 'string' ? body.include_tag_ids : JSON.stringify(body.include_tag_ids)) : null); }
    if (body.exclude_tag_ids !== undefined) { updates.push('exclude_tag_ids = ?'); values.push(body.exclude_tag_ids ? (typeof body.exclude_tag_ids === 'string' ? body.exclude_tag_ids : JSON.stringify(body.exclude_tag_ids)) : null); }
    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      values.push(id);
      await c.env.DB.prepare(`UPDATE offers SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    }
    if (body.items !== undefined) {
      await c.env.DB.prepare(`UPDATE offer_items SET is_deleted = 1, updated_at = datetime('now') WHERE offer_id = ?`).bind(id).run();
      for (let i = 0; i < body.items.length; i++) {
        const it = body.items[i];
        const type = it.type === 'expense' ? 'expense' : 'product';
        const desc = it.description?.trim() || null;
        const d1 = it.discount_1 ?? 0, d2 = it.discount_2 ?? 0, d3 = it.discount_3 ?? 0, d4 = it.discount_4 ?? 0, d5 = it.discount_5 ?? 0;
        const lineDisc = it.line_discount ?? (d1 + d2 + d3 + d4 + d5);
        await c.env.DB.prepare(
          `INSERT INTO offer_items (offer_id, product_id, amount, unit_price, line_discount, tax_rate, sort_order, type, description, discount_1, discount_2, discount_3, discount_4, discount_5)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(id, it.product_id ?? null, it.amount ?? 1, it.unit_price ?? 0, lineDisc, it.tax_rate ?? 0, i, type, desc, d1, d2, d3, d4, d5).run();
      }
    }
    const row = await c.env.DB.prepare(`SELECT * FROM offers WHERE id = ?`).bind(id).first();
    return c.json(row);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.delete('/api/offers/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const res = await c.env.DB.prepare(
      `UPDATE offers SET is_deleted = 1, status = 0, updated_at = datetime('now') WHERE id = ? AND is_deleted = 0`
    ).bind(id).run();
    if (res.meta.changes === 0) return c.json({ error: 'Teklif bulunamadı' }, 404);
    return c.json({ success: true });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

type PdfBlockApi = {
  id: string;
  type: string;
  sortOrder: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily?: string;
  fontColor?: string;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline';
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  visible: boolean;
  logo_url?: string;
  logo_width?: number;
  logo_height?: number;
  company_name?: string;
  company_address?: string;
  company_phone?: string;
  company_tax_office?: string;
  company_tax_no?: string;
  footer_text?: string;
  image_key?: string;
  text_content?: string;
  qr_content?: string;
  lineOrientation?: 'horizontal' | 'vertical';
  lineLength?: number;
  lineThickness?: number;
  lineColor?: string;
  customer_show_title?: boolean;
  customer_show_authorized?: boolean;
  customer_show_phone?: boolean;
  customer_show_email?: boolean;
  customer_show_tax_office?: boolean;
  customer_show_tax_no?: boolean;
};

/** Google Fonts - teklif çıktısında kullanılabilir yazı tipleri */
const GOOGLE_FONTS = new Set([
  'Roboto', 'Open Sans', 'Inter', 'Montserrat', 'Poppins', 'Lato', 'Source Sans 3', 'Raleway', 'Ubuntu', 'Nunito',
  'Work Sans', 'DM Sans', 'Merriweather', 'Playfair Display', 'Oswald', 'PT Sans', 'Roboto Condensed', 'Roboto Mono',
  'Arimo', 'Bebas Neue', 'Barlow', 'Barlow Condensed', 'Fira Sans', 'Libre Baskerville', 'Libre Franklin', 'Manrope',
  'Mukta', 'Noto Sans', 'Noto Serif', 'Outfit', 'Plus Jakarta Sans', 'Quicksand', 'Rajdhani', 'Red Hat Display',
  'Rubik', 'Sora', 'Space Grotesk', 'Titillium Web', 'Urbanist', 'Vollkorn', 'Yanone Kaffeesatz', 'Zilla Slab',
  'Crimson Text', 'EB Garamond', 'Inconsolata', 'Josefin Sans', 'Karla', 'Lexend', 'Lora', 'Mulish', 'Nunito Sans',
  'Oxygen', 'Palanquin', 'Prompt', 'Public Sans', 'Readex Pro', 'Sarabun', 'Sen', 'Source Serif 4', 'Spectral',
  'Syne', 'Tinos', 'Trirong', 'Varela Round', 'Abel', 'Acme', 'Almarai', 'Archivo', 'Asap', 'Bitter', 'Cabin', 'Cairo',
  'Comfortaa', 'Dancing Script', 'Dosis', 'Exo 2', 'Figtree', 'Hind', 'IBM Plex Sans', 'IBM Plex Serif', 'Kanit',
  'Kreon', 'Lilita One', 'Martel', 'Maven Pro', 'Oleo Script', 'Pacifico', 'Permanent Marker', 'Philosopher',
  'Raleway Dots', 'Righteous', 'Roboto Slab', 'Satisfy', 'Shadows Into Light', 'Signika', 'Staatliches', 'Tajawal',
  'Ubuntu Condensed', 'Unbounded', 'Vollkorn SC',
]);

function fontFamilyCss(fontFamily: string | undefined): string {
  const ff = (fontFamily?.trim() || 'Roboto').replace(/'/g, "\\'");
  return `'${ff}', sans-serif`;
}

async function buildGoogleFontsCss(blocks: PdfBlockApi[], alwaysIncludeDefault = false): Promise<string> {
  const fonts = new Set<string>();
  let hasTextBlocks = false;
  for (const b of blocks) {
    if (b.type === 'image' || b.type === 'qr_code') continue;
    hasTextBlocks = true;
    const ff = (b.fontFamily || 'Roboto').trim();
    // Sadece bilinen Google Fonts'u ekle; Arial gibi sistem fontlarını ekleme
    if (ff && GOOGLE_FONTS.has(ff)) fonts.add(ff);
  }
  if (!hasTextBlocks && !alwaysIncludeDefault) return '';
  if (fonts.size === 0) fonts.add('Roboto');
  const familyParam = [...fonts].map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;700`).join('&');
  const url = `https://fonts.googleapis.com/css2?${familyParam}&display=block`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    });
    if (!res.ok) return '';
    const css = await res.text();
    return `<style>${css}</style>`;
  } catch {
    // Fallback: link tag ile yükle
    return `<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin /><link rel="stylesheet" href="https://fonts.googleapis.com/css2?${familyParam}&display=block" />`;
  }
}

type BlockCssFlowOpts = { isFirstFlowBlock: boolean };

function pdfBlockTextAlignCss(align: string | undefined): 'left' | 'center' | 'right' | 'justify' {
  if (align === 'center') return 'center';
  if (align === 'right') return 'right';
  if (align === 'justify') return 'justify';
  return 'left';
}

function blockCss(
  b: PdfBlockApi,
  isImage = false,
  showBlockBorders = false,
  flowOpts?: BlockCssFlowOpts
): string {
  if (!b || b.visible === false) return '';
  const x = b.x ?? 20;
  const y = b.y ?? 20;
  const w = b.width ?? 80;
  const h = b.height ?? 40;
  // Negatif değer = sağdan / alttan uzaklık
  const hPos = x < 0 ? `right:${Math.abs(x)}mm` : `left:${x}mm`;
  const vPos = y < 0 ? `bottom:${Math.abs(y)}mm` : `top:${y}mm`;
  const borderStyle = showBlockBorders ? 'outline:1px dashed #9ca3af;' : '';
  // Çizgi bloğu
  if (b.type === 'line') {
    const isVert = b.lineOrientation === 'vertical';
    const lw = isVert ? (b.lineThickness ?? 0.5) : (b.lineLength ?? 170);
    const lh = isVert ? (b.lineLength ?? 170) : (b.lineThickness ?? 0.5);
    const lc = b.lineColor || '#000000';
    return `position:absolute;${hPos};${vPos};width:${lw}mm;height:${lh}mm;background-color:${lc};box-sizing:border-box;${borderStyle}`;
  }
  if (isImage) {
    return `position:absolute;${hPos};${vPos};width:${w}mm;height:${h}mm;box-sizing:border-box;overflow:hidden;${borderStyle}`;
  }
  const fs = b.fontSize ?? 11;
  const ff = fontFamilyCss(b.fontFamily);
  const fc = b.fontColor || '#000000';
  const fw = b.fontWeight === 'bold' ? 'bold' : 'normal';
  const fst = b.fontStyle === 'italic' ? 'italic' : 'normal';
  const td = b.textDecoration === 'underline' ? 'underline' : 'none';
  const ta = pdfBlockTextAlignCss(b.textAlign);
  /** Teklif PDF: yükseklik alanı = bir üst bloktan sonraki dikey boşluk (margin-top), kutunun min-yüksekliği değil */
  if (flowOpts) {
    const marginTopMm = flowOpts.isFirstFlowBlock ? Math.max(0, y) : h;
    const ml = x >= 0 ? `margin-left:${x}mm` : 'margin-left:auto';
    const mr = x < 0 ? `margin-right:${Math.abs(x)}mm` : '';
    const previewH = showBlockBorders ? `min-height:24px;overflow:auto;` : '';
    return `position:relative;${ml};${mr};width:${w}mm;margin-top:${marginTopMm}mm;${previewH}font-size:${fs}px;font-family:${ff};font-weight:${fw};font-style:${fst};text-decoration:${td};text-align:${ta};color:${fc};box-sizing:border-box;padding:4px;${borderStyle}`;
  }
  const sizeStyle = showBlockBorders ? `height:${h}mm;overflow:auto;` : `min-height:${h}mm;`;
  return `position:absolute;${hPos};${vPos};width:${w}mm;${sizeStyle}font-size:${fs}px;font-family:${ff};font-weight:${fw};font-style:${fst};text-decoration:${td};text-align:${ta};color:${fc};box-sizing:border-box;padding:4px;${borderStyle}`;
}

/** Satır/hücre (flex) düzeninde blok — yükseklik içeriğe göre otomatik */
function blockCssRowCell(b: PdfBlockApi, showBlockBorders = false): string {
  if (!b || b.visible === false) return '';
  const borderStyle = showBlockBorders ? 'outline:1px dashed #9ca3af;' : '';
  if (b.type === 'line') {
    const isVert = b.lineOrientation === 'vertical';
    const lc = b.lineColor || '#000000';
    if (isVert) {
      const lh = Math.max(1, b.lineLength ?? 40);
      return `width:100%;min-height:${lh}mm;display:flex;justify-content:center;align-items:stretch;box-sizing:border-box;${borderStyle}`;
    }
    const lh = b.lineThickness ?? 0.5;
    return `width:100%;height:${lh}mm;background-color:${lc};box-sizing:border-box;${borderStyle}`;
  }
  if (b.type === 'image' || b.type === 'qr_code') {
    let s = 'width:100%;box-sizing:border-box;overflow:hidden;text-align:center;';
    if (b.width != null && b.width > 0) s += `max-width:${b.width}mm;`;
    if (b.height != null && b.height > 0) s += `max-height:${b.height}mm;`;
    s += borderStyle;
    return s;
  }
  const fs = b.fontSize ?? 11;
  const ff = fontFamilyCss(b.fontFamily);
  const fc = b.fontColor || '#000000';
  const fw = b.fontWeight === 'bold' ? 'bold' : 'normal';
  const fst = b.fontStyle === 'italic' ? 'italic' : 'normal';
  const td = b.textDecoration === 'underline' ? 'underline' : 'none';
  const ta = pdfBlockTextAlignCss(b.textAlign);
  return `width:100%;box-sizing:border-box;padding:4px;font-size:${fs}px;font-family:${ff};font-weight:${fw};font-style:${fst};text-decoration:${td};text-align:${ta};color:${fc};${borderStyle}`;
}

/** Tablo / toplam HTML'inde satır bloğu ile aynı tipografi (tablolar font'u her zaman miras almayabilir) */
function pdfBlockTypographyCss(b: PdfBlockApi): string {
  const fs = b.fontSize ?? 11;
  const ff = fontFamilyCss(b.fontFamily);
  const fc = b.fontColor || '#000000';
  const fw = b.fontWeight === 'bold' ? 'bold' : 'normal';
  const fst = b.fontStyle === 'italic' ? 'italic' : 'normal';
  const td = b.textDecoration === 'underline' ? 'underline' : 'none';
  return `font-size:${fs}px;font-family:${ff};font-weight:${fw};font-style:${fst};text-decoration:${td};color:${fc};`;
}

const DEFAULT_OFFER_ITEMS_PDF_BLOCK: PdfBlockApi = {
  id: 'default-offer-items',
  type: 'offer_items',
  sortOrder: 0,
  x: 20,
  y: 20,
  width: 170,
  height: 40,
  fontSize: 11,
  fontFamily: 'Roboto',
  fontColor: '#000000',
  fontWeight: 'normal',
  fontStyle: 'normal',
  textDecoration: 'none',
  textAlign: 'left',
  visible: true,
};

function migrateLegacyBlocks(legacy: Record<string, unknown>): PdfBlockApi[] {
  const blocks: PdfBlockApi[] = [];
  const map: Record<string, string> = { company_block: 'company', customer_block: 'customer', offer_header_block: 'offer_header', footer_block: 'footer' };
  let so = 0;
  for (const [key, val] of Object.entries(legacy)) {
    const type = map[key];
    if (!type || !val || typeof val !== 'object') continue;
    const v = val as Record<string, unknown>;
    blocks.push({
      id: `migrated-${key}`,
      type,
      sortOrder: so++,
      x: (v.x as number) ?? 20,
      y: (v.y as number) ?? 20,
      width: (v.width as number) ?? 80,
      height: (v.height as number) ?? 40,
      fontSize: (v.fontSize as number) ?? 11,
      fontFamily: (v.fontFamily as string) || 'Arial',
      fontColor: (v.fontColor as string) || '#000000',
      fontWeight: (v.fontWeight as 'normal' | 'bold') || 'normal',
      fontStyle: (v.fontStyle as 'normal' | 'italic') || 'normal',
      textDecoration: (v.textDecoration as 'none' | 'underline') || 'none',
      textAlign: (v.textAlign as 'left' | 'center' | 'right' | 'justify') || 'left',
      visible: (v.visible as boolean) !== false,
      logo_url: v.logo_url as string | undefined,
      logo_width: v.logo_width as number | undefined,
      logo_height: v.logo_height as number | undefined,
      company_name: v.company_name as string | undefined,
      company_address: v.company_address as string | undefined,
      company_phone: v.company_phone as string | undefined,
      company_tax_office: v.company_tax_office as string | undefined,
      company_tax_no: v.company_tax_no as string | undefined,
      footer_text: v.footer_text as string | undefined,
    });
  }
  const hasItems = blocks.some((b) => b.type === 'offer_items');
  const hasNotes = blocks.some((b) => b.type === 'offer_notes');
  if (!hasItems) {
    blocks.push({ id: 'migrated-offer_items', type: 'offer_items', sortOrder: so++, x: 20, y: 120, width: 170, height: 80, fontSize: 11, visible: true });
  }
  if (!hasNotes) {
    blocks.push({ id: 'migrated-offer_notes', type: 'offer_notes', sortOrder: so++, x: 20, y: 210, width: 170, height: 40, fontSize: 11, visible: true });
  }
  return blocks.sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Müşteri PDF satırı: false/0/"false" kapalı; undefined/null → açık (eski kayıtlar) */
function parseCustomerShowFieldApi(v: unknown): boolean {
  if (v === false || v === 0) return false;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'false' || s === '0' || s === 'no' || s === 'off') return false;
  }
  return true;
}

function normalizeBlock(b: Record<string, unknown>): PdfBlockApi {
  const type = (b.type as string) || 'text';
  const customerFlags =
    type === 'customer'
      ? {
          customer_show_title: parseCustomerShowFieldApi(b.customer_show_title),
          customer_show_authorized: parseCustomerShowFieldApi(b.customer_show_authorized),
          customer_show_phone: parseCustomerShowFieldApi(b.customer_show_phone),
          customer_show_email: parseCustomerShowFieldApi(b.customer_show_email),
          customer_show_tax_office: parseCustomerShowFieldApi(b.customer_show_tax_office),
          customer_show_tax_no: parseCustomerShowFieldApi(b.customer_show_tax_no),
        }
      : {
          customer_show_title: b.customer_show_title as boolean | undefined,
          customer_show_authorized: b.customer_show_authorized as boolean | undefined,
          customer_show_phone: b.customer_show_phone as boolean | undefined,
          customer_show_email: b.customer_show_email as boolean | undefined,
          customer_show_tax_office: b.customer_show_tax_office as boolean | undefined,
          customer_show_tax_no: b.customer_show_tax_no as boolean | undefined,
        };
  return {
    id: (b.id as string) || `block-${Date.now()}`,
    type,
    sortOrder: (b.sortOrder as number) ?? 0,
    x: (b.x as number) ?? 20,
    y: (b.y as number) ?? 20,
    width: (b.width as number) ?? 80,
    height: (b.height as number) ?? 40,
    fontSize: (b.fontSize as number) ?? 11,
    fontFamily: (b.fontFamily as string) || 'Roboto',
    fontColor: (b.fontColor as string) || '#000000',
    fontWeight: (b.fontWeight as 'normal' | 'bold') || 'normal',
    fontStyle: (b.fontStyle as 'normal' | 'italic') || 'normal',
    textDecoration: (b.textDecoration as 'none' | 'underline') || 'none',
    textAlign: (b.textAlign as 'left' | 'center' | 'right' | 'justify') || 'left',
    visible: (b.visible as boolean) !== false,
    logo_url: b.logo_url as string | undefined,
    logo_width: b.logo_width as number | undefined,
    logo_height: b.logo_height as number | undefined,
    company_name: b.company_name as string | undefined,
    company_address: b.company_address as string | undefined,
    company_phone: b.company_phone as string | undefined,
    company_tax_office: b.company_tax_office as string | undefined,
    company_tax_no: b.company_tax_no as string | undefined,
    footer_text: b.footer_text as string | undefined,
    image_key: b.image_key as string | undefined,
    text_content: b.text_content as string | undefined,
    qr_content: b.qr_content as string | undefined,
    lineOrientation: (b.lineOrientation as 'horizontal' | 'vertical') || 'horizontal',
    lineLength: (b.lineLength as number) || 170,
    lineThickness: (b.lineThickness as number) || 0.5,
    lineColor: (b.lineColor as string) || '#000000',
    ...customerFlags,
  };
}

/** Teklif veren firma bloğu — müşteri verisiyle karıştırılmaz; vergi dairesi/no PDF’de basılmaz */
function pdfIssuerCompanyBlockHtml(b: PdfBlockApi, escapeHtml: (s: string) => string): string {
  const logoHtml = b.logo_url
    ? `<img src="${escapeHtml(b.logo_url)}" alt="Logo" style="max-width:${b.logo_width ?? 60}px;max-height:${b.logo_height ?? 40}px;object-fit:contain;display:block;margin-bottom:4px;" />`
    : '';
  const lines: string[] = [];
  const name = (b.company_name || '').trim();
  if (name) lines.push(`<strong>${escapeHtml(name)}</strong>`);
  const addr = (b.company_address || '').trim();
  if (addr) lines.push(escapeHtml(addr));
  const phone = (b.company_phone || '').trim();
  if (phone) lines.push(escapeHtml(phone));
  const inner = lines.join('<br/>');
  return `${logoHtml}${inner ? `<div>${inner}</div>` : ''}`;
}

/** Müşteri bloğu — teklif kaydı + blokta seçilen alanlar (normalizeBlock sonrası boolean) */
function pdfCustomerBlockHtml(offer: Record<string, unknown>, b: PdfBlockApi, escapeHtml: (s: string) => string): string {
  const showTitle = b.customer_show_title !== false;
  const showAuth = b.customer_show_authorized !== false;
  const showPhone = b.customer_show_phone !== false;
  const showEmail = b.customer_show_email !== false;
  const showTaxOff = b.customer_show_tax_office !== false;
  const showTaxNo = b.customer_show_tax_no !== false;

  const snapTitle = String(offer.company_name ?? '').trim();
  const cardTitle = String(offer.customer_title ?? '').trim();
  const displayTitle = snapTitle || cardTitle;
  const lines: string[] = [];
  if (showTitle && displayTitle) lines.push(`<strong>Müşteri:</strong> ${escapeHtml(displayTitle)}`);
  const auth = String(offer.authorized_name ?? '').trim();
  if (showAuth && auth) lines.push(`<strong>Yetkili:</strong> ${escapeHtml(auth)}`);
  const ph = String(offer.company_phone ?? '').trim();
  if (showPhone && ph) lines.push(`<strong>Tel:</strong> ${escapeHtml(ph)}`);
  const em = String(offer.company_email ?? '').trim();
  if (showEmail && em) lines.push(`<strong>E-posta:</strong> ${escapeHtml(em)}`);
  const vd = String(offer.tax_office ?? '').trim();
  if (showTaxOff && vd) lines.push(`Vergi Dairesi: ${escapeHtml(vd)}`);
  const vn = String(offer.tax_no ?? '').trim();
  if (showTaxNo && vn) lines.push(`Vergi No: ${escapeHtml(vn)}`);
  const inner = lines.join('<br/>');
  return inner ? `<div>${inner}</div>` : '';
}

/** Teklif notları + dahil/hariç: satır aralıkları PDF’de tutarlı olsun diye tek gap düzeni */
function pdfOfferNotesBundleHtml(notesCategoriesInner: string, dahilHaricInner: string): string {
  const parts: string[] = [];
  if (notesCategoriesInner) parts.push(notesCategoriesInner);
  if (dahilHaricInner) parts.push(dahilHaricInner);
  if (!parts.length) return '';
  return `<div class="pdf-offer-notes-bundle">${parts.join('')}</div>`;
}

type PdfLayoutCellApi = {
  id: string;
  sortOrder: number;
  /** 1–100; satır toplamı ≤100; PDF’de flex oranı = widthPercent / satır toplamı */
  widthPercent: number;
  block: PdfBlockApi;
};

type PdfLayoutRowApi = {
  id: string;
  sortOrder: number;
  marginTopMm: number;
  cells: PdfLayoutCellApi[];
};

type LayoutConfig = {
  rows: PdfLayoutRowApi[];
  pageWidth: number;
  pageHeight: number;
};

function reindexLayoutCellsApi(cells: PdfLayoutCellApi[]): PdfLayoutCellApi[] {
  if (cells.length === 0) return cells;
  const sorted = [...cells].sort((a, b) => a.sortOrder - b.sortOrder);
  return sorted.map((c, i) => ({ ...c, sortOrder: i }));
}

function numOr(c: Record<string, unknown>, key: string, d: number): number {
  const v = Number(c[key]);
  return Number.isFinite(v) ? v : d;
}

function clampCellWidthPercentApi(w: number): number {
  return Math.max(1, Math.min(100, Math.round(Number(w) || 1)));
}

function redistributePercentsToSum100Api(weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  if (n === 1) return [100];
  const wg = weights.map((x) => Math.max(1e-6, x));
  const W = wg.reduce((a, b) => a + b, 0);
  const ideal = wg.map((x) => (x / W) * 100);
  const ints = ideal.map((x) => Math.max(1, Math.floor(x)));
  let rem = 100 - ints.reduce((a, b) => a + b, 0);
  const byFrac = ideal.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r);
  let t = 0;
  while (rem > 0 && t < 200) {
    ints[byFrac[t % n].i]++;
    rem--;
    t++;
  }
  return ints;
}

function rowPercentsFromColSpansApi(spans: number[]): number[] {
  const sumS = spans.reduce((a, b) => a + b, 0) || 1;
  const raw = spans.map((s) => Math.max(1, Math.round((100 * s) / sumS)));
  let drift = 100 - raw.reduce((a, b) => a + b, 0);
  const out = [...raw];
  out[out.length - 1] = clampCellWidthPercentApi(out[out.length - 1] + drift);
  return out;
}

function normalizeLayoutRowApi(r: Record<string, unknown>): PdfLayoutRowApi {
  const cellsRaw = ((r.cells as unknown[]) || []).filter(Boolean) as Record<string, unknown>[];
  const sortedRaw = [...cellsRaw].sort((a, b) => numOr(a, 'sortOrder', 0) - numOr(b, 'sortOrder', 0));

  const useColMigrate =
    sortedRaw.length > 0 &&
    sortedRaw.every((c) => {
      const wp = Number(c.widthPercent);
      if (Number.isFinite(wp) && wp > 0) return false;
      const cs = Number(c.colSpan);
      return Number.isFinite(cs) && cs >= 1 && cs <= 12;
    });

  let cells: PdfLayoutCellApi[];
  if (useColMigrate) {
    const spans = sortedRaw.map((c) => {
      const cs = Number(c.colSpan);
      return Number.isFinite(cs) && cs >= 1 && cs <= 12 ? cs : 12;
    });
    const wps = rowPercentsFromColSpansApi(spans);
    cells = sortedRaw.map((c, i) => {
      const br = (c.block as Record<string, unknown>) || { type: 'text' };
      return {
        id: String(c.id || `cell-${Date.now()}-${i}`),
        sortOrder: i,
        widthPercent: clampCellWidthPercentApi(wps[i] ?? 100),
        block: normalizeBlock(br),
      };
    });
  } else {
    const n = sortedRaw.length;
    cells = sortedRaw.map((c, i) => {
      const br = (c.block as Record<string, unknown>) || { type: 'text' };
      const wp = Number(c.widthPercent);
      const w = Number.isFinite(wp) && wp > 0 ? Math.round(wp) : n === 1 ? 100 : Math.max(1, Math.round(100 / n));
      return {
        id: String(c.id || `cell-${Date.now()}-${i}`),
        sortOrder: i,
        widthPercent: clampCellWidthPercentApi(w),
        block: normalizeBlock(br),
      };
    });
    const sumW = cells.reduce((s, c) => s + c.widthPercent, 0);
    if (sumW > 100) {
      const next = redistributePercentsToSum100Api(cells.map((c) => c.widthPercent));
      cells = cells.map((c, i) => ({
        ...c,
        widthPercent: clampCellWidthPercentApi(next[i] ?? c.widthPercent),
      }));
    }
  }

  return {
    id: String(r.id || `row-${Date.now()}`),
    sortOrder: numOr(r, 'sortOrder', 0),
    marginTopMm: Math.max(0, numOr(r, 'marginTopMm', 0)),
    cells: reindexLayoutCellsApi(cells),
  };
}

function migrateFlatBlocksToRowsApi(blocks: PdfBlockApi[]): PdfLayoutRowApi[] {
  const sorted = [...blocks].sort((a, b) => a.sortOrder - b.sortOrder);
  return sorted.map((b, i) => ({
    id: `row-${b.id}`,
    sortOrder: i,
    marginTopMm: i === 0 ? Math.max(0, b.y ?? 0) : Math.max(0, b.height ?? 8),
    cells: [
      {
        id: `cell-${b.id}`,
        sortOrder: 0,
        widthPercent: 100,
        block: b,
      },
    ],
  }));
}

function parseLayoutConfig(raw: string | undefined): LayoutConfig {
  const defaultW = 2100;
  const defaultH = 2970;
  if (!raw?.trim()) return { rows: [], pageWidth: defaultW, pageHeight: defaultH };
  try {
    let parsed: { rows?: unknown[]; blocks?: unknown[]; pageWidth?: unknown; pageHeight?: unknown } | Record<string, unknown> =
      JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed === 'string' && parsed.trim().startsWith('{')) {
      try {
        parsed = JSON.parse(parsed) as Record<string, unknown>;
      } catch {
        /* tek katman */
      }
    }
    const pageWidth = Number(parsed.pageWidth) || defaultW;
    const pageHeight = Number(parsed.pageHeight) || defaultH;
    if (parsed && Array.isArray(parsed.rows)) {
      const rows = (parsed.rows as unknown[])
        .filter(Boolean)
        .map((r) => normalizeLayoutRowApi(r as Record<string, unknown>))
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((row, ri) => ({
          ...row,
          sortOrder: ri,
          cells: reindexLayoutCellsApi(row.cells),
        }));
      return { rows, pageWidth, pageHeight };
    }
    if (parsed && Array.isArray(parsed.blocks)) {
      const blocks = ((parsed.blocks as unknown[]) || []).filter(Boolean).map((b) => normalizeBlock(b as Record<string, unknown>));
      return { rows: migrateFlatBlocksToRowsApi(blocks.sort((a, b) => a.sortOrder - b.sortOrder)), pageWidth, pageHeight };
    }
    return { rows: migrateFlatBlocksToRowsApi(migrateLegacyBlocks((parsed || {}) as Record<string, unknown>)), pageWidth, pageHeight };
  } catch {
    return { rows: [], pageWidth: defaultW, pageHeight: defaultH };
  }
}

function flattenBlocksFromRowsApi(rows: PdfLayoutRowApi[]): PdfBlockApi[] {
  return rows
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap((r) =>
      r.cells
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((c) => c.block)
    );
}

/** Örnek teklif PDF - layout ayarlarını test etmek için (gerçek teklif verisi yok) */
app.get('/api/offers/sample/pdf', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const { results: layoutRes } = await c.env.DB.prepare(
      `SELECT value FROM app_settings WHERE category = 'teklif_cikti_ayarlari' AND "key" = 'layout_config' AND is_deleted = 0 LIMIT 1`
    ).all();
    const raw = (layoutRes as { value?: string }[])?.[0]?.value;
    const { rows, pageWidth, pageHeight } = parseLayoutConfig(raw);
    const pageWidthMm = pageWidth / 10;
    const pageHeightMm = pageHeight / 10;
    function escapeHtml(s: string): string {
      return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    const sampleTable = `<table class="pdf-items-sample"><thead><tr><th>Ürün / Açıklama</th><th>Miktar</th><th>Birim Fiyat</th><th>Tutar</th></tr></thead><tbody>
<tr><td>Örnek Ürün 1</td><td class="text-center">2 Adet</td><td class="text-right">1.500,00 ₺</td><td class="text-right">3.000,00 ₺</td></tr>
<tr><td>Örnek Ürün 2</td><td class="text-center">1 Adet</td><td class="text-right">2.000,00 ₺</td><td class="text-right">2.000,00 ₺</td></tr>
</tbody></table><p class="text-right" style="margin-top:1rem"><strong>Genel Toplam:</strong> 5.000,00 ₺</p>`;
    async function sampleCellContent(b: PdfBlockApi): Promise<string> {
      switch (b.type) {
        case 'line': {
          if (b.lineOrientation === 'vertical') {
            const lw = b.lineThickness ?? 0.5;
            const lh = Math.max(1, b.lineLength ?? 40);
            const lc = b.lineColor || '#000000';
            return `<div style="width:${lw}mm;min-height:${lh}mm;background-color:${lc};"></div>`;
          }
          return '';
        }
        case 'text':
          return b.text_content ? escapeHtml(b.text_content).replace(/\n/g, '<br/>') : '';
        case 'qr_code': {
          const qrData = b.qr_content || '';
          const qrUrl = qrData
            ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrData)}`
            : '';
          return qrUrl ? `<img src="${escapeHtml(qrUrl)}" alt="QR" style="max-width:100%;height:auto;object-fit:contain;" />` : '';
        }
        case 'image': {
          const imgKey = b.image_key || '';
          const imgSrc = imgKey ? await storagePathToDataUrl(c.env.STORAGE, imgKey) : null;
          return imgSrc ? `<img src="${imgSrc}" alt="" style="max-width:100%;height:auto;object-fit:contain;" />` : '';
        }
        case 'company': {
          const sampleB: PdfBlockApi = {
            ...b,
            company_name: (b.company_name || '').trim() || 'Örnek Firma A.Ş.',
            company_address: (b.company_address || '').trim() || 'Örnek adres',
            company_phone: (b.company_phone || '').trim() || '0212 000 00 00',
          };
          return pdfIssuerCompanyBlockHtml(sampleB, escapeHtml);
        }
        case 'customer':
          return pdfCustomerBlockHtml(
            {
              company_name: 'Örnek Müşteri Ltd.',
              customer_title: '',
              authorized_name: 'Ahmet Yılmaz',
              company_phone: '0212 111 22 33',
              company_email: 'yetkili@ornekmusteri.com',
              tax_office: 'Örnek Vergi Dairesi',
              tax_no: '1234567890',
            },
            b,
            escapeHtml
          );
        case 'offer_header': {
          const d = new Date();
          const dd = String(d.getDate()).padStart(2, '0');
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const yyyy = d.getFullYear();
          const ta = pdfBlockTextAlignCss(b.textAlign);
          return `<div style="text-align:${ta}">Teklif No: xxxxxx<br/>Tarih: ${dd}/${mm}/${yyyy}</div>`;
        }
        case 'offer_items':
          return sampleTable;
        case 'offer_notes':
          return '<div class="pdf-offer-notes-bundle"><div class="pdf-offer-notes-categories"><div class="pdf-offer-note-line"><strong>Not:</strong> Örnek teklif notu</div></div></div>';
        case 'footer':
          return b.footer_text
            ? b.footer_text.replace(/\n/g, '<br/>')
            : '<strong>Örnek Firma A.Ş.</strong><br/>Resmi Ünvan, Adres, Telefon';
        default:
          return '';
      }
    }
    let blocksHtml = '';
    const sortedRows = [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
    for (const row of sortedRows) {
      const cells = [...row.cells].sort((a, b) => a.sortOrder - b.sortOrder);
      const sumW = cells.reduce((s, c) => s + Math.max(0, Number(c.widthPercent) || 0), 0) || 1;
      let rowParts = '';
      let rowAny = false;
      for (const cell of cells) {
        const b = cell.block;
        if (b.visible === false) continue;
        const w = Math.max(1, Number(cell.widthPercent) || 1);
        const pct = (w / sumW) * 100;
        const isImageBlock = b.type === 'image';
        const isQrBlock = b.type === 'qr_code';
        const isLineBlock = b.type === 'line';
        const content = await sampleCellContent(b);
        if (!content && !isImageBlock && !isQrBlock && !isLineBlock) continue;
        rowAny = true;
        const style = blockCssRowCell(b, true);
        rowParts += `<div style="flex:0 0 ${pct}%;max-width:${pct}%;min-width:0;box-sizing:border-box;"><div class="block block-preview" style="${style}">${content}</div></div>`;
      }
      if (rowAny) {
        blocksHtml += `<div class="pdf-layout-row" style="display:flex;width:100%;box-sizing:border-box;margin-top:${row.marginTopMm}mm;gap:2mm;align-items:flex-start;">${rowParts}</div>`;
      }
    }
    if (rows.length === 0 || !blocksHtml.trim()) {
      blocksHtml = `<div style="margin:20mm;font-family:inherit">${sampleTable}</div>`;
    }
    const googleFontsStyle = await buildGoogleFontsCss(flattenBlocksFromRowsApi(rows), true);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Örnek Teklif</title>
${googleFontsStyle}
<style>body{font-family:"Roboto","Helvetica Neue",Arial,sans-serif;margin:0;padding:0;font-size:12px;position:relative;width:${pageWidthMm}mm;min-height:${pageHeightMm}mm;box-sizing:border-box}
.block{box-sizing:border-box}.block,.block *{font-family:inherit}
.block-preview{outline:1px dashed #9ca3af;outline-offset:0}
table{width:100%;border-collapse:collapse}th,td{border:1px solid #333;padding:6px;text-align:left}th{background:#eee}
.text-right{text-align:right}.text-center{text-align:center}
.pdf-items-sample thead th{text-align:center}
.pdf-items-sample tbody td:nth-child(1){text-align:left}
.pdf-items-sample tbody td:nth-child(2){text-align:center}
.pdf-items-sample tbody td:nth-child(3),.pdf-items-sample tbody td:nth-child(4){text-align:right}
.pdf-items-sample + p{font:inherit}
.pdf-offer-notes-bundle{display:flex;flex-direction:column;gap:0.45rem;line-height:1.5}
.pdf-offer-notes-categories{display:flex;flex-direction:column;gap:0.45rem}
.pdf-offer-note-line{margin:0;padding:0}
.pdf-offer-dahil-haric{display:grid;grid-template-columns:1fr 1fr;gap:2rem;margin:0;line-height:1.5}
.pdf-offer-dahil-haric ul{margin:0.35rem 0 0 1rem;padding:0;list-style:disc}
.pdf-offer-dahil-haric li{margin:0 0 0.35rem 0}
.pdf-offer-dahil-haric li:last-child{margin-bottom:0}</style></head><body>
${blocksHtml}
</body></html>`;
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': 'inline; filename="ornek-teklif.html"' },
    });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

/** Teklif PDF - HTML döner, tarayıcıda yazdır > PDF olarak kaydet ile kullanılır */
app.get('/api/offers/:id/pdf', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const row = await c.env.DB.prepare(
      `SELECT o.*, c.title as customer_title, cur.code as currency_code, cur.symbol as currency_symbol
       FROM offers o LEFT JOIN customers c ON o.customer_id = c.id AND c.is_deleted = 0
       LEFT JOIN product_currencies cur ON o.currency_id = cur.id AND cur.is_deleted = 0
       WHERE o.id = ? AND o.is_deleted = 0`
    ).bind(id).first();
    if (!row) return c.json({ error: 'Teklif bulunamadı' }, 404);
    const offer = row as Record<string, unknown>;
    const { results: items } = await c.env.DB.prepare(
      `SELECT oi.*, p.name as product_name, p.sku as product_sku, u.name as unit_name,
              p.currency_id as line_currency_id, cur_line.symbol as line_currency_symbol, cur_line.code as line_currency_code
       FROM offer_items oi
       LEFT JOIN products p ON oi.product_id = p.id AND p.is_deleted = 0
       LEFT JOIN product_unit u ON p.unit_id = u.id AND p.is_deleted = 0
       LEFT JOIN product_currencies cur_line ON p.currency_id = cur_line.id AND cur_line.is_deleted = 0
       WHERE oi.offer_id = ? AND oi.is_deleted = 0 ORDER BY oi.sort_order, oi.id`
    ).bind(id).all();
    type PdfOfferItem = {
      product_id?: number;
      product_name?: string;
      product_sku?: string;
      description?: string;
      amount?: number;
      unit_price?: number;
      line_discount?: number;
      tax_rate?: number;
      unit_name?: string;
      line_currency_id?: number | null;
      line_currency_symbol?: string | null;
      line_currency_code?: string | null;
    };
    const offerItems = (items || []) as PdfOfferItem[];

    let exchangeRates: Record<string, number> = {};
    try {
      const ratesRow = await c.env.DB.prepare(
        `SELECT value FROM app_settings WHERE category = 'parabirimleri' AND "key" = 'exchange_rates' AND is_deleted = 0 LIMIT 1`
      ).first<{ value: string | null }>();
      if (ratesRow?.value) {
        const parsed = JSON.parse(ratesRow.value) as Record<string, number>;
        if (parsed && typeof parsed === 'object') exchangeRates = parsed;
      }
    } catch { /* ignore */ }
    const { results: curRows } = await c.env.DB.prepare(
      `SELECT id, code, symbol FROM product_currencies WHERE is_deleted = 0`
    ).all();
    const pdfCurrencies = (curRows || []) as { id: number; code: string; symbol?: string | null }[];

    const rateToTRY = (code: string | undefined, rates: Record<string, number>): number => {
      const c0 = (code || '').toUpperCase();
      if (c0 === 'TRY' || c0 === 'TL' || !c0) return 1;
      return rates[c0] ?? 1;
    };
    const convertToOfferCurrency = (
      amount: number,
      itemCurrencyId: number | null | undefined,
      offerCurrencyId: number | null | undefined,
      rates: Record<string, number>
    ): number => {
      const itemCode = itemCurrencyId ? pdfCurrencies.find((x) => x.id === itemCurrencyId)?.code : undefined;
      const offerCode = offerCurrencyId ? pdfCurrencies.find((x) => x.id === offerCurrencyId)?.code : undefined;
      const rateItem = rateToTRY(itemCode, rates);
      const rateOffer = rateToTRY(offerCode, rates);
      return (amount * rateItem) / rateOffer;
    };
    const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

    const offerCurrencyId = offer.currency_id != null ? Number(offer.currency_id) : null;

    let grossTotalOffer = 0;
    let lineDiscountTotalOffer = 0;
    for (const it of offerItems) {
      const amt = Number(it.amount) || 0;
      const up = Number(it.unit_price) || 0;
      const disc = Number(it.line_discount) || 0;
      const lineCur = it.line_currency_id != null ? Number(it.line_currency_id) : null;
      grossTotalOffer += convertToOfferCurrency(amt * up, lineCur, offerCurrencyId, exchangeRates);
      lineDiscountTotalOffer += convertToOfferCurrency(disc, lineCur, offerCurrencyId, exchangeRates);
    }
    const subtotal = grossTotalOffer - lineDiscountTotalOffer;
    const discountPct = Number(offer.discount_1) ?? 0;
    const araToplam = subtotal * (1 - discountPct / 100);
    const offerDiscountAmount = subtotal * (discountPct / 100);
    const totalVat = offerItems.reduce((s, it) => {
      const amt = Number(it.amount) || 0;
      const up = Number(it.unit_price) || 0;
      const disc = Number(it.line_discount) || 0;
      const netLine = amt * up - disc;
      const lineCur = it.line_currency_id != null ? Number(it.line_currency_id) : null;
      const itemNetOffer = convertToOfferCurrency(netLine, lineCur, offerCurrencyId, exchangeRates);
      const share = subtotal > 0 ? itemNetOffer / subtotal : 0;
      return s + (araToplam * share) * ((Number(it.tax_rate) || 0) / 100);
    }, 0);
    const grandTotal = araToplam + totalVat;

    const grossR = round2(grossTotalOffer);
    const subtotalR = round2(subtotal);
    const araToplamR = round2(araToplam);
    const totalVatR = round2(totalVat);
    const grandTotalR = round2(grandTotal);
    const totalDiscountAmountR = round2(lineDiscountTotalOffer + offerDiscountAmount);
    const discountEquivPctGross =
      grossTotalOffer > 1e-9 ? (100 * (lineDiscountTotalOffer + offerDiscountAmount)) / grossTotalOffer : 0;

    const sym = (offer.currency_symbol as string) || (offer.currency_code as string) || '₺';
    const fmt = (n: number) => (n ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtPct = (n: number) =>
      round2(n).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    const hasAnyDiscount = lineDiscountTotalOffer > 1e-9 || discountPct > 0;

    let coverHtml = '';
    if (offer.include_cover_page) {
      const { results: coverRes } = await c.env.DB.prepare(
        `SELECT value FROM app_settings WHERE category = 'teklif_ayarlari' AND "key" = 'cover_page_content' AND is_deleted = 0 LIMIT 1`
      ).all();
      const coverContent = (coverRes as { value?: string }[])?.[0]?.value || '';
      coverHtml = `<div class="cover-page" style="page-break-after:always;padding:2rem;">${coverContent || '<p>Firma tanıtım sayfası</p>'}</div>`;
    }
    let attachmentsHtml = '';
    const attIds = (() => {
      try {
        const v = offer.include_attachment_ids as string | undefined;
        if (!v) return [];
        const arr = typeof v === 'string' ? JSON.parse(v) : v;
        return Array.isArray(arr) ? arr : [];
      } catch { return []; }
    })();
    const productIdsInOffer = new Set(offerItems.map((it: { product_id?: number }) => it.product_id).filter(Boolean));
    for (const attId of attIds) {
      const attRow = await c.env.DB.prepare(`SELECT * FROM offer_attachments WHERE id = ? AND is_deleted = 0`).bind(attId).first();
      if (!attRow) continue;
      const att = attRow as { id: number; title: string; content?: string | null };
      const { results: apRes } = await c.env.DB.prepare(`SELECT product_id FROM offer_attachment_products WHERE attachment_id = ?`).bind(attId).all();
      const prodIds = (apRes || []).map((p: { product_id: number }) => p.product_id);
      const relevant = prodIds.length === 0 || prodIds.some((pid: number) => productIdsInOffer.has(pid));
      if (!relevant) continue;
      const content = (att.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      attachmentsHtml += `<div class="attachment" style="page-break-before:always;padding:2rem;"><h2>${escapeHtml(att.title)}</h2><div>${content}</div></div>`;
    }
    const noteSelections = (() => {
      try {
        const v = offer.note_selections as string | undefined;
        if (!v) return {} as Record<number, number[]>;
        return typeof v === 'string' ? JSON.parse(v) : v;
      } catch { return {}; }
    })();
    const { results: catRes } = await c.env.DB.prepare(
      `SELECT * FROM offer_note_categories WHERE is_deleted = 0 ORDER BY sort_order`
    ).all();
    const categories = (catRes || []) as { id: number; label: string }[];
    function escapeHtml(s: string): string {
      return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    const noteLines: string[] = [];
    for (const cat of categories) {
      const sel = noteSelections[cat.id] || noteSelections[String(cat.id)] || [];
      if (sel.length === 0) continue;
      const { results: optRes } = await c.env.DB.prepare(
        `SELECT label FROM offer_note_options WHERE id IN (${sel.map(() => '?').join(',')}) AND is_deleted = 0`
      ).bind(...sel).all();
      const labels = (optRes || []).map((o: { label: string }) => o.label);
      if (labels.length)
        noteLines.push(
          `<div class="pdf-offer-note-line"><strong>${escapeHtml(cat.label)}:</strong> ${labels.map(escapeHtml).join(', ')}</div>`
        );
    }
    const notesHtml =
      noteLines.length > 0 ? `<div class="pdf-offer-notes-categories">${noteLines.join('')}</div>` : '';
    const includeTagIds = (() => {
      try {
        const v = offer.include_tag_ids as string | undefined;
        if (!v) return [];
        const arr = typeof v === 'string' ? JSON.parse(v) : v;
        return Array.isArray(arr) ? arr : [];
      } catch { return []; }
    })();
    const excludeTagIds = (() => {
      try {
        const v = offer.exclude_tag_ids as string | undefined;
        if (!v) return [];
        const arr = typeof v === 'string' ? JSON.parse(v) : v;
        return Array.isArray(arr) ? arr : [];
      } catch { return []; }
    })();
    let dahilHaricHtml = '';
    if (includeTagIds.length > 0 || excludeTagIds.length > 0) {
      let dahilItems = '';
      let haricItems = '';
      if (includeTagIds.length > 0) {
        const placeholders = includeTagIds.map(() => '?').join(',');
        const { results: incRes } = await c.env.DB.prepare(
          `SELECT label, description FROM offer_tags WHERE id IN (${placeholders}) AND is_deleted = 0`
        ).bind(...includeTagIds).all();
        dahilItems = (incRes || []).map((r: { label: string; description?: string | null }) =>
          `<li>${escapeHtml(r.label)}${r.description ? ` – ${escapeHtml(r.description)}` : ''}</li>`
        ).join('');
      }
      if (excludeTagIds.length > 0) {
        const placeholders = excludeTagIds.map(() => '?').join(',');
        const { results: excRes } = await c.env.DB.prepare(
          `SELECT label, description FROM offer_tags WHERE id IN (${placeholders}) AND is_deleted = 0`
        ).bind(...excludeTagIds).all();
        haricItems = (excRes || []).map((r: { label: string; description?: string | null }) =>
          `<li>${escapeHtml(r.label)}${r.description ? ` – ${escapeHtml(r.description)}` : ''}</li>`
        ).join('');
      }
      dahilHaricHtml =
        `<div class="pdf-offer-dahil-haric">` +
        `<div><strong>Dahil olanlar:</strong><ul>${dahilItems || '<li>—</li>'}</ul></div>` +
        `<div><strong>Hariç olanlar:</strong><ul>${haricItems || '<li>—</li>'}</ul></div>` +
        `</div>`;
    }
    const { results: layoutRes } = await c.env.DB.prepare(
      `SELECT value FROM app_settings WHERE category = 'teklif_cikti_ayarlari' AND "key" = 'layout_config' AND is_deleted = 0 LIMIT 1`
    ).all();
    const raw = (layoutRes as { value?: string }[])?.[0]?.value;
    const { rows, pageWidth, pageHeight } = parseLayoutConfig(raw);
    const pageWidthMm = pageWidth / 10;
    const pageHeightMm = pageHeight / 10;
    const pdfTotBaseL = 'padding:4px 8px;border:1px solid #333;text-align:left';
    const pdfTotBaseR = 'padding:4px 8px;border:1px solid #333;text-align:right;white-space:nowrap';
    const pdfTotBold = 'font-weight:bold';
    const pdfTotDiscount = 'color:#15803d';
    const pdfTotVat = 'color:#ea580c';
    const pdfTotalsRows: string[] = [];
    if (!hasAnyDiscount) {
      pdfTotalsRows.push(
        `<tr><td style="${pdfTotBaseL};${pdfTotBold}">Ara Toplam</td><td style="${pdfTotBaseR};${pdfTotBold}">${fmt(subtotalR)} ${sym}</td></tr>`
      );
      pdfTotalsRows.push(
        `<tr><td style="${pdfTotBaseL};${pdfTotVat}">KDV</td><td style="${pdfTotBaseR};${pdfTotVat}">${fmt(totalVatR)} ${sym}</td></tr>`
      );
      pdfTotalsRows.push(
        `<tr><td style="${pdfTotBaseL};${pdfTotBold}">Genel Toplam</td><td style="${pdfTotBaseR};${pdfTotBold}">${fmt(grandTotalR)} ${sym}</td></tr>`
      );
    } else {
      pdfTotalsRows.push(
        `<tr><td style="${pdfTotBaseL};${pdfTotBold}">Toplam</td><td style="${pdfTotBaseR};${pdfTotBold}">${fmt(grossR)} ${sym}</td></tr>`
      );
      pdfTotalsRows.push(
        `<tr><td style="${pdfTotBaseL};${pdfTotDiscount}">İskonto (${fmtPct(discountEquivPctGross)}%)</td><td style="${pdfTotBaseR};${pdfTotDiscount}">−${fmt(totalDiscountAmountR)} ${sym}</td></tr>`
      );
      pdfTotalsRows.push(
        `<tr><td style="${pdfTotBaseL};${pdfTotBold}">Ara Toplam</td><td style="${pdfTotBaseR};${pdfTotBold}">${fmt(araToplamR)} ${sym}</td></tr>`
      );
      pdfTotalsRows.push(
        `<tr><td style="${pdfTotBaseL};${pdfTotVat}">KDV</td><td style="${pdfTotBaseR};${pdfTotVat}">${fmt(totalVatR)} ${sym}</td></tr>`
      );
      pdfTotalsRows.push(
        `<tr><td style="${pdfTotBaseL};${pdfTotBold}">Genel Toplam</td><td style="${pdfTotBaseR};${pdfTotBold}">${fmt(grandTotalR)} ${sym}</td></tr>`
      );
    }
    /** Üst tabloda Birim Fiyat + Tutar = %22 + %22 — toplamlar aynı genişlikte, sağa hizalı */
    const pdfTotalsColgroup = `<colgroup><col style="width:55%" /><col style="width:45%" /></colgroup>`;
    const pdfItemsColgroup = `<colgroup><col style="width:40%" /><col style="width:16%" /><col style="width:22%" /><col style="width:22%" /></colgroup>`;

    const buildItemsTableHtml = (offerItemsBlock: PdfBlockApi) => {
      const typo = pdfBlockTypographyCss(offerItemsBlock);
      const pdfTotalsTable = `<div style="width:100%;display:flex;justify-content:flex-end;box-sizing:border-box"><table class="pdf-totals-table" style="width:44%;table-layout:fixed;border-collapse:collapse;margin-top:0.75rem;${typo}">${pdfTotalsColgroup}<tbody>${pdfTotalsRows.join('')}</tbody></table></div>`;
      return `<div class="pdf-offer-tables" style="width:100%;box-sizing:border-box;${typo}">
<table class="pdf-items-table" style="table-layout:fixed;width:100%;border-collapse:collapse;${typo}">${pdfItemsColgroup}<thead><tr><th>Ürün / Açıklama</th><th>Miktar</th><th>Birim Fiyat</th><th>Tutar</th></tr></thead><tbody>
${offerItems.map((it) => {
  const name = it.product_name || it.product_sku || it.description || '—';
  const amt = Number(it.amount) || 0;
  const up = Number(it.unit_price) || 0;
  const disc = Number(it.line_discount) || 0;
  const lineTotal = amt * up - disc;
  const lineSym = (it.line_currency_symbol as string) || (it.line_currency_code as string) || '₺';
  const unitLabel = (it.unit_name && String(it.unit_name).trim()) || 'Adet';
  const qtyCell = `${amt.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 4 })} ${escapeHtml(unitLabel)}`;
  return `<tr><td>${escapeHtml(name)}</td><td class="text-center">${qtyCell}</td><td class="text-right">${fmt(up)} ${escapeHtml(lineSym)}</td><td class="text-right">${fmt(lineTotal)} ${escapeHtml(lineSym)}</td></tr>`;
}).join('')}
</tbody></table>
${pdfTotalsTable}</div>`;
    };
    async function offerCellContent(b: PdfBlockApi): Promise<string> {
      switch (b.type) {
        case 'line': {
          if (b.lineOrientation === 'vertical') {
            const lw = b.lineThickness ?? 0.5;
            const lh = Math.max(1, b.lineLength ?? 40);
            const lc = b.lineColor || '#000000';
            return `<div style="width:${lw}mm;min-height:${lh}mm;background-color:${lc};"></div>`;
          }
          return '';
        }
        case 'text':
          return b.text_content ? escapeHtml(b.text_content).replace(/\n/g, '<br/>') : '';
        case 'qr_code': {
          const qrData = b.qr_content || '';
          const qrUrl = qrData
            ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrData)}`
            : '';
          return qrUrl ? `<img src="${escapeHtml(qrUrl)}" alt="QR" style="max-width:100%;height:auto;object-fit:contain;" />` : '';
        }
        case 'image': {
          const imgKey = b.image_key || '';
          const imgSrc = imgKey ? await storagePathToDataUrl(c.env.STORAGE, imgKey) : null;
          return imgSrc ? `<img src="${imgSrc}" alt="" style="max-width:100%;height:auto;object-fit:contain;" />` : '';
        }
        case 'company':
          return pdfIssuerCompanyBlockHtml(b, escapeHtml);
        case 'customer':
          return pdfCustomerBlockHtml(offer, b, escapeHtml);
        case 'offer_header': {
          const rawD = String((offer.date as string) || '').slice(0, 10);
          let dateStr = '';
          if (rawD && rawD.length >= 10) {
            const [y, m, d] = rawD.split('-');
            dateStr = `${d}/${m}/${y}`;
          }
          const ta = pdfBlockTextAlignCss(b.textAlign);
          return `<div style="text-align:${ta}">Teklif No: ${escapeHtml(String(offer.order_no || ''))}<br/>Tarih: ${escapeHtml(dateStr || '')}</div>`;
        }
        case 'offer_items':
          return buildItemsTableHtml(b);
        case 'offer_notes':
          return pdfOfferNotesBundleHtml(notesHtml, dahilHaricHtml);
        case 'footer':
          return b.footer_text
            ? b.footer_text.replace(/\n/g, '<br/>')
            : (offer.prepared_by_name
                ? `Hazırlayan: ${escapeHtml(String(offer.prepared_by_name))}${offer.prepared_by_title ? ` (${escapeHtml(String(offer.prepared_by_title))})` : ''}`
                : '');
        default:
          return '';
      }
    }
    let blocksHtml = '';
    const sortedOfferRows = [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
    for (const row of sortedOfferRows) {
      const cells = [...row.cells].sort((a, b) => a.sortOrder - b.sortOrder);
      const sumW = cells.reduce((s, c) => s + Math.max(0, Number(c.widthPercent) || 0), 0) || 1;
      let rowParts = '';
      let rowAny = false;
      for (const cell of cells) {
        const b = cell.block;
        if (b.visible === false) continue;
        const w = Math.max(1, Number(cell.widthPercent) || 1);
        const pct = (w / sumW) * 100;
        const isImageBlock = b.type === 'image';
        const isQrBlock = b.type === 'qr_code';
        const isLineBlock = b.type === 'line';
        const content = await offerCellContent(b);
        if (!content && !isImageBlock && !isQrBlock && !isLineBlock) continue;
        rowAny = true;
        const style = blockCssRowCell(b, false);
        rowParts += `<div style="flex:0 0 ${pct}%;max-width:${pct}%;min-width:0;box-sizing:border-box;"><div class="block" style="${style}">${content}</div></div>`;
      }
      if (rowAny) {
        blocksHtml += `<div class="pdf-layout-row" style="display:flex;width:100%;box-sizing:border-box;margin-top:${row.marginTopMm}mm;gap:2mm;align-items:flex-start;">${rowParts}</div>`;
      }
    }
    if (rows.length === 0 || !blocksHtml.trim()) {
      const notesBundle = pdfOfferNotesBundleHtml(notesHtml, dahilHaricHtml);
      blocksHtml = `<div style="margin:20mm;font-family:inherit">${notesBundle}${buildItemsTableHtml(DEFAULT_OFFER_ITEMS_PDF_BLOCK)}</div>`;
    }
    const googleFontsStyle = await buildGoogleFontsCss(flattenBlocksFromRowsApi(rows), true);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Teklif ${escapeHtml(String(offer.order_no || ''))}</title>
${googleFontsStyle}
<style>body{font-family:"Roboto","Helvetica Neue",Arial,sans-serif;margin:0;padding:0;font-size:12px;position:relative;width:${pageWidthMm}mm;min-height:${pageHeightMm}mm;box-sizing:border-box}
.block{box-sizing:border-box}.block,.block *{font-family:inherit}
table{width:100%;border-collapse:collapse}th,td{border:1px solid #333;padding:6px;text-align:left}th{background:#eee}.text-right{text-align:right}.text-center{text-align:center}
.pdf-offer-tables .pdf-items-table thead th{text-align:center}
.pdf-offer-tables .pdf-items-table tbody td:nth-child(1){text-align:left}
.pdf-offer-tables .pdf-items-table tbody td:nth-child(2){text-align:center}
.pdf-offer-tables .pdf-items-table tbody td:nth-child(3),.pdf-offer-tables .pdf-items-table tbody td:nth-child(4){text-align:right}
.pdf-offer-tables .pdf-totals-table,.pdf-offer-tables .pdf-totals-table td,.pdf-offer-tables .pdf-totals-table th{font:inherit}
.pdf-offer-tables .pdf-items-table th,.pdf-offer-tables .pdf-items-table td{overflow-wrap:break-word;word-break:break-word}
.pdf-offer-notes-bundle{display:flex;flex-direction:column;gap:0.45rem;line-height:1.5}
.pdf-offer-notes-categories{display:flex;flex-direction:column;gap:0.45rem}
.pdf-offer-note-line{margin:0;padding:0}
.pdf-offer-dahil-haric{display:grid;grid-template-columns:1fr 1fr;gap:2rem;margin:0;line-height:1.5}
.pdf-offer-dahil-haric ul{margin:0.35rem 0 0 1rem;padding:0;list-style:disc}
.pdf-offer-dahil-haric li{margin:0 0 0.35rem 0}
.pdf-offer-dahil-haric li:last-child{margin-bottom:0}</style></head><body>
${coverHtml}
${blocksHtml}
${attachmentsHtml}
</body></html>`;
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': `inline; filename="teklif-${offer.order_no || id}.html"` },
    });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

// ========== OFFER NOTE CATEGORIES (Teklif Notları) ==========
app.get('/api/offer-note-categories', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const { results: cats } = await c.env.DB.prepare(
      `SELECT * FROM offer_note_categories WHERE is_deleted = 0 ORDER BY sort_order, id`
    ).all();
    const categories = (cats || []) as { id: number; code: string; label: string; sort_order: number; allow_custom: number }[];
    const withOptions: { id: number; code: string; label: string; sort_order: number; allow_custom: number; options: unknown[] }[] = [];
    for (const cat of categories) {
      const { results: opts } = await c.env.DB.prepare(
        `SELECT * FROM offer_note_options WHERE category_id = ? AND is_deleted = 0 ORDER BY sort_order, id`
      ).bind(cat.id).all();
      withOptions.push({ ...cat, options: opts || [] });
    }
    return c.json({ data: withOptions });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.put('/api/offer-note-categories/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const body = await c.req.json<{ label?: string; allow_custom?: number }>();
    const updates: string[] = [];
    const values: (string | number)[] = [];
    if (body.label !== undefined) { updates.push('label = ?'); values.push(body.label.trim()); }
    if (body.allow_custom !== undefined) { updates.push('allow_custom = ?'); values.push(body.allow_custom ? 1 : 0); }
    if (updates.length === 0) return c.json({ error: 'Güncellenecek alan yok' }, 400);
    updates.push("updated_at = datetime('now')");
    values.push(id);
    await c.env.DB.prepare(`UPDATE offer_note_categories SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    const row = await c.env.DB.prepare(`SELECT * FROM offer_note_categories WHERE id = ?`).bind(id).first();
    return c.json(row);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.post('/api/offer-note-options', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req.json<{ category_id: number; label: string; sort_order?: number; enabled_by_default?: number }>();
    const category_id = body.category_id;
    const label = (body.label || '').trim();
    if (!label) return c.json({ error: 'Label gerekli' }, 400);
    const sort_order = body.sort_order ?? 0;
    const enabled_by_default = body.enabled_by_default !== undefined ? (body.enabled_by_default ? 1 : 0) : 1;
    await c.env.DB.prepare(
      `INSERT INTO offer_note_options (category_id, label, sort_order, enabled_by_default) VALUES (?, ?, ?, ?)`
    ).bind(category_id, label, sort_order, enabled_by_default).run();
    const row = await c.env.DB.prepare(`SELECT * FROM offer_note_options WHERE id = last_insert_rowid()`).first();
    return c.json(row, 201);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.put('/api/offer-note-options/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const body = await c.req.json<{ label?: string; enabled_by_default?: number }>();
    const updates: string[] = [];
    const values: (string | number)[] = [];
    if (body.label !== undefined) { updates.push('label = ?'); values.push(body.label.trim()); }
    if (body.enabled_by_default !== undefined) { updates.push('enabled_by_default = ?'); values.push(body.enabled_by_default ? 1 : 0); }
    if (updates.length === 0) return c.json({ error: 'Güncellenecek alan yok' }, 400);
    updates.push("updated_at = datetime('now')");
    values.push(id);
    await c.env.DB.prepare(`UPDATE offer_note_options SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    const row = await c.env.DB.prepare(`SELECT * FROM offer_note_options WHERE id = ?`).bind(id).first();
    return c.json(row);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.delete('/api/offer-note-options/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    await c.env.DB.prepare(
      `UPDATE offer_note_options SET is_deleted = 1, status = 0, updated_at = datetime('now') WHERE id = ?`
    ).bind(id).run();
    return c.json({ success: true });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

// ========== OFFER ATTACHMENTS (Teklif Ekleri) ==========
app.get('/api/offer-attachments', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const { results: atts } = await c.env.DB.prepare(
      `SELECT * FROM offer_attachments WHERE is_deleted = 0 ORDER BY sort_order, id`
    ).all();
    const attachments = (atts || []) as { id: number; title: string; content: string | null; sort_order: number }[];
    const withProducts: { id: number; title: string; content: string | null; sort_order: number; product_ids: number[] }[] = [];
    for (const a of attachments) {
      const { results: prods } = await c.env.DB.prepare(
        `SELECT product_id FROM offer_attachment_products WHERE attachment_id = ?`
      ).bind(a.id).all();
      withProducts.push({ ...a, product_ids: (prods || []).map((p: { product_id: number }) => p.product_id) });
    }
    return c.json({ data: withProducts });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.post('/api/offer-attachments', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req.json<{ title: string; content?: string; sort_order?: number; product_ids?: number[] }>();
    const title = (body.title || '').trim();
    if (!title) return c.json({ error: 'Başlık gerekli' }, 400);
    const content = body.content?.trim() || null;
    const sort_order = body.sort_order ?? 0;
    await c.env.DB.prepare(
      `INSERT INTO offer_attachments (title, content, sort_order) VALUES (?, ?, ?)`
    ).bind(title, content, sort_order).run();
    const row = (await c.env.DB.prepare(`SELECT * FROM offer_attachments WHERE id = last_insert_rowid()`).first()) as { id: number };
    const product_ids = body.product_ids || [];
    for (const pid of product_ids) {
      await c.env.DB.prepare(`INSERT OR IGNORE INTO offer_attachment_products (attachment_id, product_id) VALUES (?, ?)`).bind(row.id, pid).run();
    }
    const full = await c.env.DB.prepare(`SELECT * FROM offer_attachments WHERE id = ?`).bind(row.id).first();
    const { results: prods } = await c.env.DB.prepare(`SELECT product_id FROM offer_attachment_products WHERE attachment_id = ?`).bind(row.id).all();
    return c.json({ ...full, product_ids: (prods || []).map((p: { product_id: number }) => p.product_id) }, 201);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.put('/api/offer-attachments/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const body = await c.req.json<{ title?: string; content?: string; sort_order?: number; product_ids?: number[] }>();
    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    if (body.title !== undefined) { updates.push('title = ?'); values.push(body.title.trim()); }
    if (body.content !== undefined) { updates.push('content = ?'); values.push(body.content?.trim() || null); }
    if (body.sort_order !== undefined) { updates.push('sort_order = ?'); values.push(body.sort_order); }
    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      values.push(id);
      await c.env.DB.prepare(`UPDATE offer_attachments SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    }
    if (body.product_ids !== undefined) {
      await c.env.DB.prepare(`DELETE FROM offer_attachment_products WHERE attachment_id = ?`).bind(id).run();
      for (const pid of body.product_ids) {
        await c.env.DB.prepare(`INSERT INTO offer_attachment_products (attachment_id, product_id) VALUES (?, ?)`).bind(id, pid).run();
      }
    }
    const row = await c.env.DB.prepare(`SELECT * FROM offer_attachments WHERE id = ?`).bind(id).first();
    const { results: prods } = await c.env.DB.prepare(`SELECT product_id FROM offer_attachment_products WHERE attachment_id = ?`).bind(id).all();
    return c.json({ ...row, product_ids: (prods || []).map((p: { product_id: number }) => p.product_id) });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.delete('/api/offer-attachments/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    await c.env.DB.prepare(
      `UPDATE offer_attachments SET is_deleted = 1, status = 0, updated_at = datetime('now') WHERE id = ?`
    ).bind(id).run();
    return c.json({ success: true });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

// ========== OFFER TAGS (Dahil/Hariç Etiketleri) ==========
app.get('/api/offer-tags', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const type = (c.req.query('type') || '').trim();
    let where = 'WHERE is_deleted = 0';
    const params: (string | number)[] = [];
    if (type === 'dahil' || type === 'haric') {
      where += ' AND type = ?';
      params.push(type);
    }
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM offer_tags ${where} ORDER BY type, sort_order, id`
    ).bind(...params).all();
    return c.json({ data: results || [] });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.post('/api/offer-tags', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req.json<{ type: 'dahil' | 'haric'; label: string; description?: string; sort_order?: number }>();
    const type = body.type === 'haric' ? 'haric' : 'dahil';
    const label = (body.label || '').trim();
    if (!label) return c.json({ error: 'Etiket gerekli' }, 400);
    const description = body.description?.trim() || null;
    const sort_order = body.sort_order ?? 0;
    await c.env.DB.prepare(
      `INSERT INTO offer_tags (type, label, description, sort_order) VALUES (?, ?, ?, ?)`
    ).bind(type, label, description, sort_order).run();
    const row = await c.env.DB.prepare(`SELECT * FROM offer_tags WHERE id = last_insert_rowid()`).first();
    return c.json(row, 201);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.put('/api/offer-tags/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const body = await c.req.json<{ type?: 'dahil' | 'haric'; label?: string; description?: string; sort_order?: number }>();
    const updates: string[] = [];
    const values: (string | number)[] = [];
    if (body.type !== undefined) { updates.push('type = ?'); values.push(body.type === 'haric' ? 'haric' : 'dahil'); }
    if (body.label !== undefined) { updates.push('label = ?'); values.push(body.label.trim()); }
    if (body.description !== undefined) { updates.push('description = ?'); values.push(body.description?.trim() || null); }
    if (body.sort_order !== undefined) { updates.push('sort_order = ?'); values.push(body.sort_order); }
    if (updates.length === 0) return c.json({ error: 'Güncellenecek alan yok' }, 400);
    updates.push("updated_at = datetime('now')");
    values.push(id);
    await c.env.DB.prepare(`UPDATE offer_tags SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    const row = await c.env.DB.prepare(`SELECT * FROM offer_tags WHERE id = ?`).bind(id).first();
    return c.json(row);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.delete('/api/offer-tags/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    await c.env.DB.prepare(
      `UPDATE offer_tags SET is_deleted = 1, status = 0, updated_at = datetime('now') WHERE id = ?`
    ).bind(id).run();
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
      const pat = `%${escapeLikePattern(n)}%`;
      where += ` AND (${sqlNormalizeCol('name')} LIKE ? OR ${sqlNormalizeCol('code')} LIKE ? OR ${sqlNormalizeCol('city')} LIKE ?)`;
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
      const pat = `%${escapeLikePattern(n)}%`;
      where += ` AND (${sqlNormalizeCol('name')} LIKE ? OR ${sqlNormalizeCol('code')} LIKE ?)`;
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
      const n = normalizeForSearch(search);
      where += ` AND ${sqlNormalizeCol('s.name')} LIKE ?`;
      params.push(`%${escapeLikePattern(n)}%`);
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
    const limit = Math.min(parseInt(c.req.query('limit') || '10000') || 10000, 20000);
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

// ========== OpenCart MySQL endpoints ==========
async function getOpencartMysqlConfig(c: { env: Bindings }): Promise<Record<string, string> | null> {
  const base = await getMysqlConfig(c);
  if (!base) return null;
  if (!c.env.DB) return null;
  const { results } = await c.env.DB.prepare(
    `SELECT value FROM app_settings WHERE category = 'opencart_mysql' AND "key" = 'database' AND is_deleted = 0 AND (status = 1 OR status IS NULL) LIMIT 1`
  ).all();
  const dbVal = (results as { value: string | null }[])[0]?.value;
  const database = (dbVal ?? 'otomati1_opencart').trim() || 'otomati1_opencart';
  return { ...base, database };
}

async function getOpencartMysqlSettings(c: { env: Bindings }): Promise<{
  store_url: string;
  language_id: string;
  store_id: string;
  database: string;
  table_prefix: string;
} | null> {
  if (!c.env.DB) return null;
  const { results } = await c.env.DB.prepare(
    `SELECT key, value FROM app_settings WHERE category = 'opencart_mysql' AND is_deleted = 0 AND (status = 1 OR status IS NULL)`
  ).all();
  const settings: Record<string, string> = {};
  for (const r of results as { key: string; value: string | null }[]) {
    if (r.key) settings[r.key] = r.value ?? '';
  }
  const raw = (settings.table_prefix ?? 'oc_').trim() || 'oc_';
  const tablePrefix = raw.replace(/[^a-zA-Z0-9_]/g, '') || 'oc';
  return {
    store_url: settings.store_url ?? '',
    language_id: settings.language_id ?? '1',
    store_id: settings.store_id ?? '0',
    database: settings.database ?? 'otomati1_opencart',
    table_prefix: tablePrefix.endsWith('_') ? tablePrefix : tablePrefix + '_',
  };
}

app.get('/api/opencart-mysql/categories', async (c) => {
  try {
    const config = await getOpencartMysqlConfig(c);
    if (!config) return c.json({ error: 'OpenCart MySQL bağlantı ayarları yapılandırılmalı' }, 400);
    const settings = await getOpencartMysqlSettings(c);
    const languageId = parseInt(settings?.language_id ?? '1') || 1;
    const prefix = settings?.table_prefix ?? 'oc_';
    const connection = await createMysqlConnection(config);
    try {
      const conn = connection as unknown as { execute: (sql: string, values?: unknown[]) => Promise<[unknown[]]> };
      const [rows] = await conn.execute(
        `SELECT c.category_id, c.image, c.parent_id, c.sort_order, c.status, cd.name, cd.description
         FROM ${prefix}category c
         LEFT JOIN ${prefix}category_description cd ON c.category_id = cd.category_id AND cd.language_id = ?
         ORDER BY c.sort_order, cd.name`,
        [languageId]
      );
      return c.json({ categories: rows as Record<string, unknown>[] });
    } finally {
      await connection.end();
    }
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

app.get('/api/opencart-mysql/manufacturers', async (c) => {
  try {
    const config = await getOpencartMysqlConfig(c);
    if (!config) return c.json({ error: 'OpenCart MySQL bağlantı ayarları yapılandırılmalı' }, 400);
    const settings = await getOpencartMysqlSettings(c);
    const prefix = settings?.table_prefix ?? 'oc_';
    const connection = await createMysqlConnection(config);
    try {
      const conn = connection as unknown as { execute: (sql: string) => Promise<[unknown[]]> };
      const [rows] = await conn.execute(
        `SELECT manufacturer_id, name, image, sort_order FROM ${prefix}manufacturer ORDER BY sort_order, name`
      );
      return c.json({ manufacturers: rows as Record<string, unknown>[] });
    } finally {
      await connection.end();
    }
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

app.get('/api/opencart-mysql/products', async (c) => {
  try {
    const config = await getOpencartMysqlConfig(c);
    if (!config) return c.json({ error: 'OpenCart MySQL bağlantı ayarları yapılandırılmalı' }, 400);
    const settings = await getOpencartMysqlSettings(c);
    const languageId = parseInt(settings?.language_id ?? '1') || 1;
    const search = (c.req.query('search') || '').trim();
    const filterName = (c.req.query('filter_name') || '').trim();
    const filterModel = (c.req.query('filter_model') || '').trim();
    const filterSku = (c.req.query('filter_sku') || '').trim();
    const filterManufacturerId = c.req.query('filter_manufacturer_id');
    const filterStatus = c.req.query('filter_status');
    const filterMatchedSku = c.req.query('filter_matched_sku') === '1';
    const sortBy = (c.req.query('sort_by') || 'p.product_id').trim();
    const sortOrder = (c.req.query('sort_order') || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const limit = Math.min(parseInt(c.req.query('limit') || '50') || 50, 500);
    const offset = Math.max(0, parseInt(c.req.query('offset') || '0') || 0);

    let d1Skus: string[] = [];
    if (c.env.DB) {
      const { results: skuRows } = await c.env.DB.prepare(
        `SELECT DISTINCT TRIM(sku) as sku FROM products WHERE is_deleted = 0 AND sku IS NOT NULL AND TRIM(sku) != ''`
      ).all();
      d1Skus = (skuRows as { sku: string }[]).map((r) => String(r.sku ?? '').trim()).filter(Boolean);
    }
    if (filterMatchedSku && d1Skus.length === 0) return c.json({ products: [], total: 0 });

    const connection = await createMysqlConnection(config);
    try {
      const conn = connection as unknown as { execute: (sql: string, values?: unknown[]) => Promise<[unknown[]]> };
      const where: string[] = ['1=1'];
      const params: unknown[] = [];

      const searchTerm = search || filterName;
      if (searchTerm) {
        const p = `%${escapeLikePattern(normalizeForSearch(searchTerm))}%`;
        where.push('(pd.name LIKE ? OR pd.description LIKE ? OR p.model LIKE ? OR p.sku LIKE ?)');
        params.push(p, p, p, p);
      }
      if (filterModel) {
        where.push('p.model LIKE ?');
        params.push(`%${escapeLikePattern(filterModel)}%`);
      }
      if (filterSku) {
        where.push('p.sku LIKE ?');
        params.push(`%${escapeLikePattern(filterSku)}%`);
      }
      if (filterManufacturerId !== undefined && filterManufacturerId !== '') {
        where.push('p.manufacturer_id = ?');
        params.push(parseInt(filterManufacturerId) || 0);
      }
      if (filterStatus !== undefined && filterStatus !== '') {
        where.push('p.status = ?');
        params.push(parseInt(filterStatus) || 0);
      }
      if (filterMatchedSku && d1Skus.length > 0) {
        const placeholders = d1Skus.map(() => 'TRIM(p.model) = ?').join(' OR ');
        where.push(`(${placeholders})`);
        params.push(...d1Skus);
      }

      const safeSortCols = ['p.product_id', 'pd.name', 'p.model', 'p.sku', 'p.price', 'p.quantity', 'p.status', 'm.name'];
      const sortCol = safeSortCols.includes(sortBy) ? sortBy : 'p.product_id';

      const whereSql = where.join(' AND ');
      const [countRows] = await conn.execute(
        `SELECT COUNT(*) as total FROM oc_product p
         LEFT JOIN oc_product_description pd ON p.product_id = pd.product_id AND pd.language_id = ?
         LEFT JOIN oc_manufacturer m ON p.manufacturer_id = m.manufacturer_id
         WHERE ${whereSql}`,
        [languageId, ...params]
      );
      const total = (countRows as { total: number }[])[0]?.total ?? 0;

      const [rows] = await conn.execute(
        `SELECT p.product_id, p.model, p.sku, p.price, p.quantity, p.image, p.manufacturer_id, p.status,
                pd.name, pd.description, m.name as manufacturer_name
         FROM oc_product p
         LEFT JOIN oc_product_description pd ON p.product_id = pd.product_id AND pd.language_id = ?
         LEFT JOIN oc_manufacturer m ON p.manufacturer_id = m.manufacturer_id
         WHERE ${whereSql}
         ORDER BY ${sortCol} ${sortOrder}
         LIMIT ? OFFSET ?`,
        [languageId, ...params, limit, offset]
      );

      const products = rows as Record<string, unknown>[];
      const d1SkuSet = new Set(d1Skus);
      const out = products.map((p) => ({
        ...p,
        matched: d1SkuSet.has(String(p.model ?? '').trim()),
      }));
      return c.json({ products: out, total });
    } finally {
      await connection.end();
    }
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

/** OpenCart toplu fiyat güncelleme: ana ürünlerden e-ticaret fiyatını alıp yüzde uygulayarak OC fiyatlarını günceller */
app.post('/api/opencart-mysql/products/bulk-update-prices', async (c) => {
  try {
    const config = await getOpencartMysqlConfig(c);
    if (!config) return c.json({ error: 'OpenCart MySQL bağlantı ayarları yapılandırılmalı' }, 400);
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = (await c.req.json()) as { percentage?: number };
    const percentage = Number(body?.percentage ?? 0);
    if (Number.isNaN(percentage) || percentage < -100 || percentage > 500) {
      return c.json({ error: 'Geçersiz yüzde (-100 ile 500 arası)' }, 400);
    }
    const multiplier = 1 + percentage / 100;

    const connection = await createMysqlConnection(config);
    try {
      const conn = connection as unknown as { execute: (sql: string, values?: unknown[]) => Promise<[unknown[]]> };
      const [ocRows] = await conn.execute(
        `SELECT p.product_id, p.model, p.price FROM oc_product p WHERE TRIM(COALESCE(p.model, '')) != ''`
      );
      const ocProducts = ocRows as { product_id: number; model: string; price: number }[];

      let updated = 0;
      let failed = 0;
      for (const oc of ocProducts) {
        const modelVal = String(oc.model ?? '').trim();
        if (!modelVal) continue;
        const modelLower = modelVal.toLowerCase();
        const ppRow = await c.env.DB.prepare(
          `SELECT pp.price FROM product_prices pp
           JOIN products p ON p.id = pp.product_id AND p.is_deleted = 0 AND COALESCE(p.ecommerce_enabled, 1) = 1
           WHERE LOWER(TRIM(COALESCE(p.sku, ''))) = ? AND pp.price_type_id = 1 AND pp.is_deleted = 0 AND (pp.status = 1 OR pp.status IS NULL)
           LIMIT 1`
        )
          .bind(modelLower)
          .first<{ price: number }>();
        if (ppRow == null || ppRow.price == null) {
          failed++;
          continue;
        }
        const newPrice = Math.round(ppRow.price * multiplier * 100) / 100;
        await conn.execute(`UPDATE oc_product SET price = ? WHERE product_id = ?`, [newPrice, oc.product_id]);
        updated++;
      }
      return c.json({ updated, failed, total: ocProducts.length });
    } finally {
      await connection.end();
    }
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

app.get('/api/opencart-mysql/products/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const config = await getOpencartMysqlConfig(c);
    if (!config) return c.json({ error: 'OpenCart MySQL bağlantı ayarları yapılandırılmalı' }, 400);
    const settings = await getOpencartMysqlSettings(c);
    const languageId = parseInt(settings?.language_id ?? '1') || 1;
    const connection = await createMysqlConnection(config);
    try {
      const conn = connection as unknown as { execute: (sql: string, values?: unknown[]) => Promise<[unknown[]]> };
      const [rows] = await conn.execute(
        `SELECT p.*, pd.name, pd.description, pd.tag, pd.meta_title, pd.meta_description, pd.meta_keyword,
                pd.seo_keyword, pd.seo_h1, pd.seo_h2, pd.seo_h3, pd.image_title, pd.image_alt, pd.bilgi
         FROM oc_product p
         LEFT JOIN oc_product_description pd ON p.product_id = pd.product_id AND pd.language_id = ?
         WHERE p.product_id = ?`,
        [languageId, id]
      );
      const product = (rows as Record<string, unknown>[])[0];
      if (!product) return c.json({ error: 'Ürün bulunamadı' }, 404);
      return c.json(product);
    } finally {
      await connection.end();
    }
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

app.put('/api/opencart-mysql/products/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const config = await getOpencartMysqlConfig(c);
    if (!config) return c.json({ error: 'OpenCart MySQL bağlantı ayarları yapılandırılmalı' }, 400);
    const settings = await getOpencartMysqlSettings(c);
    const languageId = parseInt(settings?.language_id ?? '1') || 1;
    const body = (await c.req.json()) as Record<string, unknown>;
    const connection = await createMysqlConnection(config);
    try {
      const conn = connection as unknown as { execute: (sql: string, values?: unknown[]) => Promise<[unknown[]]> };

      if (body.name != null) {
        await conn.execute(
          `UPDATE oc_product_description SET name = ? WHERE product_id = ? AND language_id = ?`,
          [String(body.name), id, languageId]
        );
      }
      const productUpdates: string[] = [];
      const productValues: unknown[] = [];
      if (body.model != null) { productUpdates.push('model = ?'); productValues.push(String(body.model)); }
      if (body.sku != null) { productUpdates.push('sku = ?'); productValues.push(String(body.sku)); }
      if (body.price != null) { productUpdates.push('price = ?'); productValues.push(Number(body.price)); }
      if (body.quantity != null) { productUpdates.push('quantity = ?'); productValues.push(Number(body.quantity)); }
      if (body.tax_class_id != null) { productUpdates.push('tax_class_id = ?'); productValues.push(Number(body.tax_class_id)); }
      if (body.manufacturer_id != null) { productUpdates.push('manufacturer_id = ?'); productValues.push(Number(body.manufacturer_id)); }
      if (body.status != null) { productUpdates.push('status = ?'); productValues.push(Number(body.status)); }
      if (body.sort_order != null) { productUpdates.push('sort_order = ?'); productValues.push(Number(body.sort_order)); }
      if (productUpdates.length > 0) {
        productValues.push(id);
        await conn.execute(
          `UPDATE oc_product SET ${productUpdates.join(', ')} WHERE product_id = ?`,
          productValues
        );
      }
      if (Array.isArray(body.categories)) {
        await conn.execute(`DELETE FROM oc_product_to_category WHERE product_id = ?`, [id]);
        for (const catId of body.categories) {
          const cid = Number(catId);
          if (cid > 0) {
            await conn.execute(
              `INSERT INTO oc_product_to_category (product_id, category_id) VALUES (?, ?)`,
              [id, cid]
            );
          }
        }
      }
      return c.json({ ok: true });
    } finally {
      await connection.end();
    }
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

app.get('/api/opencart-mysql/products/:id/attributes', async (c) => {
  try {
    const id = c.req.param('id');
    const config = await getOpencartMysqlConfig(c);
    if (!config) return c.json({ error: 'OpenCart MySQL bağlantı ayarları yapılandırılmalı' }, 400);
    const settings = await getOpencartMysqlSettings(c);
    const languageId = parseInt(settings?.language_id ?? '1') || 1;
    const connection = await createMysqlConnection(config);
    try {
      const conn = connection as unknown as { execute: (sql: string, values?: unknown[]) => Promise<[unknown[]]> };
      const [rows] = await conn.execute(
        `SELECT pa.attribute_id, pa.text, ad.name
         FROM oc_product_attribute pa
         LEFT JOIN oc_attribute_description ad ON pa.attribute_id = ad.attribute_id AND ad.language_id = ?
         WHERE pa.product_id = ?`,
        [languageId, id]
      );
      return c.json({ attributes: rows as Record<string, unknown>[] });
    } finally {
      await connection.end();
    }
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

app.get('/api/opencart-mysql/products/:id/images', async (c) => {
  try {
    const id = c.req.param('id');
    const config = await getOpencartMysqlConfig(c);
    if (!config) return c.json({ error: 'OpenCart MySQL bağlantı ayarları yapılandırılmalı' }, 400);
    const connection = await createMysqlConnection(config);
    try {
      const conn = connection as unknown as { execute: (sql: string, values?: unknown[]) => Promise<[unknown[]]> };
      const [rows] = await conn.execute(
        `SELECT product_image_id, product_id, image, sort_order FROM oc_product_image WHERE product_id = ? ORDER BY sort_order`,
        [id]
      );
      return c.json({ images: rows as Record<string, unknown>[] });
    } finally {
      await connection.end();
    }
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

app.get('/api/opencart-mysql/products/:id/filters', async (c) => {
  try {
    const id = c.req.param('id');
    const config = await getOpencartMysqlConfig(c);
    if (!config) return c.json({ error: 'OpenCart MySQL bağlantı ayarları yapılandırılmalı' }, 400);
    const settings = await getOpencartMysqlSettings(c);
    const languageId = parseInt(settings?.language_id ?? '1') || 1;
    const connection = await createMysqlConnection(config);
    try {
      const conn = connection as unknown as { execute: (sql: string, values?: unknown[]) => Promise<[unknown[]]> };
      const [rows] = await conn.execute(
        `SELECT pf.filter_id, fd.name
         FROM oc_product_filter pf
         LEFT JOIN oc_filter_description fd ON pf.filter_id = fd.filter_id AND fd.language_id = ?
         WHERE pf.product_id = ?`,
        [languageId, id]
      );
      return c.json({ filters: rows as Record<string, unknown>[] });
    } catch {
      return c.json({ filters: [] });
    } finally {
      await connection.end();
    }
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

app.get('/api/opencart-mysql/products/:id/options', async (c) => {
  try {
    const id = c.req.param('id');
    const config = await getOpencartMysqlConfig(c);
    if (!config) return c.json({ error: 'OpenCart MySQL bağlantı ayarları yapılandırılmalı' }, 400);
    const settings = await getOpencartMysqlSettings(c);
    const languageId = parseInt(settings?.language_id ?? '1') || 1;
    const connection = await createMysqlConnection(config);
    try {
      const conn = connection as unknown as { execute: (sql: string, values?: unknown[]) => Promise<[unknown[]]> };
      const [rows] = await conn.execute(
        `SELECT po.product_option_id, po.option_id, od.name AS option_name, po.value, po.required,
                pov.product_option_value_id, pov.option_value_id, ovd.name AS option_value_name,
                pov.quantity, pov.price, pov.price_prefix
         FROM oc_product_option po
         LEFT JOIN oc_option_description od ON po.option_id = od.option_id AND od.language_id = ?
         LEFT JOIN oc_product_option_value pov ON po.product_option_id = pov.product_option_id
         LEFT JOIN oc_option_value_description ovd ON pov.option_value_id = ovd.option_value_id AND ovd.language_id = ?
         WHERE po.product_id = ?
         ORDER BY po.product_option_id, pov.product_option_value_id`,
        [languageId, languageId, id]
      );
      return c.json({ options: rows as Record<string, unknown>[] });
    } catch {
      return c.json({ options: [] });
    } finally {
      await connection.end();
    }
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

app.get('/api/opencart-mysql/products/:id/related', async (c) => {
  try {
    const id = c.req.param('id');
    const config = await getOpencartMysqlConfig(c);
    if (!config) return c.json({ error: 'OpenCart MySQL bağlantı ayarları yapılandırılmalı' }, 400);
    const settings = await getOpencartMysqlSettings(c);
    const languageId = parseInt(settings?.language_id ?? '1') || 1;
    const connection = await createMysqlConnection(config);
    try {
      const conn = connection as unknown as { execute: (sql: string, values?: unknown[]) => Promise<[unknown[]]> };
      const [rows] = await conn.execute(
        `SELECT pr.related_id, pd.name
         FROM oc_product_related pr
         LEFT JOIN oc_product_description pd ON pr.related_id = pd.product_id AND pd.language_id = ?
         WHERE pr.product_id = ?`,
        [languageId, id]
      );
      return c.json({ related: rows as Record<string, unknown>[] });
    } catch {
      return c.json({ related: [] });
    } finally {
      await connection.end();
    }
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

app.get('/api/opencart-mysql/products/:id/categories', async (c) => {
  try {
    const id = c.req.param('id');
    const config = await getOpencartMysqlConfig(c);
    if (!config) return c.json({ error: 'OpenCart MySQL bağlantı ayarları yapılandırılmalı' }, 400);
    const settings = await getOpencartMysqlSettings(c);
    const languageId = parseInt(settings?.language_id ?? '1') || 1;
    const prefix = settings?.table_prefix ?? 'oc_';
    const connection = await createMysqlConnection(config);
    try {
      const conn = connection as unknown as { execute: (sql: string, values?: unknown[]) => Promise<[unknown[]]> };
      const [rows] = await conn.execute(
        `SELECT ptc.category_id, cd.name, cd.description
         FROM ${prefix}product_to_category ptc
         LEFT JOIN ${prefix}category_description cd ON ptc.category_id = cd.category_id AND cd.language_id = ?
         WHERE ptc.product_id = ?`,
        [languageId, id]
      );
      return c.json({ categories: rows as Record<string, unknown>[] });
    } finally {
      await connection.end();
    }
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

app.get('/api/opencart-mysql/attributes', async (c) => {
  try {
    const config = await getOpencartMysqlConfig(c);
    if (!config) return c.json({ error: 'OpenCart MySQL bağlantı ayarları yapılandırılmalı' }, 400);
    const settings = await getOpencartMysqlSettings(c);
    const languageId = parseInt(settings?.language_id ?? '1') || 1;
    const connection = await createMysqlConnection(config);
    try {
      const conn = connection as unknown as { execute: (sql: string, values?: unknown[]) => Promise<[unknown[]]> };
      const [rows] = await conn.execute(
        `SELECT a.attribute_id, a.attribute_group_id, ad.name
         FROM oc_attribute a
         LEFT JOIN oc_attribute_description ad ON a.attribute_id = ad.attribute_id AND ad.language_id = ?
         ORDER BY a.attribute_group_id, ad.name`,
        [languageId]
      );
      return c.json({ attributes: rows as Record<string, unknown>[] });
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

/** dia_vergidaireleri - listeleme */
app.get('/api/dia/vergidaireleri', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const page = Math.max(1, parseInt(c.req.query('page') || '1'));
    const limit = Math.min(9999, Math.max(1, parseInt(c.req.query('limit') || '50')));
    const search = (c.req.query('search') || '').trim();
    const offset = (page - 1) * limit;
    let where = '1=1';
    const params: unknown[] = [];
    if (search) {
      const n = normalizeForSearch(search);
      const p = `%${escapeLikePattern(n)}%`;
      where += ` AND (${sqlNormalizeCol('vergidairesiadi')} LIKE ? OR ${sqlNormalizeCol('sehir')} LIKE ? OR ${sqlNormalizeCol("CAST(vdkod AS TEXT)")} LIKE ?)`;
      params.push(p, p, p);
    }
    const countRes = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM dia_vergidaireleri WHERE ${where}`
    ).bind(...params).first() as { total: number } | null;
    const total = countRes?.total ?? 0;
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM dia_vergidaireleri WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all();
    return c.json({ data: results, total, page, limit });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

/** dia_carikartlar - listeleme */
app.get('/api/dia/cari-kartlar', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const page = Math.max(1, parseInt(c.req.query('page') || '1'));
    const limit = Math.min(9999, Math.max(1, parseInt(c.req.query('limit') || '50')));
    const search = (c.req.query('search') || '').trim();
    const offset = (page - 1) * limit;
    let where = '1=1';
    const params: unknown[] = [];
    if (search) {
      const p = `%${escapeLikePattern(normalizeForSearch(search))}%`;
      where += ` AND (${sqlNormalizeCol('c.unvan')} LIKE ? OR ${sqlNormalizeCol('c.carikartkodu')} LIKE ? OR ${sqlNormalizeCol('c.verginumarasi')} LIKE ? OR ${sqlNormalizeCol('c.tckimlikno')} LIKE ? OR ${sqlNormalizeCol('c.eposta')} LIKE ?)`;
      params.push(p, p, p, p, p);
    }
    const countRes = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM dia_carikartlar c WHERE ${where}`
    ).bind(...params).first() as { total: number } | null;
    const total = countRes?.total ?? 0;
    const { results } = await c.env.DB.prepare(
      `SELECT c.*, v.vergidairesiadi as vergidairesi_adi
       FROM dia_carikartlar c
       LEFT JOIN dia_vergidaireleri v ON c.vergidairesi = v.vdkod
       WHERE ${where}
       ORDER BY c.id DESC LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all();
    return c.json({ data: results, total, page, limit });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

/** dia_carikartlar -> Paraşüt contact aktarımı */
app.post('/api/dia/cari-kartlar/:id/transfer-parasut', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const idNum = parseInt(id, 10);
    if (!id || isNaN(idNum)) return c.json({ error: 'Geçersiz cari kart id' }, 400);

    const row = await c.env.DB.prepare(
      `SELECT c.*, v.vergidairesiadi as vergidairesi_adi
       FROM dia_carikartlar c
       LEFT JOIN dia_vergidaireleri v ON c.vergidairesi = v.vdkod
       WHERE c.id = ?`
    ).bind(idNum).first() as {
      id: number; unvan?: string | null; eposta?: string | null; verginumarasi?: string | null;
      tckimlikno?: string | null; vergidairesi_adi?: string | null; adresler_adres_adres1?: string | null;
      adresler_adres_sehir?: string | null; adresler_adres_ilce?: string | null;
      adresler_adres_telefon1?: string | null; adresler_adres_ceptel?: string | null;
    } | null;
    if (!row) return c.json({ error: 'Cari kart bulunamadı' }, 404);

    const name = (row.unvan || '').trim();
    if (!name) return c.json({ error: 'Ünvan boş, Paraşüt\'e aktarılamaz' }, 400);

    const auth = await getParasutAuth(c);
    if (!auth) {
      return c.json({ error: 'Paraşüt ayarları eksik veya geçersiz. Ayarlar > Entegrasyonlar > Paraşüt bölümünü doldurun.' }, 400);
    }

    const base = 'https://api.parasut.com';
    const taxNumber = (row.verginumarasi || row.tckimlikno || '').trim().replace(/\s/g, '');
    const contactType = taxNumber.length === 11 ? 'person' : 'company';
    const attributes: Record<string, string> = {
      name,
      contact_type: contactType,
      account_type: 'customer',
    };
    if ((row.eposta || '').trim()) attributes.email = (row.eposta || '').trim();
    if (taxNumber) attributes.tax_number = taxNumber;
    if ((row.vergidairesi_adi || '').trim()) attributes.tax_office = (row.vergidairesi_adi || '').trim();
    if ((row.adresler_adres_adres1 || '').trim()) attributes.address = (row.adresler_adres_adres1 || '').trim();
    if ((row.adresler_adres_sehir || '').trim()) attributes.city = (row.adresler_adres_sehir || '').trim();
    if ((row.adresler_adres_ilce || '').trim()) attributes.district = (row.adresler_adres_ilce || '').trim();
    const phone = (row.adresler_adres_telefon1 || row.adresler_adres_ceptel || '').trim();
    if (phone) attributes.phone = phone;

    const createRes = await fetch(`${base}/v4/${auth.companyId}/contacts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${auth.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          type: 'contacts',
          attributes,
        },
      }),
    });
    const createJson = await createRes.json().catch(() => ({}));
    if (!createRes.ok) {
      const errMsg = (createJson as { errors?: Array<{ detail?: string; title?: string }> }).errors?.[0]?.detail
        || (createJson as { errors?: Array<{ title?: string }> }).errors?.[0]?.title
        || (createJson as { error?: string }).error
        || `HTTP ${createRes.status}`;
      return c.json({ error: `Paraşüt müşteri oluşturulamadı: ${errMsg}` }, 400);
    }
    const contactId = (createJson as { data?: { id?: string } }).data?.id;
    return c.json({ ok: true, parasut_contact_id: contactId, message: 'Paraşüt\'e müşteri olarak aktarıldı.' });
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

/** Veri aktarım dışa aktarım - veri kaynağına göre ham veri döner */
app.post('/api/export/fetch', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req.json<{ dataSource: string }>();
    const { dataSource } = body;
    if (!dataSource) return c.json({ error: 'dataSource gerekli' }, 400);

    const limit = 99999;
    let data: unknown[] = [];

    if (dataSource === 'product') {
      const exportProductSql = `SELECT p.id, p.name, p.sku, p.barcode, p.brand_id, p.category_id, p.type_id, p.product_item_group_id, p.unit_id, p.currency_id,
         p.price, p.quantity, p.image, p.tax_rate, p.supplier_code, p.gtip_code, p.sort_order, p.status,
         pp1.price as ecommerce_price, pp2.price as price_type_2, pp3.price as price_type_3, pp4.price as price_type_4, pp5.price as price_type_5,
         pd.ecommerce_name, pd.main_description, pd.seo_slug, pd.seo_title, pd.seo_description, pd.seo_keywords
         FROM products p
         LEFT JOIN product_prices pp1 ON pp1.product_id = p.id AND pp1.price_type_id = 1 AND pp1.is_deleted = 0
         LEFT JOIN product_prices pp2 ON pp2.product_id = p.id AND pp2.price_type_id = 2 AND pp2.is_deleted = 0
         LEFT JOIN product_prices pp3 ON pp3.product_id = p.id AND pp3.price_type_id = 3 AND pp3.is_deleted = 0
         LEFT JOIN product_prices pp4 ON pp4.product_id = p.id AND pp4.price_type_id = 4 AND pp4.is_deleted = 0
         LEFT JOIN product_prices pp5 ON pp5.product_id = p.id AND pp5.price_type_id = 5 AND pp5.is_deleted = 0
         LEFT JOIN product_descriptions pd ON pd.product_id = p.id AND pd.is_deleted = 0
         WHERE p.is_deleted = 0 AND COALESCE(p.ecommerce_enabled, 1) = 1 ORDER BY p.sort_order, p.id LIMIT ?`;
      const { results } = await d1AllWithSeoKeywordsSelectFallback<Record<string, unknown>>(c.env.DB, exportProductSql, [limit]);
      data = results ?? [];
    } else if (dataSource === 'customer') {
      const { results } = await c.env.DB.prepare(
        `SELECT id, title as name, code, group_id as group_id, type_id, tax_no as tax_number, tax_office, email, phone, phone_mobile, status
         FROM customers WHERE is_deleted = 0 AND status = 1 ORDER BY sort_order, title LIMIT ?`
      ).bind(limit).all();
      data = (results ?? []).map((r: Record<string, unknown>) => ({ ...r, address: '' }));
    } else if (dataSource === 'category') {
      const { results } = await c.env.DB.prepare(
        `SELECT id, name, code, group_id, category_id, sort_order, status FROM product_categories WHERE is_deleted = 0 ORDER BY sort_order, name LIMIT ?`
      ).bind(limit).all();
      data = results ?? [];
    } else if (dataSource === 'brand') {
      const { results } = await c.env.DB.prepare(
        `SELECT id, name, code, description, website, country, sort_order, status FROM product_brands WHERE is_deleted = 0 ORDER BY sort_order, name LIMIT ?`
      ).bind(limit).all();
      data = results ?? [];
    } else if (dataSource === 'type') {
      const { results } = await c.env.DB.prepare(
        `SELECT id, name, code, description, sort_order, status FROM product_types WHERE is_deleted = 0 ORDER BY sort_order, name LIMIT ?`
      ).bind(limit).all();
      data = results ?? [];
    } else if (dataSource === 'unit') {
      const { results } = await c.env.DB.prepare(
        `SELECT id, name, code, description, sort_order, status FROM product_unit WHERE is_deleted = 0 ORDER BY sort_order, name LIMIT ?`
      ).bind(limit).all();
      data = results ?? [];
    } else if (dataSource === 'supplier') {
      const { results } = await c.env.DB.prepare(
        `SELECT id, name, code, currency_id, status FROM suppliers WHERE is_deleted = 0 ORDER BY sort_order, name LIMIT ?`
      ).bind(limit).all();
      data = results ?? [];
    } else if (dataSource === 'currency') {
      const { results } = await c.env.DB.prepare(
        `SELECT id, name, code, symbol, is_default, sort_order, status FROM product_currencies WHERE is_deleted = 0 ORDER BY sort_order, name LIMIT ?`
      ).bind(limit).all();
      data = results ?? [];
    } else if (dataSource === 'tax_rate') {
      const { results } = await c.env.DB.prepare(
        `SELECT id, name, value, description, sort_order, status FROM product_tax_rates WHERE is_deleted = 0 ORDER BY sort_order, name LIMIT ?`
      ).bind(limit).all();
      data = results ?? [];
    } else {
      return c.json({ error: 'Bilinmeyen veri kaynağı' }, 400);
    }

    return c.json({ data });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

/** Batch aktarım - client'tan gelen satırları işler (gerçek ilerleme için) */
app.post('/api/transfer/execute-batch', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req.json<{
      targetTable: string;
      columnMapping: Record<string, string>;
      rows: Record<string, unknown>[];
      skipExisting?: boolean;
    }>();
    const { targetTable, columnMapping, rows, skipExisting } = body;
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
    let skipped = 0;
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
        if (skipExisting && existing) {
          skipped++;
          continue;
        }
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
          if (skipExisting) {
            skipped++;
            continue;
          }
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
    return c.json({ ok: true, inserted, updated, skipped, total: rows.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const d1Msg = err && typeof err === 'object' && 'message' in err ? String((err as { message?: string }).message) : null;
    const finalMsg = d1Msg || msg;
    return c.json({ error: finalMsg }, 500);
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

// ========== AI / OPENAI ==========
/** HTML'den metin çıkarır (script/style temizlenir, boşluklar sıkıştırılır) */
function extractTextFromHtml(html: string, maxLen = 4000): string {
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
  if (text.length > maxLen) text = text.slice(0, maxLen) + '...';
  return text;
}

/** Rakip / referans sayfalarından düz metin (max 3 URL) */
async function fetchCompetitorPageTextsForAi(urls: string[], maxPerUrl = 3500): Promise<string> {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls.slice(0, 3)) {
    let u = raw.trim();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
    try {
      const pageRes = await fetch(u, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; eSyncPlus/1.0)' },
        signal: AbortSignal.timeout(12000),
      });
      if (!pageRes.ok) continue;
      const html = await pageRes.text();
      const t = extractTextFromHtml(html, maxPerUrl);
      if (t) parts.push(`---\nKaynak: ${u}\n${t}\n`);
    } catch {
      /* atla */
    }
  }
  return parts.join('\n');
}

async function getOpenAiApiKey(c: { env: { DB?: D1Database } }): Promise<string | null> {
  if (!c.env.DB) return null;
  const { results } = await c.env.DB.prepare(
    `SELECT value FROM app_settings WHERE category = 'openai' AND "key" = 'api_key' AND is_deleted = 0 LIMIT 1`
  ).all();
  return ((results as { value: string | null }[])[0]?.value ?? '').trim() || null;
}

const SEO_META_DESCRIPTION_MAX_LEN = 160;

/** Hedef kelime: seo_keywords içindeki virgül/noktalı virgülle ayrılmış ilk ifade; yoksa ürün adının ilk kelimesi */
function extractPrimarySeoTargetKeyword(seoKeywords: string, productName: string): string {
  const first = seoKeywords
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)[0];
  if (first) return first;
  const w = productName.trim().split(/\s+/).filter(Boolean)[0];
  return w ?? '';
}

function turkishTextIncludes(haystack: string, needle: string): boolean {
  const h = haystack.toLocaleLowerCase('tr-TR');
  const n = needle.toLocaleLowerCase('tr-TR').trim();
  if (!n) return true;
  return h.includes(n);
}

/** Üretilen meta açıklamada hedef kelime yoksa doğal biçimde eklenir (max uzunluk korunur) */
function ensureMetaDescriptionContainsTargetKeyword(
  seoDescription: string,
  seoKeywords: string,
  productName: string
): string {
  const target = extractPrimarySeoTargetKeyword(seoKeywords, productName);
  let out = seoDescription.trim();
  if (!target) return out.slice(0, SEO_META_DESCRIPTION_MAX_LEN);
  if (turkishTextIncludes(out, target)) return out.slice(0, SEO_META_DESCRIPTION_MAX_LEN);
  if (!out) return target.slice(0, SEO_META_DESCRIPTION_MAX_LEN);
  const connector = /[.!?…]$/.test(out) ? ' ' : '. ';
  const tail = `${connector}${target}`;
  if (out.length + tail.length <= SEO_META_DESCRIPTION_MAX_LEN) {
    return (out + tail).slice(0, SEO_META_DESCRIPTION_MAX_LEN);
  }
  const prefixed = `${target}: ${out}`;
  if (prefixed.length <= SEO_META_DESCRIPTION_MAX_LEN) return prefixed;
  return prefixed.slice(0, SEO_META_DESCRIPTION_MAX_LEN);
}

/** Ürün adından SEO: slug, meta başlık, açıklama, anahtar kelimeler */
app.post('/api/ai/generate-seo', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req.json<{ name?: string; brand_name?: string; category_path?: string }>().catch(() => null);
    const name = (body?.name ?? '').trim();
    if (!name) return c.json({ error: 'Ürün adı gerekli' }, 400);

    const apiKey = await getOpenAiApiKey(c);
    if (!apiKey) return c.json({ error: 'OpenAI API anahtarı tanımlı değil. Ayarlar > Entegrasyonlar sayfasından ekleyin.' }, 400);

    const brandName = (body?.brand_name ?? '').trim();
    const categoryPath = (body?.category_path ?? '').trim();
    const userPrompt = `Ürün adı: ${name}${brandName ? `\nMarka: ${brandName}` : ''}${categoryPath ? `\nKategori yolu: ${categoryPath}` : ''}`;

    const systemPrompt = `Sen Türkçe e-ticaret SEO uzmanısın. Yalnızca verilen ürün adından (ve varsa marka/kategori) SEO alanları üret.

Yanıtını SADECE şu JSON formatında ver, başka metin yazma:
{"seo_slug":"...","seo_title":"...","seo_description":"...","seo_keywords":"..."}

Kurallar:
- seo_slug: URL yolu parçası; küçük harf, rakam ve tire; ASCII (Türkçe karakter kullanma: ı→i, ş→s, ğ→g, ü→u, ö→o, ç→c); örn: red-detayli-urun-adi
- seo_title: meta title, arama sonuçları için, max 60 karakter, Türkçe
- seo_keywords: virgülle ayrılmış 8-12 anahtar kelime, Türkçe. İlk sıradaki ifade "hedef kelime"dir (birincil anahtar kelime).
- seo_description: meta description, max 160 karakter, tıklanmayı teşvik eden özet
- ZORUNLU DOĞRULAMA (buna uygun üret): "Hedef kelime, ürün meta açıklaması içinde geçmelidir." Yani seo_keywords içinde virgülle ayrılmış İLK ifade, seo_description metninde tamamı veya anlamlı biçimde (kelime köküyle) geçmeli. Önce seo_keywords listesini yaz (hedef kelime en başta), sonra seo_description metnini bu hedefi içerecek şekilde kur; açıklama hedeften bağımsız yazılmasın.`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.55,
      }),
    });

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
    if (!res.ok) {
      const errMsg = data?.error?.message ?? (await res.text()).slice(0, 200);
      return c.json({ error: `OpenAI: ${errMsg}` }, 400);
    }

    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) return c.json({ error: 'OpenAI yanıt vermedi' }, 500);

    let parsed: { seo_slug?: string; seo_title?: string; seo_description?: string; seo_keywords?: string };
    try {
      const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      parsed = JSON.parse(cleaned) as typeof parsed;
    } catch {
      return c.json({ error: 'OpenAI yanıtı parse edilemedi' }, 500);
    }

    const rawKeywords = parsed.seo_keywords ?? '';
    const rawDesc = parsed.seo_description ?? '';
    const seo_description = ensureMetaDescriptionContainsTargetKeyword(rawDesc, rawKeywords, name);

    return c.json({
      seo_slug: parsed.seo_slug ?? '',
      seo_title: parsed.seo_title ?? '',
      seo_description,
      seo_keywords: rawKeywords,
    });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'İstek başarısız' }, 500);
  }
});

/** E-ticaret adı + açıklama: mağaza ürün sayfası, SKU ve isteğe bağlı rakip URL analizi */
app.post('/api/ai/generate-ecommerce', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req
      .json<{ name?: string; brand_name?: string; category_path?: string; sku?: string; competitor_urls?: string[] }>()
      .catch(() => null);
    const name = (body?.name ?? '').trim();
    if (!name) return c.json({ error: 'Ürün adı gerekli' }, 400);

    const apiKey = await getOpenAiApiKey(c);
    if (!apiKey) return c.json({ error: 'OpenAI API anahtarı tanımlı değil. Ayarlar > Entegrasyonlar sayfasından ekleyin.' }, 400);

    const brandName = (body?.brand_name ?? '').trim();
    const categoryPath = (body?.category_path ?? '').trim();
    const sku = (body?.sku ?? '').trim();
    const competitorUrls = Array.isArray(body?.competitor_urls) ? body.competitor_urls.filter((u): u is string => typeof u === 'string' && u.trim() !== '') : [];

    let siteContent = '';
    const settings = await getOpencartMysqlSettings(c);
    const storeUrl = (settings?.store_url ?? '').trim().replace(/\/+$/, '');
    if (sku && storeUrl) {
      try {
        const config = await getOpencartMysqlConfig(c);
        if (config) {
          const connection = await createMysqlConnection(config);
          try {
            const conn = connection as unknown as { execute: (sql: string, values?: unknown[]) => Promise<[unknown[]]> };
            const prefix = (settings?.table_prefix ?? 'oc_').replace(/[^a-zA-Z0-9_]/g, '') || 'oc';
            const tbl = prefix.endsWith('_') ? prefix + 'product' : prefix + '_product';
            const [rows] = await conn.execute(
              `SELECT product_id FROM ${tbl} WHERE TRIM(COALESCE(model, '')) = ? LIMIT 1`,
              [sku]
            );
            const productId = (rows as { product_id?: number }[])[0]?.product_id;
            if (productId) {
              const productUrl = `${storeUrl}/index.php?route=product/product&product_id=${productId}`;
              const pageRes = await fetch(productUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; eSyncPlus/1.0)' },
                signal: AbortSignal.timeout(10000),
              });
              if (pageRes.ok) {
                const html = await pageRes.text();
                siteContent = extractTextFromHtml(html, 4000);
              }
            }
          } finally {
            await connection.end();
          }
        }
      } catch {
        /* OpenCart veya fetch hatası */
      }
    }

    let competitorContent = '';
    if (competitorUrls.length > 0) {
      competitorContent = await fetchCompetitorPageTextsForAi(competitorUrls);
    }

    const userPrompt = `Ürün: ${name}${brandName ? `, Marka: ${brandName}` : ''}${categoryPath ? `, Kategori: ${categoryPath}` : ''}${sku ? `, SKU: ${sku}` : ''}`;

    let systemPrompt = `Sen bir e-ticaret metin yazarısın. Verilen ürün bilgilerine göre Türkçe yalnızca "e-ticaret ürün adı" ve "ürün açıklaması" üret. Rakip ve referans metinlerdeki güçlü ifadeleri özgün şekilde uyarlayabilirsin; birebir kopya yapma.`;

    const refBlocks: string[] = [];
    if (siteContent) {
      refBlocks.push(
        `Bağlı mağazadaki (OpenCart) aynı SKU ile bulunan ürün sayfasından özet:\n---\n${siteContent}\n---`
      );
    }
    if (competitorContent) {
      refBlocks.push(`Kullanıcının verdiği rakip ürün sayfalarından çıkarılan metin:\n${competitorContent}`);
    }
    if (refBlocks.length > 0) {
      systemPrompt += `

Aşağıdaki kaynakları rakip / referans analizi için kullan; ton ve fayda vaatlerini güçlendir, yanıltıcı iddia ekleme:
${refBlocks.join('\n\n')}`;
    } else {
      systemPrompt += `

Doğrudan rakip sayfası verilmedi; ürün adı ve kategoriye göre sektörde yaygın satış odaklı bir e-ticaret adı ve açıklama yaz.`;
    }

    systemPrompt += `

Yanıtını SADECE şu JSON formatında ver:
{"ecommerce_name":"...","main_description":"..."}

Kurallar:
- ecommerce_name: E-ticaret vitrinlerinde görünecek çekici ürün adı (max 100 karakter); rakip örneklerindeki güçlü isimlendirme tarzından ilham al
- main_description: Ürün açıklaması; HTML kullanabilirsin (p, ul, li, strong). 2-4 paragraf, satış ve fayda odaklı`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
      }),
    });

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
    if (!res.ok) {
      const errMsg = data?.error?.message ?? (await res.text()).slice(0, 200);
      return c.json({ error: `OpenAI: ${errMsg}` }, 400);
    }

    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) return c.json({ error: 'OpenAI yanıt vermedi' }, 500);

    let parsed: { ecommerce_name?: string; main_description?: string };
    try {
      const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      parsed = JSON.parse(cleaned) as typeof parsed;
    } catch {
      return c.json({ error: 'OpenAI yanıtı parse edilemedi' }, 500);
    }

    return c.json({
      ecommerce_name: parsed.ecommerce_name ?? '',
      main_description: parsed.main_description ?? '',
    });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'İstek başarısız' }, 500);
  }
});

// ========== APP SETTINGS ==========
/** Kategori listesi (opsiyonel prefix ile filtreleme) */
app.get('/api/app-settings-categories', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const prefix = (c.req.query('prefix') ?? '').trim();
    const sql = prefix
      ? `SELECT DISTINCT category FROM app_settings WHERE is_deleted = 0 AND category LIKE ? ORDER BY category`
      : `SELECT DISTINCT category FROM app_settings WHERE is_deleted = 0 ORDER BY category`;
    const { results } = prefix
      ? await c.env.DB.prepare(sql).bind(prefix + '%').all()
      : await c.env.DB.prepare(sql).all();
    const categories = (results as { category: string }[]).map((r) => r.category).filter(Boolean);
    return c.json(categories);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

/** Marketplace bağlantı testi - category ile platform belirlenir */
app.post('/api/marketplace/test', async (c) => {
  try {
    const body = await c.req.json<{ category: string; settings: Record<string, string> }>().catch(() => null);
    if (!body?.category?.trim() || !body?.settings || typeof body.settings !== 'object') {
      return c.json({ error: 'category ve settings gerekli' }, 400);
    }
    const { category, settings } = body;
    const type = category.replace(/^marketplace_/, '').toLowerCase();
    const apiUrl = settings.api_url?.trim();

    if (type === 'trendyol') {
      const supplierId = settings.supplier_id?.trim();
      const apiKey = settings.api_key?.trim();
      const apiSecret = settings.api_secret?.trim();
      if (!supplierId || !apiKey || !apiSecret) return c.json({ ok: false, error: 'Satıcı ID, API Key ve API Secret gerekli' }, 400);
      const userAgent = (settings.user_agent?.trim() || 'SelfIntegration').slice(0, 30);
      const env = settings.environment?.trim().toLowerCase();
      const base = apiUrl
        ? apiUrl.replace(/\/+$/, '')
        : env === 'stage'
          ? 'https://stageapigw.trendyol.com'
          : 'https://apigw.trendyol.com';
      const auth = btoa(`${apiKey}:${apiSecret}`);
      const clientIp = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
      const trendyolHeaders = {
        Authorization: 'Basic ' + auth,
        'User-Agent': `${supplierId} - ${userAgent}`,
        'Content-Type': 'application/json',
        'x-clientip': clientIp,
        'x-correlationid': crypto.randomUUID(),
        'x-agentname': userAgent,
      };
      const res = await fetch(`${base}/integration/product/sellers/${supplierId}/products?page=0&size=1`, {
        headers: trendyolHeaders,
      });
      if (res.ok || res.status === 404) return c.json({ ok: true });
      const errText = await res.text();
      const errPreview = errText.slice(0, 200);
      return c.json({ ok: false, error: `Trendyol: ${res.status} ${errPreview}` }, 400);
    }
    if (type === 'hepsiburada') {
      const token = settings.bearer_token?.trim();
      if (!token) return c.json({ ok: false, error: 'Bearer Token gerekli' }, 400);
      const base = (apiUrl || 'https://api.hepsiglobal.com').replace(/\/+$/, '');
      const res = await fetch(`${base}/api/v1/marketplaces/list`, {
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      });
      if (res.ok || res.status === 401) return c.json({ ok: true });
      return c.json({ ok: false, error: `Hepsiburada: ${res.status}` }, 400);
    }
    if (type === 'n11') {
      const clientId = settings.client_id?.trim();
      const clientSecret = settings.client_secret?.trim();
      if (!clientId || !clientSecret) return c.json({ ok: false, error: 'Client ID ve Client Secret gerekli' }, 400);
      const base = (apiUrl || 'https://api-sandbox.n1co.shop').replace(/\/+$/, '');
      const res = await fetch(`${base}/api/v3/Token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret }),
      });
      if (res.ok) return c.json({ ok: true });
      return c.json({ ok: false, error: `N11: ${res.status} ${(await res.text()).slice(0, 150)}` }, 400);
    }
    if (type === 'idefix') {
      const supplierId = settings.supplier_id?.trim();
      const apiKey = settings.api_key?.trim();
      const apiSecret = settings.api_secret?.trim();
      if (!supplierId || !apiKey || !apiSecret) return c.json({ ok: false, error: 'Satıcı ID, API Key ve API Secret gerekli' }, 400);
      const base = (apiUrl || 'https://merchantapi.idefix.com').replace(/\/+$/, '');
      const token = btoa(`${apiKey}:${apiSecret}`);
      const res = await fetch(`${base}/pim/product-category`, {
        headers: { 'X-API-KEY': token, 'Content-Type': 'application/json' },
      });
      if (res.ok || res.status === 401) return c.json({ ok: true });
      return c.json({ ok: false, error: `Idefix: ${res.status}` }, 400);
    }

    return c.json({ ok: true });
  } catch (err: unknown) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : 'Test başarısız' }, 500);
  }
});

/** Marketplace kategori listesi */
app.post('/api/marketplace/categories', async (c) => {
  try {
    const body = await c.req.json<{ category: string; settings: Record<string, string> }>().catch(() => null);
    if (!body?.category?.trim() || !body?.settings || typeof body.settings !== 'object') {
      return c.json({ error: 'category ve settings gerekli' }, 400);
    }
    const { category, settings } = body;
    const type = category.replace(/^marketplace_/, '').toLowerCase();
    const apiUrl = settings.api_url?.trim();

    const flatten = (items: { id?: number; name?: string; subCategories?: unknown }[], parentId: number | null = null): { id: number; name: string; parentId: number | null }[] => {
      const result: { id: number; name: string; parentId: number | null }[] = [];
      for (const cat of items) {
        const id = cat.id ?? 0;
        result.push({ id, name: cat.name ?? '', parentId });
        const subs = Array.isArray(cat.subCategories) ? cat.subCategories : [];
        if (subs.length) result.push(...flatten(subs as { id?: number; name?: string; subCategories?: unknown }[], id));
      }
      return result;
    };

    if (type === 'trendyol') {
      const supplierId = settings.supplier_id?.trim();
      const apiKey = settings.api_key?.trim();
      const apiSecret = settings.api_secret?.trim();
      if (!supplierId || !apiKey || !apiSecret) return c.json({ error: 'Satıcı ID, API Key ve API Secret gerekli' }, 400);
      const userAgent = (settings.user_agent?.trim() || 'SelfIntegration').slice(0, 30);
      const env = settings.environment?.trim().toLowerCase();
      const base = apiUrl
        ? apiUrl.replace(/\/+$/, '')
        : env === 'stage'
          ? 'https://stageapigw.trendyol.com'
          : 'https://apigw.trendyol.com';
      const auth = btoa(`${apiKey}:${apiSecret}`);
      const clientIp = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
      const trendyolHeaders: Record<string, string> = {
        Authorization: 'Basic ' + auth,
        'User-Agent': `${supplierId} - ${userAgent}`,
        'x-clientip': clientIp,
        'x-correlationid': crypto.randomUUID(),
        'x-agentname': userAgent,
      };
      const res = await fetch(`${base}/integration/product/product-categories`, {
        method: 'GET',
        headers: trendyolHeaders,
      });
      if (!res.ok) {
        const errText = await res.text();
        return c.json({ error: `Trendyol ${res.status}: ${errText.slice(0, 400)}` }, 400);
      }
      const raw = (await res.json()) as unknown;
      let data: unknown[] = [];
      if (Array.isArray(raw)) {
        data = raw;
      } else if (raw && typeof raw === 'object' && 'categories' in raw) {
        data = Array.isArray((raw as { categories?: unknown }).categories) ? (raw as { categories: unknown[] }).categories : [];
      } else if (raw && typeof raw === 'object' && 'id' in raw) {
        data = [raw];
      }
      const categories = Array.isArray(data) ? flatten(data) : [];
      return c.json({ categories });
    }
    if (type === 'hepsiburada') {
      const token = settings.bearer_token?.trim();
      if (!token) return c.json({ error: 'Bearer Token gerekli' }, 400);
      const base = (apiUrl || 'https://api.hepsiglobal.com').replace(/\/+$/, '');
      const res = await fetch(`${base}/api/v1/marketplaces/list`, {
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      });
      if (!res.ok) return c.json({ error: `Hepsiburada: ${res.status}` }, 400);
      const data = (await res.json()) as { data?: { id?: number; name?: string }[] };
      const cats = (data?.data ?? []).map((cat) => ({ id: cat.id ?? 0, name: cat.name ?? '', parentId: null as number | null }));
      return c.json({ categories: cats });
    }
    if (type === 'idefix') {
      const supplierId = settings.supplier_id?.trim();
      const apiKey = settings.api_key?.trim();
      const apiSecret = settings.api_secret?.trim();
      if (!supplierId || !apiKey || !apiSecret) return c.json({ error: 'Satıcı ID, API Key ve API Secret gerekli' }, 400);
      const base = (apiUrl || 'https://merchantapi.idefix.com').replace(/\/+$/, '');
      const token = btoa(`${apiKey}:${apiSecret}`);
      const res = await fetch(`${base}/pim/product-category`, {
        headers: { 'X-API-KEY': token, 'Content-Type': 'application/json' },
      });
      if (!res.ok) return c.json({ error: `Idefix: ${res.status}` }, 400);
      const data = (await res.json()) as { id?: number; name?: string; subCategories?: unknown[] }[];
      return c.json({ categories: Array.isArray(data) ? flatten(data) : [] });
    }

    return c.json({ categories: [], message: 'Bu pazaryeri için kategori API henüz desteklenmiyor.' });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Kategoriler alınamadı' }, 500);
  }
});

/** Kategori sil (soft delete) */
app.delete('/api/app-settings-category', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const category = c.req.query('category');
    if (!category?.trim()) return c.json({ error: 'category gerekli' }, 400);
    await c.env.DB.prepare(
      `UPDATE app_settings SET is_deleted = 1, updated_at = datetime('now') WHERE category = ?`
    ).bind(category.trim()).run();
    return c.json({ ok: true });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.get('/api/app-settings', async (c) => {
  try {
    if (!c.env.DB) {
      console.error('[AppSettings API] DB bulunamadı (c.env.DB yok)');
      return c.json({ error: 'DB bulunamadı' }, 500);
    }
    const category = c.req.query('category');
    if (!category) return c.json({ error: 'category gerekli' }, 400);

    const { results } = await c.env.DB.prepare(
      `SELECT key, value FROM app_settings WHERE category = ? AND is_deleted = 0 AND (status = 1 OR status IS NULL)`
    ).bind(category).all();

    const hiddenKeysByCategory: Record<string, Set<string>> = {
      parasut: new Set(['PARASUT_ACCESS_TOKEN', 'PARASUT_REFRESH_TOKEN', 'PARASUT_TOKEN_EXPIRES_AT']),
      ideasoft: new Set([
        'IDEASOFT_ACCESS_TOKEN',
        'IDEASOFT_REFRESH_TOKEN',
        'IDEASOFT_TOKEN_EXPIRES_AT',
        'ideasoft_oauth_pending',
        'ideasoft_category_mappings',
        'ideasoft_brand_mappings',
        'ideasoft_currency_mappings',
      ]),
    };
    const hidden = hiddenKeysByCategory[category] ?? new Set<string>();
    const settings: Record<string, string> = {};
    for (const r of results as { key: string; value: string | null }[]) {
      if (r.key && !hidden.has(r.key)) {
        settings[r.key] = r.value ?? '';
      }
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
      `SELECT key, value FROM app_settings WHERE category = ? AND is_deleted = 0 AND (status = 1 OR status IS NULL)`
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

// ========== ENTEGRASYON BAĞLANTI TESTİ ==========
app.post('/api/integrations/test/parasut', async (c) => {
  try {
    const body = await c.req.json<{
      api_url?: string; api_key?: string;
      PARASUT_CLIENT_ID?: string; PARASUT_CLIENT_SECRET?: string;
      PARASUT_USERNAME?: string; PARASUT_PASSWORD?: string;
    }>().catch(() => ({}));
    const apiUrl = (body.api_url || '').trim().replace(/\/+$/, '') || 'https://api.parasut.com';
    const base = apiUrl.startsWith('http') ? apiUrl : 'https://' + apiUrl;

    let token: string | null = null;
    if (body.api_key) {
      token = body.api_key.trim();
    } else if (body.PARASUT_CLIENT_ID && body.PARASUT_CLIENT_SECRET && body.PARASUT_USERNAME && body.PARASUT_PASSWORD) {
      const tokenRes = await fetch(`${base}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'password',
          client_id: body.PARASUT_CLIENT_ID,
          client_secret: body.PARASUT_CLIENT_SECRET,
          username: body.PARASUT_USERNAME,
          password: body.PARASUT_PASSWORD,
        }).toString(),
      });
      const tokenData = await tokenRes.json().catch(() => ({}));
      token = (tokenData as { access_token?: string }).access_token || null;
      if (!token) {
        const err = (tokenData as { error_description?: string; error?: string }).error_description
          || (tokenData as { error_description?: string; error?: string }).error
          || `Token alınamadı (HTTP ${tokenRes.status})`;
        return c.json({ ok: false, error: err }, 400);
      }
    }
    if (!token) return c.json({ ok: false, error: 'API Key veya OAuth bilgileri (Client ID, Secret, Kullanıcı, Şifre) gerekli' }, 400);

    const testUrl = `${base}/v4/companies`;
    const res = await fetch(testUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });
    if (res.ok) return c.json({ ok: true, message: 'Bağlantı başarılı' });
    const errText = await res.text();
    let errMsg = `HTTP ${res.status}`;
    try {
      const errJson = JSON.parse(errText) as { error?: string; message?: string };
      errMsg = errJson.error || errJson.message || errMsg;
    } catch { /* ignore */ }
    return c.json({ ok: false, error: errMsg }, 400);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: msg }, 500);
  }
});

/** Paraşüt API ürün listesi - app_settings parasut ayarları ile */
app.get('/api/parasut/products', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const auth = await getParasutAuth(c);
    if (!auth) return c.json({ error: 'Paraşüt ayarları eksik veya geçersiz. Ayarlar > Entegrasyonlar > Paraşüt bölümünü doldurun.' }, 400);

    const base = 'https://api.parasut.com';
    const filterName = (c.req.query('filter_name') || '').trim();
    const filterCode = (c.req.query('filter_code') || '').trim();
    const pageNum = Math.max(1, parseInt(c.req.query('page') || '1', 10));
    const pageSize = Math.min(25, Math.max(1, parseInt(c.req.query('limit') || '25', 10)));
    const sort = (c.req.query('sort') || '-id').trim();

    const params = new URLSearchParams();
    if (filterName) params.set('filter[name]', filterName);
    if (filterCode) params.set('filter[code]', filterCode);
    params.set('page[number]', String(pageNum));
    params.set('page[size]', String(pageSize));
    params.set('sort', sort);
    params.set('include', 'category');

    const res = await fetch(`${base}/v4/${auth.companyId}/products?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${auth.token}`,
        'Accept': 'application/json',
      },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = (json as { errors?: Array<{ detail?: string; title?: string }> }).errors?.[0]?.detail
        || (json as { errors?: Array<{ title?: string }> }).errors?.[0]?.title
        || (json as { error?: string }).error
        || `HTTP ${res.status}`;
      return c.json({ error: `Paraşüt API hatası: ${errMsg}` }, 400);
    }

    const rawList = (json as { data?: unknown }).data;
    const data: unknown[] = Array.isArray(rawList)
      ? rawList
      : rawList != null && typeof rawList === 'object'
        ? [rawList]
        : [];
    const meta = (json as { meta?: { total_count?: number; current_page?: number; total_pages?: number } }).meta ?? {};
    const included = (json as { included?: unknown[] }).included ?? [];

    return c.json({
      data: data.map((item: unknown) => {
        const d = item as { id?: string; type?: string; attributes?: Record<string, unknown>; relationships?: Record<string, { data?: { id?: string } | null }> };
        const attrs = (d.attributes ?? {}) as Record<string, unknown>;
        const catId = (d.relationships as Record<string, { data?: { id?: string } | null }> | undefined)?.category?.data?.id;
        if (catId) attrs.category_id = catId;
        return {
          id: d.id,
          type: d.type,
          ...attrs,
        };
      }),
      meta: {
        total: meta.total_count ?? data.length,
        page: meta.current_page ?? pageNum,
        total_pages: meta.total_pages ?? 1,
        per_page: pageSize,
      },
      included,
    });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Paraşüt ürünleri alınamadı' }, 500);
  }
});

/** Paraşüt app_settings'e token kaydet (upsert) */
async function saveParasutTokens(db: D1Database, accessToken: string, refreshToken: string, expiresIn: number): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = String(now + expiresIn);
  const upsert = async (key: string, value: string) => {
    const existing = await db.prepare(
      `SELECT id FROM app_settings WHERE category = 'parasut' AND "key" = ? AND is_deleted = 0`
    ).bind(key).first();
    if (existing) {
      await db.prepare(`UPDATE app_settings SET value = ?, updated_at = datetime('now') WHERE id = ?`)
        .bind(value, (existing as { id: number }).id).run();
    } else {
      await db.prepare(`INSERT INTO app_settings (category, "key", value) VALUES ('parasut', ?, ?)`)
        .bind(key, value).run();
    }
  };
  await upsert('PARASUT_ACCESS_TOKEN', accessToken);
  await upsert('PARASUT_REFRESH_TOKEN', refreshToken);
  await upsert('PARASUT_TOKEN_EXPIRES_AT', expiresAt);
}

/** Paraşüt ayarları ve token al. Önce cache/refresh_token dener, gerekirse password grant ile yeni token alır. */
async function getParasutAuth(c: { env: Bindings }): Promise<{ token: string; companyId: string } | null> {
  if (!c.env.DB) return null;
  const { results: settingsRows } = await c.env.DB.prepare(
    `SELECT key, value FROM app_settings WHERE category = 'parasut' AND is_deleted = 0 AND (status = 1 OR status IS NULL)`
  ).all();
  const settings: Record<string, string> = {};
  for (const r of settingsRows as { key: string; value: string | null }[]) {
    if (r.key) settings[r.key] = r.value ?? '';
  }
  const clientId = settings.PARASUT_CLIENT_ID?.trim();
  const clientSecret = settings.PARASUT_CLIENT_SECRET?.trim();
  const username = settings.PARASUT_USERNAME?.trim();
  const password = settings.PARASUT_PASSWORD?.trim();
  const companyId = settings.PARASUT_COMPANY_ID?.trim();
  if (!clientId || !clientSecret || !companyId) return null;
  if (!username || !password) return null;
  const base = 'https://api.parasut.com';
  const redirectUri = (settings.PARASUT_CALLBACK_URL?.trim() || 'urn:ietf:wg:oauth:2.0:oob');

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = parseInt(settings.PARASUT_TOKEN_EXPIRES_AT || '0', 10);
  const bufferSec = 300;
  if (expiresAt > now + bufferSec && settings.PARASUT_ACCESS_TOKEN?.trim()) {
    return { token: settings.PARASUT_ACCESS_TOKEN.trim(), companyId };
  }

  const refreshToken = settings.PARASUT_REFRESH_TOKEN?.trim();
  if (refreshToken) {
    const refreshRes = await fetch(`${base}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }).toString(),
    });
    const refreshData = await refreshRes.json().catch(() => ({}));
    const newToken = (refreshData as { access_token?: string }).access_token;
    const newRefresh = (refreshData as { refresh_token?: string }).refresh_token;
    const expiresIn = (refreshData as { expires_in?: number }).expires_in ?? 7200;
    if (newToken) {
      await saveParasutTokens(c.env.DB, newToken, newRefresh || refreshToken, expiresIn);
      return { token: newToken, companyId };
    }
  }

  const tokenRes = await fetch(`${base}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: clientId,
      client_secret: clientSecret,
      username,
      password,
      redirect_uri: redirectUri,
    }).toString(),
  });
  const tokenData = await tokenRes.json().catch(() => ({}));
  const token = (tokenData as { access_token?: string }).access_token;
  const refresh = (tokenData as { refresh_token?: string }).refresh_token;
  const expiresIn = (tokenData as { expires_in?: number }).expires_in ?? 7200;
  if (token && refresh) {
    await saveParasutTokens(c.env.DB, token, refresh, expiresIn);
  }
  return token && companyId ? { token, companyId } : null;
}

/** Paraşüt API kategori listesi - sadece ürün ve hizmet (Product) kategorileri, 3 level hiyerarşi */
app.get('/api/parasut/categories', async (c) => {
  try {
    const auth = await getParasutAuth(c);
    if (!auth) return c.json({ error: 'Paraşüt ayarları eksik veya geçersiz' }, 400);
    const base = 'https://api.parasut.com';
    const allData: { id: string; name?: string; parent_id?: number | null; full_path?: string; [k: string]: unknown }[] = [];
    const seenIds = new Set<string>();
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const params = new URLSearchParams();
      params.set('filter[category_type]', 'Product');
      params.set('page[number]', String(page));
      params.set('page[size]', '100');
      params.set('sort', 'name');
      params.set('include', 'parent_category');
      const res = await fetch(`${base}/v4/${auth.companyId}/item_categories?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${auth.token}`, 'Accept': 'application/json' },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = (json as { errors?: Array<{ detail?: string }> }).errors?.[0]?.detail || `HTTP ${res.status}`;
        return c.json({ error: `Paraşüt API: ${errMsg}` }, 400);
      }
      const data = (json as { data?: unknown[] }).data ?? [];
      const included = (json as { included?: unknown[] }).included ?? [];
      const meta = (json as { meta?: { total_pages?: number } }).meta ?? {};
      const pushItem = (item: { id?: string; attributes?: Record<string, unknown>; relationships?: Record<string, { data?: { id?: string } | null }> }) => {
        const attrs = item.attributes ?? {};
        const rels = item.relationships ?? {};
        let parentId = attrs.parent_id;
        if (parentId == null && rels.parent_category?.data?.id) {
          const pid = rels.parent_category.data.id;
          parentId = /^\d+$/.test(String(pid)) ? parseInt(String(pid), 10) : pid;
        }
        const normalizedParentId =
          parentId == null
            ? null
            : typeof parentId === 'number'
              ? parentId
              : /^\d+$/.test(String(parentId))
                ? parseInt(String(parentId), 10)
                : parentId;
        const idStr = String(item.id ?? '');
        if (seenIds.has(idStr)) return;
        seenIds.add(idStr);
        allData.push({
          ...attrs,
          id: idStr,
          name: attrs.name as string,
          parent_id: normalizedParentId,
          full_path: attrs.full_path as string,
        });
      };
      for (const item of included as { id?: string; type?: string; attributes?: Record<string, unknown>; relationships?: Record<string, { data?: { id?: string } | null }> }[]) {
        if (item.type === 'item_categories') pushItem(item);
      }
      for (const item of data as { id?: string; attributes?: Record<string, unknown>; relationships?: Record<string, { data?: { id?: string } | null }> }[]) {
        pushItem(item);
      }
      const totalPages = meta.total_pages ?? 1;
      hasMore = page < totalPages && data.length > 0;
      page += 1;
    }
    const byId = new Map<string, (typeof allData)[0]>();
    allData.forEach((d) => byId.set(String(d.id), d));
    const byParent = new Map<string, (typeof allData)[0][]>();
    const roots: (typeof allData)[0][] = [];
    allData.forEach((d) => {
      const pid = d.parent_id;
      const pidStr = pid != null && pid !== 0 ? String(pid) : null;
      const parentInData = pidStr ? byId.has(pidStr) : false;
      if (!pidStr || !parentInData) {
        roots.push(d);
      } else {
        if (!byParent.has(pidStr)) byParent.set(pidStr, []);
        byParent.get(pidStr)!.push(d);
      }
    });
    if (roots.length === 0 && allData.length > 0) {
      roots.push(...allData);
    }
    const getLevel = (item: (typeof allData)[0]): 1 | 2 | 3 => {
      const pid = item.parent_id;
      if (pid == null || pid === 0) return 1;
      const parent = byId.get(String(pid));
      if (!parent) return 1;
      const ppid = parent.parent_id;
      if (ppid == null || ppid === 0) return 2;
      const grandparent = byId.get(String(ppid));
      if (!grandparent) return 2;
      return 3;
    };
    const buildFullPath = (item: (typeof allData)[0]): string => {
      const parts: string[] = [];
      const seen = new Set<string>();
      let cur: (typeof allData)[0] | undefined = item;
      while (cur && seen.size < 10) {
        if (seen.has(String(cur.id))) break;
        seen.add(String(cur.id));
        const n = String(cur.name ?? '').trim() || (cur === item ? String(cur.id) : '');
        if (n) parts.unshift(n);
        const pid = cur.parent_id;
        cur = pid != null && pid !== 0 ? byId.get(String(pid)) : undefined;
      }
      return parts.join(' > ') || String(item.name ?? '') || String(item.id);
    };
    const hierarchical: (typeof allData)[0][] = [];
    const addInOrder = (items: (typeof allData)[0][], depth: number) => {
      items.sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')));
      items.forEach((d, idx) => {
        const level = getLevel(d) as 1 | 2 | 3;
        const children = byParent.get(String(d.id)) ?? [];
        const fullPath = buildFullPath(d);
        hierarchical.push({ ...d, full_path: fullPath, level, _depth: depth, _isLast: idx === items.length - 1 });
        if (children.length > 0) addInOrder(children, depth + 1);
      });
    };
    addInOrder(roots, 0);
    return c.json({ data: hierarchical });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Paraşüt kategorileri alınamadı' }, 500);
  }
});

/** Paraşüt kategori oluştur (ürün ve hizmet) */
app.post('/api/parasut/categories', async (c) => {
  try {
    const auth = await getParasutAuth(c);
    if (!auth) return c.json({ error: 'Paraşüt ayarları eksik veya geçersiz' }, 400);
    const body = await c.req.json<{ name: string; parent_id?: number | string | null }>().catch(() => ({}));
    const name = (body?.name ?? '').trim();
    if (!name) return c.json({ error: 'Kategori adı gerekli' }, 400);
    const base = 'https://api.parasut.com';
    const attrs: Record<string, unknown> = { name, category_type: 'Product' };
    const parentId = body?.parent_id;
    let relationships: Record<string, { data: { type: string; id: string } | null }> | undefined;
    if (parentId != null && parentId !== 0 && parentId !== '') {
      const pidStr = String(parentId).trim();
      if (pidStr) {
        const parsed = parseInt(pidStr, 10);
        attrs.parent_id = String(pidStr) === String(parsed) ? parsed : pidStr;
        relationships = {
          parent_category: { data: { type: 'item_categories', id: pidStr } },
        };
      }
    }
    const payload: { type: string; attributes: Record<string, unknown>; relationships?: Record<string, unknown> } = {
      type: 'item_categories',
      attributes: attrs,
    };
    if (relationships) payload.relationships = relationships;
    const res = await fetch(`${base}/v4/${auth.companyId}/item_categories`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${auth.token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ data: payload }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = (json as { errors?: Array<{ detail?: string }> }).errors?.[0]?.detail || `HTTP ${res.status}`;
      return c.json({ error: `Paraşüt: ${errMsg}` }, 400);
    }
    const created = json as { data?: { id?: string; attributes?: { name?: string } } };
    return c.json({ id: created.data?.id, name: created.data?.attributes?.name ?? name });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Oluşturma hatası' }, 500);
  }
});

/** Paraşüt kategori güncelle (isim) */
app.put('/api/parasut/categories/:id', async (c) => {
  try {
    const auth = await getParasutAuth(c);
    if (!auth) return c.json({ error: 'Paraşüt ayarları eksik veya geçersiz' }, 400);
    const id = c.req.param('id')?.trim();
    if (!id) return c.json({ error: 'Kategori ID gerekli' }, 400);
    const body = await c.req.json<{ name?: string }>().catch(() => ({}));
    const name = (body?.name ?? '').trim();
    if (!name) return c.json({ error: 'Kategori adı gerekli' }, 400);
    const base = 'https://api.parasut.com';
    const res = await fetch(`${base}/v4/${auth.companyId}/item_categories/${id}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${auth.token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        data: { id, type: 'item_categories', attributes: { name } },
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = (json as { errors?: Array<{ detail?: string }> }).errors?.[0]?.detail || `HTTP ${res.status}`;
      return c.json({ error: `Paraşüt: ${errMsg}` }, 400);
    }
    return c.json({ ok: true, message: 'Kategori güncellendi' });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Güncelleme hatası' }, 500);
  }
});

/** Paraşüt kategori eşleştirmeleri (master_id -> parasut_id) */
const PARASUT_CATEGORY_MAPPINGS_KEY = 'parasut_category_mappings';

app.get('/api/parasut/category-mappings', async (c) => {
  try {
    if (!c.env.DB) return c.json({ mappings: {} });
    const { results } = await c.env.DB.prepare(
      `SELECT value FROM app_settings WHERE category = 'parasut' AND "key" = ? AND is_deleted = 0 AND (status = 1 OR status IS NULL) LIMIT 1`
    ).bind(PARASUT_CATEGORY_MAPPINGS_KEY).all();
    const raw = (results as { value?: string }[])[0]?.value;
    if (!raw?.trim()) return c.json({ mappings: {} });
    const parsed = JSON.parse(raw) as Record<string, string>;
    return c.json({ mappings: typeof parsed === 'object' && parsed !== null ? parsed : {} });
  } catch {
    return c.json({ mappings: {} });
  }
});

app.put('/api/parasut/category-mappings', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req.json<{ mappings: Record<string, string> }>().catch(() => ({}));
    const mappings = body?.mappings;
    if (!mappings || typeof mappings !== 'object') return c.json({ error: 'mappings gerekli' }, 400);
    const toSave = Object.fromEntries(
      Object.entries(mappings).filter(([k, v]) => k && v && String(k).trim() && String(v).trim())
    );
    const existing = await c.env.DB.prepare(
      `SELECT id FROM app_settings WHERE category = 'parasut' AND "key" = ? AND is_deleted = 0 LIMIT 1`
    ).bind(PARASUT_CATEGORY_MAPPINGS_KEY).first();
    if (existing) {
      await c.env.DB.prepare(
        `UPDATE app_settings SET value = ?, updated_at = datetime('now') WHERE category = 'parasut' AND "key" = ? AND is_deleted = 0`
      ).bind(JSON.stringify(toSave), PARASUT_CATEGORY_MAPPINGS_KEY).run();
    } else {
      await c.env.DB.prepare(
        `INSERT INTO app_settings (category, "key", value) VALUES ('parasut', ?, ?)`
      ).bind(PARASUT_CATEGORY_MAPPINGS_KEY, JSON.stringify(toSave)).run();
    }
    return c.json({ ok: true, mappings: toSave });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Kaydetme hatası' }, 500);
  }
});

/** Paraşüt marka eşleştirmeleri (master_brand_id -> parasut_manufacturer_id) */
const PARASUT_BRAND_MAPPINGS_KEY = 'parasut_brand_mappings';

app.get('/api/parasut/brand-mappings', async (c) => {
  try {
    if (!c.env.DB) return c.json({ mappings: {} });
    const { results } = await c.env.DB.prepare(
      `SELECT value FROM app_settings WHERE category = 'parasut' AND "key" = ? AND is_deleted = 0 AND (status = 1 OR status IS NULL) LIMIT 1`
    ).bind(PARASUT_BRAND_MAPPINGS_KEY).all();
    const raw = (results as { value?: string }[])[0]?.value;
    if (!raw?.trim()) return c.json({ mappings: {} });
    const parsed = JSON.parse(raw) as Record<string, string>;
    return c.json({ mappings: typeof parsed === 'object' && parsed !== null ? parsed : {} });
  } catch {
    return c.json({ mappings: {} });
  }
});

app.put('/api/parasut/brand-mappings', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req.json<{ mappings: Record<string, string> }>().catch(() => ({}));
    const mappings = body?.mappings;
    if (!mappings || typeof mappings !== 'object') return c.json({ error: 'mappings gerekli' }, 400);
    const toSave = Object.fromEntries(
      Object.entries(mappings).filter(([k, v]) => k && v && String(k).trim() && String(v).trim())
    );
    const existing = await c.env.DB.prepare(
      `SELECT id FROM app_settings WHERE category = 'parasut' AND "key" = ? AND is_deleted = 0 LIMIT 1`
    ).bind(PARASUT_BRAND_MAPPINGS_KEY).first();
    if (existing) {
      await c.env.DB.prepare(
        `UPDATE app_settings SET value = ?, updated_at = datetime('now') WHERE category = 'parasut' AND "key" = ? AND is_deleted = 0`
      ).bind(JSON.stringify(toSave), PARASUT_BRAND_MAPPINGS_KEY).run();
    } else {
      await c.env.DB.prepare(
        `INSERT INTO app_settings (category, "key", value) VALUES ('parasut', ?, ?)`
      ).bind(PARASUT_BRAND_MAPPINGS_KEY, JSON.stringify(toSave)).run();
    }
    return c.json({ ok: true, mappings: toSave });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Kaydetme hatası' }, 500);
  }
});

/** Paraşüt e-ticaret üretici/marka listesi - ecommerce_manufacturers veya products include=manufacturer */
app.get('/api/parasut/manufacturers', async (c) => {
  try {
    const auth = await getParasutAuth(c);
    if (!auth) return c.json({ error: 'Paraşüt ayarları eksik veya geçersiz' }, 400);
    const base = 'https://api.parasut.com';
    const allData: { id: string; name?: string }[] = [];
    const seenIds = new Set<string>();

    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const params = new URLSearchParams();
      params.set('page[number]', String(page));
      params.set('page[size]', '100');
      params.set('sort', 'name');
      const res = await fetch(`${base}/v4/${auth.companyId}/ecommerce_manufacturers?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${auth.token}`, 'Accept': 'application/json' },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 404 || res.status === 422) break;
        const errMsg = (json as { errors?: Array<{ detail?: string }> }).errors?.[0]?.detail || `HTTP ${res.status}`;
        return c.json({ error: `Paraşüt API: ${errMsg}` }, 400);
      }
      const data = (json as { data?: unknown[] }).data ?? [];
      const meta = (json as { meta?: { total_pages?: number } }).meta ?? {};
      for (const item of data as { id?: string; attributes?: Record<string, unknown> }[]) {
        const idStr = String(item.id ?? '');
        if (seenIds.has(idStr)) continue;
        seenIds.add(idStr);
        const attrs = item.attributes ?? {};
        allData.push({ id: idStr, name: (attrs.name as string) ?? idStr });
      }
      const totalPages = meta.total_pages ?? 1;
      hasMore = page < totalPages && data.length > 0;
      page += 1;
    }

    if (allData.length === 0) {
      const prodParams = new URLSearchParams();
      prodParams.set('page[number]', '1');
      prodParams.set('page[size]', '100');
      prodParams.set('include', 'manufacturer');
      const prodRes = await fetch(`${base}/v4/${auth.companyId}/products?${prodParams.toString()}`, {
        headers: { 'Authorization': `Bearer ${auth.token}`, 'Accept': 'application/json' },
      });
      const prodJson = await prodRes.json().catch(() => ({}));
      if (prodRes.ok) {
        const included = (prodJson as { included?: { id?: string; type?: string; attributes?: Record<string, unknown> }[] }).included ?? [];
        for (const item of included) {
          if (item.type === 'ecommerce_manufacturers' || item.type === 'manufacturers') {
            const idStr = String(item.id ?? '');
            if (seenIds.has(idStr)) continue;
            seenIds.add(idStr);
            const name = (item.attributes?.name as string) ?? idStr;
            allData.push({ id: idStr, name });
          }
        }
      }
    }

    allData.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
    return c.json({ data: allData });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Paraşüt markaları alınamadı' }, 500);
  }
});

/** Paraşüt ürün kodları (products listesi eşleşme göstergesi için) */
app.get('/api/parasut/product-codes', async (c) => {
  try {
    const auth = await getParasutAuth(c);
    if (!auth) return c.json({ codes: [] });
    const maxCodes = Math.min(10000, Math.max(1, parseInt(c.req.query('limit') || '5000', 10)));
    const codes: string[] = [];
    const base = 'https://api.parasut.com';
    let page = 1;
    let hasMore = true;
    while (hasMore && codes.length < maxCodes) {
      const params = new URLSearchParams();
      params.set('page[number]', String(page));
      params.set('page[size]', '100');
      params.set('sort', '-id');
      const res = await fetch(`${base}/v4/${auth.companyId}/products?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${auth.token}`, 'Accept': 'application/json' },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) break;
      const data = (json as { data?: unknown[] }).data ?? [];
      const meta = (json as { meta?: { total_pages?: number } }).meta ?? {};
      for (const item of data as { attributes?: { code?: string } }[]) {
        const code = item?.attributes?.code;
        if (code != null && String(code).trim()) codes.push(String(code).trim());
      }
      const totalPages = meta.total_pages ?? 1;
      hasMore = page < totalPages && data.length > 0;
      page += 1;
    }
    return c.json({ codes });
  } catch (err: unknown) {
    return c.json({ codes: [] });
  }
});

/** Paraşüt ürününü master olarak ekle + Paraşüt'te güncelle (isim, kod, kategori) */
app.post('/api/parasut/products/:id/add-as-master', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const parasutId = c.req.param('id')?.trim();
    if (!parasutId) return c.json({ error: 'Ürün ID gerekli' }, 400);

    const body = await c.req.json<{
      name: string;
      sku?: string;
      category_id?: number | null;
      brand_id?: number | null;
      type_id?: number | null;
      barcode?: string;
      price?: number;
      quantity?: number;
      tax_rate?: number;
      unit_id?: number | null;
      currency_id?: number | null;
      supplier_code?: string;
      gtip_code?: string;
      image?: string | null;
    }>().catch(() => ({}));

    const name = (body?.name ?? '').trim();
    if (!name) return c.json({ error: 'Ürün adı zorunludur' }, 400);

    const auth = await getParasutAuth(c);
    if (!auth) return c.json({ error: 'Paraşüt ayarları eksik veya geçersiz' }, 400);

    const sku = body?.sku != null ? String(body.sku).trim() : null;
    const categoryId = body?.category_id != null && body.category_id > 0 ? body.category_id : null;

    let parasutCategoryId: string | undefined;
    if (categoryId) {
      const { results: mapRows } = await c.env.DB.prepare(
        `SELECT value FROM app_settings WHERE category = 'parasut' AND "key" = ? AND is_deleted = 0 LIMIT 1`
      ).bind(PARASUT_CATEGORY_MAPPINGS_KEY).all();
      const raw = (mapRows as { value?: string }[])[0]?.value;
      const mappings = (raw ? JSON.parse(raw) : {}) as Record<string, string>;
      parasutCategoryId = mappings[String(categoryId)];
      if (!parasutCategoryId) {
        return c.json({ error: 'Seçilen kategori Paraşüt\'te eşleşmemiş. Önce Paraşüt Kategoriler sayfasından kategori eşleştirmesi yapın.' }, 400);
      }
    }

    const nextSort = await c.env.DB.prepare(`SELECT COALESCE(MAX(sort_order), 0) + 1 as n FROM products`).first();
    const sortOrder = (nextSort as { n: number } | null)?.n ?? 1;

    const price = typeof body?.price === 'number' ? body.price : (body?.price != null ? parseFloat(String(body.price)) || 0 : 0);
    const quantity = typeof body?.quantity === 'number' ? body.quantity : (body?.quantity != null ? parseFloat(String(body.quantity)) || 0 : 0);
    const taxRate = body?.tax_rate != null ? (typeof body.tax_rate === 'number' ? body.tax_rate : parseFloat(String(body.tax_rate)) ?? 0) : 0;
    const barcode = body?.barcode != null ? String(body.barcode).trim() || null : null;
    const supplierCode = body?.supplier_code != null ? String(body.supplier_code).trim() || null : null;
    const gtipCode = body?.gtip_code != null ? String(body.gtip_code).trim() || null : null;

    const brandId = body?.brand_id != null && body.brand_id > 0 ? body.brand_id : null;
    const typeId = body?.type_id != null && body.type_id > 0 ? body.type_id : null;
    const image = body?.image != null && String(body.image).trim() ? String(body.image).trim() : null;
    await c.env.DB.prepare(
      `INSERT INTO products (name, sku, barcode, brand_id, category_id, type_id, price, quantity, tax_rate, unit_id, currency_id, supplier_code, gtip_code, image, sort_order, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    ).bind(name, sku ?? '', barcode ?? '', brandId, categoryId, typeId, price, quantity, taxRate, body?.unit_id ?? null, body?.currency_id ?? null, supplierCode ?? '', gtipCode ?? '', image, sortOrder).run();

    const inserted = await c.env.DB.prepare(`SELECT id FROM products WHERE id = last_insert_rowid()`).first();
    const productId = (inserted as { id: number } | null)?.id;
    if (!productId) return c.json({ error: 'Ürün oluşturulamadı' }, 500);

    const parseImageToFirstPath = (img: unknown): string | null => {
      if (!img || typeof img !== 'string') return null;
      const t = img.trim();
      if (!t || t === '[]') return null;
      try {
        const parsed = JSON.parse(t);
        if (Array.isArray(parsed)) {
          const first = parsed.find((x: unknown): x is string => typeof x === 'string' && !!x.trim());
          return first?.trim() ?? null;
        }
        return t;
      } catch {
        return t;
      }
    };
    const attrs: Record<string, unknown> = { name, code: sku ?? '' };
    const imagePath = parseImageToFirstPath(image);
    if (imagePath) {
      const photoUrl = await storagePathToDataUrl(c.env.STORAGE, imagePath);
      if (photoUrl) attrs.photo = photoUrl;
    }

    const payload: { id: string; type: string; attributes: Record<string, unknown>; relationships?: Record<string, unknown> } = {
      id: parasutId,
      type: 'products',
      attributes: attrs,
    };
    if (parasutCategoryId) {
      payload.relationships = { category: { data: { type: 'item_categories', id: parasutCategoryId } } };
    }

    const base = 'https://api.parasut.com';
    const updateRes = await fetch(`${base}/v4/${auth.companyId}/products/${parasutId}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${auth.token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ data: payload }),
    });
    const updateJson = await updateRes.json().catch(() => ({}));
    if (!updateRes.ok) {
      const errMsg = (updateJson as { errors?: Array<{ detail?: string }> }).errors?.[0]?.detail || `HTTP ${updateRes.status}`;
      return c.json({ error: `Master ürün oluşturuldu ancak Paraşüt güncellenemedi: ${errMsg}` }, 400);
    }

    return c.json({ ok: true, product_id: productId, message: 'Master ürün oluşturuldu ve Paraşüt güncellendi' });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'İşlem hatası' }, 500);
  }
});

/** Paraşüt → Master çek */
app.post('/api/parasut/products/:id/pull', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const parasutId = c.req.param('id');
    const body = await c.req.json<{
      selected_fields?: Array<{ parasut: string; master: string }>;
      override_values?: Record<string, string | number>;
    }>().catch(() => ({}));
    const selected = body?.selected_fields ?? [];
    const override = body?.override_values ?? {};
    if (selected.length === 0) return c.json({ error: 'En az bir alan seçin' }, 400);

    const auth = await getParasutAuth(c);
    if (!auth) return c.json({ error: 'Paraşüt ayarları eksik veya geçersiz' }, 400);

    const res = await fetch(`https://api.parasut.com/v4/${auth.companyId}/products/${parasutId}`, {
      headers: { 'Authorization': `Bearer ${auth.token}`, 'Accept': 'application/json' },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = (json as { errors?: Array<{ detail?: string }> }).errors?.[0]?.detail || `HTTP ${res.status}`;
      return c.json({ error: `Paraşüt: ${errMsg}` }, 400);
    }
    const attrs = (json as { data?: { attributes?: Record<string, unknown> } }).data?.attributes ?? {};
    const p = attrs as Record<string, unknown>;

    const mapVal = (parasutKey: string, masterKey: string): string | number | null => {
      const ov = override[masterKey];
      if (ov !== undefined && ov !== null && ov !== '') {
        if (typeof ov === 'number') return ov;
        return String(ov).trim() || null;
      }
      const v = p[parasutKey];
      if (v == null) return null;
      if (typeof v === 'number') return v;
      return String(v).trim() || null;
    };

    let name = '';
    let sku: string | null = null;
    let barcode: string | null = null;
    let price = 0;
    let quantity = 0;
    let tax_rate: number | null = null;
    let unit_id: number | null = null;
    let currency_id: number | null = null;
    let supplier_code: string | null = null;
    let gtip_code: string | null = null;

    for (const { parasut, master } of selected) {
      const val = mapVal(parasut, master);
      if (val === null && typeof val !== 'number') continue;
      if (master === 'name') name = String(val ?? '');
      else if (master === 'sku') sku = val != null ? String(val) : null;
      else if (master === 'barcode') barcode = val != null ? String(val) : null;
      else if (master === 'price') price = typeof val === 'number' ? val : parseFloat(String(val)) || 0;
      else if (master === 'quantity') quantity = typeof val === 'number' ? val : parseFloat(String(val)) || 0;
      else if (master === 'tax_rate') tax_rate = typeof val === 'number' ? val : parseFloat(String(val)) ?? null;
      else if (master === 'supplier_code') supplier_code = val != null ? String(val) : null;
      else if (master === 'gtip_code') gtip_code = val != null ? String(val) : null;
      else if (master === 'unit_id' && val != null) {
        const code = String(val).toUpperCase().slice(0, 20);
        const u = await c.env.DB.prepare(`SELECT id FROM product_unit WHERE (UPPER(TRIM(code)) = ? OR UPPER(TRIM(name)) = ?) AND is_deleted = 0 LIMIT 1`).bind(code, code).first();
        unit_id = (u as { id: number } | null)?.id ?? null;
      } else if (master === 'currency_id' && val != null) {
        const code = String(val).toUpperCase().replace(/^TL$/, 'TRY').slice(0, 10);
        const cur = await c.env.DB.prepare(`SELECT id FROM product_currencies WHERE UPPER(TRIM(code)) = ? AND is_deleted = 0 LIMIT 1`).bind(code).first();
        currency_id = (cur as { id: number } | null)?.id ?? null;
      }
    }

    if (!name.trim()) name = (attrs.name as string) || (attrs.code as string) || 'Ürün';

    const existing = sku && String(sku).trim() ? await c.env.DB.prepare(
      `SELECT id FROM products WHERE TRIM(COALESCE(sku, '')) = ? AND is_deleted = 0 LIMIT 1`
    ).bind(String(sku).trim()).first() : null;

    if (existing) {
      const updates: string[] = ['name = ?', 'updated_at = datetime(\'now\')'];
      const vals: (string | number | null)[] = [name];
      const masterSet = new Set(selected.map((s) => s.master));
      if (masterSet.has('sku')) { updates.push('sku = ?'); vals.push(sku); }
      if (masterSet.has('barcode')) { updates.push('barcode = ?'); vals.push(barcode); }
      if (masterSet.has('price')) { updates.push('price = ?'); vals.push(price); }
      if (masterSet.has('quantity')) { updates.push('quantity = ?'); vals.push(quantity); }
      if (masterSet.has('tax_rate')) { updates.push('tax_rate = ?'); vals.push(tax_rate ?? 0); }
      if (masterSet.has('unit_id')) { updates.push('unit_id = ?'); vals.push(unit_id); }
      if (masterSet.has('currency_id')) { updates.push('currency_id = ?'); vals.push(currency_id); }
      if (masterSet.has('supplier_code')) { updates.push('supplier_code = ?'); vals.push(supplier_code); }
      if (masterSet.has('gtip_code')) { updates.push('gtip_code = ?'); vals.push(gtip_code); }
      vals.push((existing as { id: number }).id);
      await c.env.DB.prepare(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`).bind(...vals).run();
      return c.json({ ok: true, product_id: (existing as { id: number }).id, action: 'updated' });
    }

    const nextSort = await c.env.DB.prepare(`SELECT COALESCE(MAX(sort_order), 0) + 1 as n FROM products`).first();
    const sortOrder = (nextSort as { n: number } | null)?.n ?? 1;
    await c.env.DB.prepare(
      `INSERT INTO products (name, sku, barcode, price, quantity, tax_rate, unit_id, currency_id, supplier_code, gtip_code, sort_order, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    ).bind(name, sku ?? '', barcode ?? '', price, quantity, tax_rate ?? 0, unit_id, currency_id, supplier_code ?? '', gtip_code ?? '', sortOrder).run();
    const inserted = await c.env.DB.prepare(`SELECT id FROM products WHERE id = last_insert_rowid()`).first();
    return c.json({ ok: true, product_id: (inserted as { id: number }).id, action: 'created' });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Çekme hatası' }, 500);
  }
});

const PARASUT_PRODUCT_MAPPINGS_KEY = 'product_mappings';

type ParasutPushSelected = { parasut: string; master: string };

type ProductRowForParasutPush = {
  id: number; name: string; sku: string | null; barcode: string | null; price: number; quantity: number;
  tax_rate: number | null; unit_id: number | null; currency_id: number | null; supplier_code: string | null; gtip_code: string | null; image: string | null;
  category_id: number | null;
  unit_code: string | null; currency_code: string | null;
};

function parseProductImageToFirstPath(img: unknown): string | null {
  return parseProductImageToAllPaths(img)[0] ?? null;
}

function parseProductImageToAllPaths(img: unknown): string[] {
  if (!img || typeof img !== 'string') return [];
  const t = img.trim();
  if (!t || t === '[]') return [];
  const out: string[] = [];
  const pushPath = (v: unknown) => {
    if (typeof v !== 'string') return;
    const p = v.trim();
    if (!p) return;
    if (!out.includes(p)) out.push(p);
  };
  try {
    const parsed = JSON.parse(t);
    if (Array.isArray(parsed)) {
      for (const p of parsed) pushPath(p);
      return out;
    }
  } catch {
    // ignore and treat as raw string path below
  }
  pushPath(t);
  return out;
}

async function urlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) return null;
    const ct = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim() || 'image/jpeg';
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    const chunk = 8192;
    for (let i = 0; i < bytes.length; i += chunk) {
      const slice = bytes.subarray(i, i + chunk);
      binary += String.fromCharCode.apply(null, Array.from(slice));
    }
    return `data:${ct};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

function filenameFromImagePath(path: string, sortOrder: number): string {
  const clean = path.split('?')[0].split('#')[0];
  const decoded = (() => {
    try { return decodeURIComponent(clean); } catch { return clean; }
  })();
  const leaf = decoded.split('/').filter(Boolean).pop() || '';
  const safeLeaf = leaf.replace(/[^a-zA-Z0-9._-]/g, '-');
  if (safeLeaf && /\.[a-zA-Z0-9]{2,5}$/.test(safeLeaf)) return safeLeaf;
  if (safeLeaf) return `${safeLeaf}.jpg`;
  return `product-image-${sortOrder}.jpg`;
}

async function buildIdeasoftImageUploads(
  storage: R2Bucket | undefined,
  rawImage: unknown,
  publicApiBase: string,
  opts?: { maxImages?: number; maxDataUrlChars?: number }
): Promise<{ images: Array<{ dataUrl: string; sourceUrl?: string; filename: string; sortOrder: number }>; warnings: string[] }> {
  const maxImages = Math.max(1, opts?.maxImages ?? 20);
  const maxDataUrlChars = Math.max(100_000, opts?.maxDataUrlChars ?? 5_000_000);
  const paths = parseProductImageToAllPaths(rawImage);
  const warnings: string[] = [];
  if (paths.length === 0) return { images: [], warnings };
  if (paths.length > maxImages) {
    warnings.push(`Görsel sayısı ${paths.length}; ilk ${maxImages} görsel aktarıldı.`);
  }
  const images: Array<{ dataUrl: string; filename: string; sortOrder: number }> = [];
  const limited = paths.slice(0, maxImages);
  for (let i = 0; i < limited.length; i++) {
    const sortOrder = i + 1;
    const p = limited[i];
    const sourceUrl = p.startsWith('http://') || p.startsWith('https://')
      ? p
      : `${publicApiBase.replace(/\/+$/, '')}/storage/serve?key=${encodeURIComponent(p)}`;
    const initial = await storagePathToDataUrl(storage, p);
    const dataUrl = initial?.startsWith('http://') || initial?.startsWith('https://')
      ? await urlToDataUrl(initial)
      : initial;
    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
      warnings.push(`Görsel ${sortOrder} okunamadı: ${p}`);
      continue;
    }
    if (!ideasoftDataUrlBase64PayloadNonEmpty(dataUrl)) {
      warnings.push(`Görsel ${sortOrder} boş veya geçersiz dosya (0 bayt); atlandı.`);
      continue;
    }
    if (dataUrl.length > maxDataUrlChars) {
      warnings.push(`Görsel ${sortOrder} çok büyük olduğu için atlandı.`);
      continue;
    }
    images.push({
      dataUrl,
      sourceUrl,
      filename: filenameFromImagePath(p, sortOrder),
      sortOrder,
    });
  }
  return { images, warnings };
}

function isEmptyParasutVal(v: unknown): boolean {
  return v == null || (typeof v === 'string' && !v.trim());
}

/** Master satırı + alan kurallarından Paraşüt PUT attributes nesnesi üretir */
async function buildParasutPushAttributes(
  storage: R2Bucket | undefined,
  productRow: ProductRowForParasutPush,
  selected: ParasutPushSelected[],
  opts?: { skipPhoto?: boolean },
): Promise<Record<string, unknown>> {
  const skipPhoto = !!opts?.skipPhoto;
  const attrs: Record<string, unknown> = { name: productRow.name };
  if (!isEmptyParasutVal(productRow.sku)) attrs.code = productRow.sku!.trim();
  if (!skipPhoto) {
    const imagePath = parseProductImageToFirstPath(productRow.image);
    if (imagePath) {
      const photoUrl = await storagePathToDataUrl(storage, imagePath);
      if (photoUrl) attrs.photo = photoUrl;
    }
  }

  for (const { parasut, master } of selected) {
    if (master === 'name') attrs.name = productRow.name;
    else if (master === 'sku' && !isEmptyParasutVal(productRow.sku)) attrs.code = productRow.sku!.trim();
    else if (master === 'barcode' && !isEmptyParasutVal(productRow.barcode)) attrs.barcode = productRow.barcode!.trim();
    else if (master === 'price') attrs.list_price = productRow.price;
    else if (master === 'quantity' && parasut?.trim()) {
      const q = Number(productRow.quantity);
      const n = Number.isFinite(q) ? Math.round(q) : 0;
      attrs[parasut.trim()] = n;
    }
    else if (master === 'tax_rate') attrs.vat_rate = productRow.tax_rate ?? 0;
    else if (master === 'supplier_code' && !isEmptyParasutVal(productRow.supplier_code)) attrs.supplier_code = productRow.supplier_code!.trim();
    else if (master === 'gtip_code' && !isEmptyParasutVal(productRow.gtip_code)) attrs.gtip = productRow.gtip_code!.trim();
    else if (master === 'unit_id' && !isEmptyParasutVal(productRow.unit_code)) attrs.unit = productRow.unit_code!.trim();
    else if (master === 'currency_id') attrs.currency = (productRow.currency_code || 'TRY').toUpperCase();
    else if (master === 'image' && !skipPhoto) {
      const path = parseProductImageToFirstPath(productRow.image);
      if (path) {
        const photoUrl = await storagePathToDataUrl(storage, path);
        if (photoUrl) attrs[parasut] = photoUrl;
      }
    }
  }
  return attrs;
}

/** Paraşüt alt isteğinde gövde limiti / zaman aşımı riski — aşırı büyük data URL kaldırılır */
function stripOversizedParasutPhoto(attrs: Record<string, unknown>, maxChars = 450_000): void {
  const p = attrs.photo;
  if (typeof p === 'string' && p.length > maxChars) delete attrs.photo;
}

/** POST create: stok alanı stock_count ise initial_stock_count olmalı (Paraşüt şeması) */
function prepareAttrsForParasutProductCreate(attrs: Record<string, unknown>): Record<string, unknown> {
  const out = { ...attrs };
  if (Object.prototype.hasOwnProperty.call(out, 'stock_count')) {
    const sc = out.stock_count;
    const n = typeof sc === 'number' ? sc : parseFloat(String(sc).replace(',', '.'));
    if (Number.isFinite(n) && !Object.prototype.hasOwnProperty.call(out, 'initial_stock_count')) {
      out.initial_stock_count = Math.round(n);
    }
    delete out.stock_count;
  }
  return out;
}

/** Paraşüt ürün attributes içinde yalnızca API'nin kabul ettiği yazılabilir alanlar (supplier_code vb. reddedilir) */
const PARASUT_PRODUCT_WRITABLE_ATTR_KEYS = new Set([
  'name', 'code', 'list_price', 'currency', 'buying_price', 'buying_currency',
  'unit', 'vat_rate', 'barcode', 'gtip', 'photo', 'initial_stock_count',
  // stock_count: ProductAttributes şemasında read-only; PUT ile göndermek 400 üretir (stok depo/inventory API)
  'inventory_tracking', 'archived',
  'sales_excise_duty', 'sales_excise_duty_type', 'purchase_excise_duty', 'purchase_excise_duty_type',
  'communications_tax_rate',
]);

function pickWritableParasutProductAttributes(attrs: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (!PARASUT_PRODUCT_WRITABLE_ATTR_KEYS.has(k)) continue;
    if (v === undefined) continue;
    if (v === null) continue;
    if (typeof v === 'string' && v.trim() === '' && k !== 'name' && k !== 'code') continue;
    out[k] = v;
  }
  return out;
}

/** PUT 400/422 iken sırayla çıkarılacak alanlar (en sık sorun çıkaranlar önce); name hiç çıkarılmaz */
const PARASUT_PUT_RETRY_STRIP_ORDER: readonly string[] = [
  'gtip',
  'barcode',
  'unit',
  'photo',
  'code',
  'inventory_tracking',
  'archived',
  'communications_tax_rate',
  'sales_excise_duty',
  'sales_excise_duty_type',
  'purchase_excise_duty',
  'purchase_excise_duty_type',
  'vat_rate',
  'currency',
  'list_price',
  'buying_price',
  'buying_currency',
];

function parasutApiErrorMessage(json: unknown, httpStatus: number): string {
  if (json && typeof json === 'object' && json !== null) {
    const top = json as { error?: unknown; message?: unknown };
    if (typeof top.error === 'string' && top.error.trim()) return top.error.trim();
    if (typeof top.message === 'string' && top.message.trim()) return top.message.trim();
  }
  const j = json as { errors?: Array<{ detail?: unknown; title?: string; code?: string }> };
  const errs = j?.errors;
  if (Array.isArray(errs) && errs.length > 0) {
    const parts = errs.map((e) => {
      const d = e.detail;
      if (typeof d === 'string' && d.trim()) return d.trim();
      if (d != null && typeof d === 'object') {
        try {
          return JSON.stringify(d);
        } catch {
          return String(d);
        }
      }
      return (e.title || e.code || '').trim();
    }).filter(Boolean);
    if (parts.length > 0) return parts.join(' — ');
  }
  if (json && typeof json === 'object' && json !== null) {
    try {
      const s = JSON.stringify(json);
      if (s && s !== '{}' && s.length < 800) return s;
    } catch { /* ignore */ }
  }
  return `HTTP ${httpStatus}`;
}

/** Paraşüt gtip alanı sayısal formatta; harf/ayraçlı değerler 400 üretebilir */
function normalizeParasutGtipInAttributes(attrs: Record<string, unknown>): void {
  if (!Object.prototype.hasOwnProperty.call(attrs, 'gtip')) return;
  const raw = attrs.gtip;
  const s = raw != null ? String(raw).trim() : '';
  if (!s) {
    delete attrs.gtip;
    return;
  }
  const digits = s.replace(/\D/g, '');
  if (digits.length >= 8 && digits.length <= 14) {
    attrs.gtip = digits;
    return;
  }
  if (digits.length > 0) {
    attrs.gtip = digits;
    return;
  }
  delete attrs.gtip;
}

/** Güncelleme öncesi: Paraşüt'teki kayıt (alış fiyatı vb. PUT'ta zorunlu olabiliyor) */
async function fetchParasutProductAttributes(
  base: string,
  companyId: string,
  token: string,
  parasutId: string,
): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${base}/v4/${companyId}/products/${encodeURIComponent(parasutId)}`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
  });
  if (!res.ok) return null;
  const j = await res.json().catch(() => ({}));
  const attrs = (j as { data?: { attributes?: Record<string, unknown> } }).data?.attributes;
  return attrs && typeof attrs === 'object' ? attrs : null;
}

/** PUT gövdesine: uzaktaki alış fiyatı / döviz (göndermezsek Paraşüt reddedebilir) */
function mergeParasutUpdateAttrsWithExistingRemote(
  updateAttrs: Record<string, unknown>,
  remote: Record<string, unknown> | null,
): void {
  if (!remote) return;
  const pickRemote = (k: string) => {
    if (Object.prototype.hasOwnProperty.call(updateAttrs, k)) return;
    const v = remote[k];
    if (v === undefined || v === null) return;
    if (typeof v === 'string' && !v.trim() && k !== 'name' && k !== 'code') return;
    updateAttrs[k] = v;
  };
  pickRemote('buying_price');
  pickRemote('buying_currency');
  pickRemote('inventory_tracking');
}

/** Hâlâ eksikse satış fiyatı / para birimi ile doldur (create ile aynı mantık) */
function applyParasutUpdateBuyingDefaults(attrs: Record<string, unknown>): void {
  const listRaw = attrs.list_price;
  const listNum = typeof listRaw === 'number' && Number.isFinite(listRaw)
    ? listRaw
    : parseFloat(String(listRaw ?? '').replace(',', '.'));
  if (!Object.prototype.hasOwnProperty.call(attrs, 'buying_price') && Number.isFinite(listNum)) {
    attrs.buying_price = listNum;
  }
  const cur = attrs.currency != null ? String(attrs.currency).trim().toUpperCase() : '';
  if (cur && !Object.prototype.hasOwnProperty.call(attrs, 'buying_currency')) {
    attrs.buying_currency = cur;
  }
}

/** Yeni ürün: Paraşüt çoğu hesapta alış fiyatı / para birimi bekler */
function applyParasutCreateDefaults(attrs: Record<string, unknown>): void {
  const listRaw = attrs.list_price;
  const listNum = typeof listRaw === 'number' && Number.isFinite(listRaw)
    ? listRaw
    : parseFloat(String(listRaw ?? '0').replace(',', '.')) || 0;
  attrs.list_price = listNum;
  const buyRaw = attrs.buying_price;
  const buyNum = typeof buyRaw === 'number' && Number.isFinite(buyRaw)
    ? buyRaw
    : parseFloat(String(buyRaw ?? '').replace(',', '.'));
  attrs.buying_price = Number.isFinite(buyNum) ? buyNum : listNum;
  const cur = attrs.currency != null ? String(attrs.currency).trim().toUpperCase() : '';
  attrs.currency = cur || 'TRY';
  const bcur = attrs.buying_currency != null ? String(attrs.buying_currency).trim().toUpperCase() : '';
  attrs.buying_currency = bcur || (attrs.currency as string) || 'TRY';
  if (attrs.vat_rate == null || attrs.vat_rate === '') {
    attrs.vat_rate = 0;
  } else if (typeof attrs.vat_rate === 'string') {
    const vr = parseFloat(String(attrs.vat_rate).replace(',', '.'));
    attrs.vat_rate = Number.isFinite(vr) ? vr : 0;
  }
  if (attrs.initial_stock_count != null && typeof attrs.initial_stock_count === 'string') {
    const q = parseFloat(String(attrs.initial_stock_count).replace(',', '.'));
    attrs.initial_stock_count = Number.isFinite(q) ? Math.round(q) : 0;
  }
}

function mergeParasutAttributeOverrides(
  attrs: Record<string, unknown>,
  overrides: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!overrides || typeof overrides !== 'object') return attrs;
  const numericKeys = new Set(['list_price', 'buying_price', 'vat_rate', 'stock_count', 'initial_stock_count']);
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) continue;
    if (v === null || v === '') {
      delete attrs[k];
      continue;
    }
    if (numericKeys.has(k)) {
      const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
      if (!Number.isNaN(n)) {
        attrs[k] = (k === 'stock_count' || k === 'initial_stock_count') ? Math.round(n) : n;
      }
    } else {
      attrs[k] = typeof v === 'string' ? v.trim() : v;
    }
  }
  return attrs;
}

async function loadParasutProductMappingRules(db: D1Database): Promise<ParasutPushSelected[]> {
  const row = await db.prepare(
    `SELECT value FROM app_settings WHERE category = 'parasut' AND "key" = ? AND is_deleted = 0 AND (status = 1 OR status IS NULL) LIMIT 1`
  ).bind(PARASUT_PRODUCT_MAPPINGS_KEY).first() as { value: string | null } | null;
  const raw = row?.value?.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ParasutPushSelected[] | Record<string, string>;
    if (Array.isArray(parsed)) {
      return parsed.filter((r) => r.parasut?.trim() && r.master?.trim());
    }
    if (typeof parsed === 'object' && parsed !== null) {
      return Object.entries(parsed)
        .filter(([k, v]) => k && v)
        .map(([parasut, master]) => ({ parasut, master: String(master) }));
    }
  } catch { /* ignore */ }
  return [];
}

/** Kayıtlı ürün + kurallara göre Paraşüt'e gidecek alanların önizlemesi; SKU ile Paraşüt ürünü aranır */
app.post('/api/parasut/products/push-preview', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req.json<{
      product_id: number;
      selected_fields?: ParasutPushSelected[];
    }>();
    const productId = body?.product_id;
    if (!productId) return c.json({ error: 'product_id gerekli' }, 400);

    let selected = body.selected_fields ?? [];
    if (selected.length === 0) {
      selected = await loadParasutProductMappingRules(c.env.DB);
    }
    if (selected.length === 0) {
      return c.json({ error: 'Eşleştirme kuralı yok. Paraşüt › Ürünler sayfasından alan kurallarını tanımlayın.' }, 400);
    }

    const productRow = await c.env.DB.prepare(
      `SELECT p.id, p.name, p.sku, p.barcode, p.price, p.quantity, p.tax_rate, p.unit_id, p.currency_id, p.category_id, p.supplier_code, p.gtip_code, p.image,
       u.code as unit_code, cur.code as currency_code
       FROM products p
       LEFT JOIN product_unit u ON p.unit_id = u.id AND u.is_deleted = 0
       LEFT JOIN product_currencies cur ON p.currency_id = cur.id AND cur.is_deleted = 0
       WHERE p.id = ? AND p.is_deleted = 0`
    ).bind(productId).first() as ProductRowForParasutPush | null;
    if (!productRow) return c.json({ error: 'Ürün bulunamadı' }, 404);

    const sku = (productRow.sku ?? '').trim();
    if (!sku) {
      return c.json({ error: 'Paraşüt ürününü bulmak için ana ürün SKU dolu olmalıdır' }, 400);
    }

    const auth = await getParasutAuth(c);
    if (!auth) return c.json({ error: 'Paraşüt ayarları eksik veya geçersiz' }, 400);

    const attrs = await buildParasutPushAttributes(c.env.STORAGE, productRow, selected);

    const base = 'https://api.parasut.com';
    const params = new URLSearchParams();
    params.set('filter[code]', sku);
    params.set('page[number]', '1');
    params.set('page[size]', '5');
    params.set('sort', '-id');
    const listRes = await fetch(`${base}/v4/${auth.companyId}/products?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${auth.token}`, 'Accept': 'application/json' },
    });
    const listJson = await listRes.json().catch(() => ({}));
    if (!listRes.ok) {
      const errMsg = (listJson as { errors?: Array<{ detail?: string }> }).errors?.[0]?.detail || `HTTP ${listRes.status}`;
      return c.json({ error: `Paraşüt ürün araması: ${errMsg}` }, 400);
    }
    const rawData = (listJson as { data?: unknown }).data;
    const dataArr: unknown[] = Array.isArray(rawData)
      ? rawData
      : rawData != null && typeof rawData === 'object'
        ? [rawData]
        : [];
    const first = dataArr[0] as { id?: string | number; attributes?: Record<string, unknown> } | undefined;
    const rawId = first?.id;
    const parasutId =
      rawId != null && String(rawId).trim() !== '' ? String(rawId).trim() : null;
    const pa = (first?.attributes ?? {}) as Record<string, unknown>;
    const parasutProduct = first
      ? {
        id: parasutId ?? undefined,
        code: pa.code != null ? String(pa.code) : '',
        name: pa.name != null ? String(pa.name) : '',
      }
      : null;

    const attributesDisplay: Record<string, unknown> = { ...attrs };
    const hasPhoto = typeof attributesDisplay.photo === 'string' && attributesDisplay.photo.length > 0;
    if (hasPhoto) delete attributesDisplay.photo;

    return c.json({
      parasut_id: parasutId,
      parasut_product: parasutProduct,
      sku_used: sku,
      attributes_display: attributesDisplay,
      has_photo: hasPhoto,
      selected_fields: selected,
    });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Önizleme hatası' }, 500);
  }
});

/** Master → Paraşüt gönder (PUT güncelleme veya create_new ile POST yeni ürün) */
app.post('/api/parasut/products/push', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req.json<{
      parasut_id?: string;
      product_id: number;
      create_new?: boolean;
      selected_fields?: ParasutPushSelected[];
      attribute_overrides?: Record<string, unknown>;
    }>();
    const parasutIdRaw = body?.parasut_id != null ? String(body.parasut_id).trim() : '';
    const productId = body?.product_id;
    let selected = body?.selected_fields ?? [];
    if (selected.length === 0) {
      selected = await loadParasutProductMappingRules(c.env.DB);
    }
    if (!productId || selected.length === 0) {
      return c.json({ error: 'product_id ve eşleştirme kuralları gerekli' }, 400);
    }

    const wantsCreate = !!body?.create_new && !parasutIdRaw;
    if (!wantsCreate && !parasutIdRaw) {
      return c.json({ error: 'parasut_id gerekli veya create_new: true ile yeni ürün oluşturun' }, 400);
    }

    const productRow = await c.env.DB.prepare(
      `SELECT p.id, p.name, p.sku, p.barcode, p.price, p.quantity, p.tax_rate, p.unit_id, p.currency_id, p.category_id, p.supplier_code, p.gtip_code, p.image,
       u.code as unit_code, cur.code as currency_code
       FROM products p
       LEFT JOIN product_unit u ON p.unit_id = u.id AND u.is_deleted = 0
       LEFT JOIN product_currencies cur ON p.currency_id = cur.id AND cur.is_deleted = 0
       WHERE p.id = ? AND p.is_deleted = 0`
    ).bind(productId).first() as ProductRowForParasutPush | null;
    if (!productRow) return c.json({ error: 'Ürün bulunamadı' }, 404);

    const auth = await getParasutAuth(c);
    if (!auth) return c.json({ error: 'Paraşüt ayarları eksik veya geçersiz' }, 400);

    let attrs = await buildParasutPushAttributes(c.env.STORAGE, productRow, selected, wantsCreate ? { skipPhoto: true } : undefined);
    attrs = mergeParasutAttributeOverrides(attrs, body.attribute_overrides);

    const nm = attrs.name != null ? String(attrs.name).trim() : '';
    if (!nm) attrs.name = productRow.name?.trim() || 'Ürün';
    if (attrs.code != null && String(attrs.code).trim() === '' && productRow.sku?.trim()) {
      attrs.code = productRow.sku.trim();
    }

    const base = 'https://api.parasut.com';

    if (wantsCreate) {
      if (!productRow.sku?.trim()) {
        return c.json({ error: 'Yeni Paraşüt ürünü için ana ürün SKU (kod) zorunludur' }, 400);
      }
      let createAttrs = prepareAttrsForParasutProductCreate(attrs);
      applyParasutCreateDefaults(createAttrs);
      createAttrs = pickWritableParasutProductAttributes(createAttrs);
      if (!createAttrs.name || !String(createAttrs.name).trim()) {
        createAttrs.name = productRow.name?.trim() || 'Ürün';
      }
      if (!createAttrs.code || !String(createAttrs.code).trim()) {
        createAttrs.code = productRow.sku!.trim();
      }
      if (createAttrs.initial_stock_count === 0 || createAttrs.initial_stock_count === '0') {
        delete createAttrs.initial_stock_count;
      }
      normalizeParasutGtipInAttributes(createAttrs);
      const hadInitialStock = Object.prototype.hasOwnProperty.call(createAttrs, 'initial_stock_count');
      const createData: {
        type: string;
        attributes: Record<string, unknown>;
        relationships?: Record<string, unknown>;
      } = { type: 'products', attributes: createAttrs };
      const catId = productRow.category_id != null && productRow.category_id > 0 ? productRow.category_id : null;
      if (catId) {
        const mapRow = await c.env.DB.prepare(
          `SELECT value FROM app_settings WHERE category = 'parasut' AND "key" = ? AND is_deleted = 0 LIMIT 1`
        ).bind(PARASUT_CATEGORY_MAPPINGS_KEY).first() as { value: string | null } | null;
        const rawMap = mapRow?.value?.trim();
        let mappings: Record<string, string> = {};
        if (rawMap) {
          try {
            mappings = JSON.parse(rawMap) as Record<string, string>;
          } catch { /* ignore */ }
        }
        const parasutCategoryId = mappings[String(catId)];
        if (parasutCategoryId?.trim()) {
          createData.relationships = {
            category: { data: { type: 'item_categories', id: parasutCategoryId.trim() } },
          };
        }
      }
      const postParasutProduct = async (payload: typeof createData) =>
        fetch(`${base}/v4/${auth.companyId}/products`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${auth.token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ data: payload }),
        });

      let createRes = await postParasutProduct(createData);
      let createJson = await createRes.json().catch(() => ({}));
      if (!createRes.ok && hadInitialStock && (createRes.status === 400 || createRes.status === 422)) {
        const attrsNoStock = { ...createAttrs };
        delete attrsNoStock.initial_stock_count;
        const createDataRetry: typeof createData = {
          type: 'products',
          attributes: attrsNoStock,
          ...(createData.relationships ? { relationships: createData.relationships } : {}),
        };
        createRes = await postParasutProduct(createDataRetry);
        createJson = await createRes.json().catch(() => ({}));
        if (createRes.ok) {
          const newIdRaw = (createJson as { data?: { id?: string | number } }).data?.id;
          const newId = newIdRaw != null && String(newIdRaw).trim() !== '' ? String(newIdRaw).trim() : '';
          return c.json({
            ok: true,
            message:
              'Paraşüt\'te yeni ürün oluşturuldu. Başlangıç stok alanı gönderilemedi (ör. çoklu depo); stoku Paraşüt üzerinden güncelleyebilirsiniz.',
            parasut_id: newId || undefined,
            stock_omitted: true,
          });
        }
      }
      if (!createRes.ok) {
        return c.json({ error: `Paraşüt: ${parasutApiErrorMessage(createJson, createRes.status)}` }, 400);
      }
      const newIdRaw = (createJson as { data?: { id?: string | number } }).data?.id;
      const newId = newIdRaw != null && String(newIdRaw).trim() !== '' ? String(newIdRaw).trim() : '';
      return c.json({
        ok: true,
        message: 'Paraşüt\'te yeni ürün oluşturuldu',
        parasut_id: newId || undefined,
      });
    }

    const parasutId = parasutIdRaw;
    // Ürün PUT: stock_count şemada read-only; miktar eşlemesi buraya düşerse Paraşüt 400 döner.
    // Stok güncellemesi inventory_levels / depo API ile yapılmalı.
    delete attrs.stock_count;
    delete attrs.initial_stock_count;

    const updateAttrs = pickWritableParasutProductAttributes(attrs);
    normalizeParasutGtipInAttributes(updateAttrs);
    stripOversizedParasutPhoto(updateAttrs);

    const remoteAttrs = await fetchParasutProductAttributes(base, String(auth.companyId), auth.token, parasutId);
    mergeParasutUpdateAttrsWithExistingRemote(updateAttrs, remoteAttrs);
    applyParasutUpdateBuyingDefaults(updateAttrs);
    const updateAttrsFinal = pickWritableParasutProductAttributes(updateAttrs);

    const putParasutProduct = (attributes: Record<string, unknown>) =>
      fetch(`${base}/v4/${auth.companyId}/products/${parasutId}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${auth.token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          data: {
            id: parasutId,
            type: 'products',
            attributes,
          },
        }),
      });

    let attrsToSend: Record<string, unknown> = { ...updateAttrsFinal };
    const parasutFieldsOmitted: string[] = [];
    let lastUpdateJson: unknown = {};
    let lastUpdateStatus = 400;

    for (let attempt = 0; attempt <= PARASUT_PUT_RETRY_STRIP_ORDER.length + 1; attempt += 1) {
      const updateRes = await putParasutProduct(attrsToSend);
      const updateJson = await updateRes.json().catch(() => ({}));
      lastUpdateJson = updateJson;
      lastUpdateStatus = updateRes.status;
      if (updateRes.ok) {
        const msg =
          parasutFieldsOmitted.length > 0
            ? `Paraşüt'e gönderildi. Paraşüt reddettiği için çıkarılan alanlar: ${parasutFieldsOmitted.join(', ')}. Bu alanları Paraşüt üzerinden kontrol edin.`
            : 'Paraşüt\'e gönderildi';
        return c.json({
          ok: true,
          message: msg,
          ...(parasutFieldsOmitted.length > 0 ? { parasut_fields_omitted: parasutFieldsOmitted } : {}),
        });
      }
      if (updateRes.status !== 400 && updateRes.status !== 422) {
        break;
      }
      const nextKey = PARASUT_PUT_RETRY_STRIP_ORDER.find((k) =>
        Object.prototype.hasOwnProperty.call(attrsToSend, k),
      );
      if (!nextKey) break;
      const next = { ...attrsToSend };
      delete next[nextKey];
      attrsToSend = next;
      parasutFieldsOmitted.push(nextKey);
      const remaining = Object.keys(attrsToSend).filter((k) => attrsToSend[k] !== undefined);
      if (remaining.length === 0 || (remaining.length === 1 && remaining[0] === 'name')) {
        break;
      }
    }

    return c.json(
      { error: `Paraşüt: ${parasutApiErrorMessage(lastUpdateJson, lastUpdateStatus)}` },
      400,
    );
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Gönderme hatası' }, 500);
  }
});

/** Paraşüt ürünü doğrudan güncelle (Paraşüt API PUT) */
app.put('/api/parasut/products/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const parasutId = c.req.param('id')?.trim();
    if (!parasutId) return c.json({ error: 'Ürün ID gerekli' }, 400);

    const body = await c.req.json<{
      code?: string;
      name?: string;
      list_price?: number;
      currency?: string;
      buying_price?: number;
      buying_currency?: string;
      unit?: string;
      vat_rate?: number;
      stock_count?: number;
      barcode?: string;
      gtip?: string;
      photo?: string;
      archived?: boolean;
      inventory_tracking?: boolean;
      category_id?: string;
    }>().catch(() => ({}));

    const auth = await getParasutAuth(c);
    if (!auth) return c.json({ error: 'Paraşüt ayarları eksik veya geçersiz' }, 400);

    const attrs: Record<string, unknown> = {};
    const nameVal = body?.name != null ? String(body.name).trim() : '';
    attrs.name = nameVal || 'Ürün';
    if (body?.code != null) attrs.code = String(body.code).trim();
    if (body?.barcode != null) attrs.barcode = body.barcode != null ? String(body.barcode).trim() : undefined;
    if (body?.list_price != null) attrs.list_price = typeof body.list_price === 'number' ? body.list_price : parseFloat(String(body.list_price)) || 0;
    if (body?.buying_price != null) attrs.buying_price = typeof body.buying_price === 'number' ? body.buying_price : parseFloat(String(body.buying_price)) ?? 0;
    if (body?.currency != null) attrs.currency = String(body.currency).trim().toUpperCase() || 'TRY';
    if (body?.buying_currency != null) attrs.buying_currency = String(body.buying_currency).trim().toUpperCase();
    if (body?.unit != null) attrs.unit = String(body.unit).trim();
    if (body?.vat_rate != null) attrs.vat_rate = typeof body.vat_rate === 'number' ? body.vat_rate : parseFloat(String(body.vat_rate)) ?? 0;
    // stock_count Paraşüt ürün PUT'unda read-only; gönderilmez
    if (body?.gtip != null) attrs.gtip = String(body.gtip).trim();
    if (body?.photo != null) attrs.photo = String(body.photo).trim();
    if (typeof body?.archived === 'boolean') attrs.archived = body.archived;
    if (typeof body?.inventory_tracking === 'boolean') attrs.inventory_tracking = body.inventory_tracking;

    let attrOut = pickWritableParasutProductAttributes(attrs);
    normalizeParasutGtipInAttributes(attrOut);
    stripOversizedParasutPhoto(attrOut);

    const base = 'https://api.parasut.com';
    const remoteAttrs = await fetchParasutProductAttributes(base, String(auth.companyId), auth.token, parasutId);
    mergeParasutUpdateAttrsWithExistingRemote(attrOut, remoteAttrs);
    applyParasutUpdateBuyingDefaults(attrOut);
    attrOut = pickWritableParasutProductAttributes(attrOut);

    const payload: { id: string; type: string; attributes: Record<string, unknown>; relationships?: Record<string, unknown> } = {
      id: parasutId,
      type: 'products',
      attributes: attrOut,
    };
    const parasutCategoryId = body?.category_id != null && String(body.category_id).trim() ? String(body.category_id).trim() : undefined;
    if (parasutCategoryId) {
      payload.relationships = { category: { data: { type: 'item_categories', id: parasutCategoryId } } };
    }

    if (Object.keys(attrOut).length === 0 && !parasutCategoryId) return c.json({ error: 'Güncellenecek alan bulunamadı' }, 400);

    const updateRes = await fetch(`${base}/v4/${auth.companyId}/products/${parasutId}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${auth.token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ data: payload }),
    });
    const updateJson = await updateRes.json().catch(() => ({}));
    if (!updateRes.ok) {
      const errMsg = (updateJson as { errors?: Array<{ detail?: string }> }).errors?.[0]?.detail || `HTTP ${updateRes.status}`;
      return c.json({ error: `Paraşüt: ${errMsg}` }, 400);
    }
    return c.json({ ok: true, message: 'Ürün güncellendi' });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Güncelleme hatası' }, 500);
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

// ========== DÖVİZ KURLARI ==========
const TCMB_URL = 'https://www.tcmb.gov.tr/kurlar/today.xml';

/** Kayıtlı döviz kurları listesi (filtre: currency_code, date_from, date_to) */
app.get('/api/exchange-rates', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const currencyCode = (c.req.query('currency_code') || '').trim().toUpperCase();
    const dateFrom = (c.req.query('date_from') || '').trim();
    const dateTo = (c.req.query('date_to') || '').trim();
    const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
    const limit = Math.min(100, Math.max(10, parseInt(c.req.query('limit') || '50', 10)));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: (string | number)[] = [];
    if (currencyCode) {
      conditions.push('currency_code = ?');
      params.push(currencyCode);
    }
    if (dateFrom) {
      conditions.push("DATE(recorded_at) >= DATE(?)");
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push("DATE(recorded_at) <= DATE(?)");
      params.push(dateTo);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM exchange_rates ${where}`
    ).bind(...params).first<{ total: number }>();
    const total = countRes?.total ?? 0;

    const { results } = await c.env.DB.prepare(
      `SELECT id, currency_code, rate, recorded_at, source FROM exchange_rates ${where}
       ORDER BY recorded_at DESC, id DESC LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all();

    const currenciesRes = await c.env.DB.prepare(
      `SELECT DISTINCT currency_code FROM exchange_rates ORDER BY currency_code`
    ).all();
    const currencies = (currenciesRes.results || []).map((r: { currency_code: string }) => r.currency_code);

    return c.json({ data: results || [], total, page, limit, currencies });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

/** Tek döviz kuru kaydı sil */
app.delete('/api/exchange-rates/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = parseInt(c.req.param('id'), 10);
    if (isNaN(id)) return c.json({ error: 'Geçersiz id' }, 400);
    const res = await c.env.DB.prepare(`DELETE FROM exchange_rates WHERE id = ?`).bind(id).run();
    if (res.meta.changes === 0) return c.json({ error: 'Kayıt bulunamadı' }, 404);
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

/** Toplu döviz kuru kaydı sil */
app.delete('/api/exchange-rates', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req.json<{ ids?: number[] }>().catch(() => ({}));
    const ids = Array.isArray(body?.ids) ? body.ids.filter((x) => typeof x === 'number' && !isNaN(x)) : [];
    if (ids.length === 0) return c.json({ error: 'ids dizisi gerekli' }, 400);
    const placeholders = ids.map(() => '?').join(',');
    const res = await c.env.DB.prepare(`DELETE FROM exchange_rates WHERE id IN (${placeholders})`).bind(...ids).run();
    return c.json({ ok: true, deleted: res.meta.changes });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

/** Manuel tetikleme: Döviz kurlarını TCMB'den çekip kaydet */
app.post('/api/cron/exchange-rates', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    await runExchangeRatesCron(c.env.DB);
    return c.json({ ok: true, message: 'Döviz kurları güncellendi' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Hata';
    console.error('[Cron] Döviz kurları hatası:', err);
    return c.json({ error: msg }, 500);
  }
});
/** TCMB XML'den ForexSelling kurlarını parse eder. JPY 100 birim olduğu için 100'e böler. */
async function fetchTcmbRates(): Promise<Record<string, number>> {
  const res = await fetch(TCMB_URL);
  if (!res.ok) throw new Error(`TCMB yanıt vermedi: ${res.status}`);
  const xml = await res.text();
  const rates: Record<string, number> = {};
  // <Currency ... CurrencyCode="USD" ...> ... <ForexSelling>43.97</ForexSelling>
  const currencyBlocks = xml.matchAll(/<Currency[^>]*CurrencyCode="([A-Z]{3})"[^>]*>([\s\S]*?)<\/Currency>/g);
  for (const [, code, block] of currencyBlocks) {
    const forexSelling = block.match(/<ForexSelling>([\d.]+)<\/ForexSelling>/);
    const unitMatch = block.match(/<Unit>(\d+)<\/Unit>/);
    const unit = unitMatch ? parseInt(unitMatch[1], 10) : 1;
    if (forexSelling && code) {
      const rate = parseFloat(forexSelling[1]) / unit;
      if (!Number.isNaN(rate) && rate > 0) rates[code] = rate;
    }
  }
  return rates;
}

/** Sistemde kaydedilen döviz kurları: sadece USD ve EUR */
const SYSTEM_EXCHANGE_CURRENCIES = ['USD', 'EUR'];

/** Cron: Döviz kurlarını TCMB'den çekip exchange_rates tablosuna ve app_settings'e yazar */
async function runExchangeRatesCron(db: D1Database): Promise<void> {
  const rates = await fetchTcmbRates();
  if (Object.keys(rates).length === 0) return;

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  for (const code of SYSTEM_EXCHANGE_CURRENCIES) {
    const rate = rates[code];
    if (rate != null && rate > 0) {
      await db.prepare(
        `INSERT INTO exchange_rates (currency_code, rate, recorded_at, source) VALUES (?, ?, ?, 'tcmb')`
      ).bind(code, rate, now).run();
    }
  }

  const exchangeRates: Record<string, number> = {};
  for (const code of SYSTEM_EXCHANGE_CURRENCIES) {
    if (rates[code] != null) exchangeRates[code] = rates[code];
  }
  if (Object.keys(exchangeRates).length === 0) return;

  const existing = await db.prepare(
    `SELECT id FROM app_settings WHERE category = 'parabirimleri' AND "key" = 'exchange_rates' AND is_deleted = 0`
  ).first();
  const jsonVal = JSON.stringify(exchangeRates);
  if (existing) {
    await db.prepare(
      `UPDATE app_settings SET value = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(jsonVal, (existing as { id: number }).id).run();
  } else {
    await db.prepare(
      `INSERT INTO app_settings (category, "key", value) VALUES ('parabirimleri', 'exchange_rates', ?)`
    ).bind(jsonVal).run();
  }
}

export default {
  fetch: app.fetch,
  async scheduled(
    event: ScheduledEvent,
    env: Bindings,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(
      (async () => {
        try {
          if (!env.DB) return;
          await runExchangeRatesCron(env.DB);
        } catch (err) {
          console.error('[Cron] Döviz kurları hatası:', err);
        }
      })(),
    );
  },
};
