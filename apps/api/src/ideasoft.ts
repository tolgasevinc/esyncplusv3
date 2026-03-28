/**
 * Ideasoft Admin API + OAuth2 (mağaza tabanı: https://{subdomain}.myideasoft.com)
 * REST istekleri önce `.../admin-api`, 404 veya boş koleksiyonda `.../api` ile tekrarlanır.
 * Dokümantasyon: https://apidoc.ideasoft.dev/
 */

type IdeasoftEnv = { DB: D1Database };

const CAT = 'ideasoft';

/** REST kökü: dokümantasyonda /admin-api ve /api (aynı kaynaklar, farklı kök) */
const IDEASOFT_RESOURCE_PREFIXES = ['admin-api', 'api'] as const;

export type IdeasoftSettings = Record<string, string>;

export async function loadIdeasoftSettings(db: D1Database): Promise<IdeasoftSettings> {
  const { results } = await db.prepare(
    `SELECT key, value FROM app_settings WHERE category = ? AND is_deleted = 0 AND (status = 1 OR status IS NULL)`
  ).bind(CAT).all();
  const out: IdeasoftSettings = {};
  for (const r of results as { key: string; value: string | null }[]) {
    if (r.key) out[r.key] = r.value ?? '';
  }
  return out;
}

/** Yalnızca kök köken (https://magaza.myideasoft.com) — path varsa kaldırılır; aksi halde /admin + /admin/user/auth = 404 olur */
export function normalizeStoreBase(url: string): string {
  const raw = (url || '').trim();
  if (!raw) return '';
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const p = new URL(withProto);
    return `${p.protocol}//${p.host}`;
  } catch {
    return raw.replace(/\/+$/, '');
  }
}

function getOAuthPaths(base: string): { authorize: string; token: string } {
  return {
    authorize: `${base}/oauth/v2/auth`,
    token: `${base}/oauth/v2/token`,
  };
}

/** Alternatif (Symfony / eski kurulum) */
function getOAuthTokenUrlFallback(base: string): string {
  return `${normalizeStoreBase(base)}/oauth/token`;
}

/** Ideasoft / Symfony hata gövdeleri: errorMessage, error, detail vb. */
function parseIdeasoftHttpError(status: number, data: unknown, rawText: string): string {
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    const msg =
      (typeof o.errorMessage === 'string' && o.errorMessage.trim()) ||
      (typeof o.message === 'string' && o.message.trim()) ||
      (typeof o.error_description === 'string' && o.error_description.trim()) ||
      (typeof o.error === 'string' && o.error.trim()) ||
      (typeof o.detail === 'string' && o.detail.trim()) ||
      (typeof o.title === 'string' && o.title.trim());
    if (msg) return status >= 400 ? `${msg} (HTTP ${status})` : msg;
  }
  const t = rawText?.trim?.() ?? '';
  if (t && t.length < 500) return `${t} (HTTP ${status})`;
  return `Ideasoft yanıt veremedi (HTTP ${status})`;
}

export function getIdeasoftRedirectUriFromRequest(requestUrl: string): string {
  const u = new URL(requestUrl);
  return `${u.origin}/oauth/ideasoft/callback`;
}

export async function saveIdeasoftTokens(
  db: D1Database,
  accessToken: string,
  refreshToken: string,
  expiresIn: number
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = String(now + Math.max(0, expiresIn));
  const upsert = async (key: string, value: string) => {
    const existing = await db.prepare(
      `SELECT id FROM app_settings WHERE category = ? AND "key" = ? AND is_deleted = 0`
    ).bind(CAT, key).first();
    if (existing) {
      await db.prepare(`UPDATE app_settings SET value = ?, updated_at = datetime('now') WHERE id = ?`)
        .bind(value, (existing as { id: number }).id).run();
    } else {
      await db.prepare(`INSERT INTO app_settings (category, "key", value) VALUES (?, ?, ?)`)
        .bind(CAT, key, value).run();
    }
  };
  await upsert('IDEASOFT_ACCESS_TOKEN', accessToken);
  await upsert('IDEASOFT_REFRESH_TOKEN', refreshToken);
  await upsert('IDEASOFT_TOKEN_EXPIRES_AT', expiresAt);
}

/** Ideasoft OAuth access token (refresh ile yenileme) */
export async function getIdeasoftAccessToken(env: IdeasoftEnv): Promise<string | null> {
  if (!env.DB) return null;
  const settings = await loadIdeasoftSettings(env.DB);
  const base = normalizeStoreBase(settings.store_base_url || '');
  const clientId = (settings.client_id || '').trim();
  const clientSecret = (settings.client_secret || '').trim();
  if (!base || !clientId || !clientSecret) return null;

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = parseInt(settings.IDEASOFT_TOKEN_EXPIRES_AT || '0', 10);
  const bufferSec = 120;
  if (expiresAt > now + bufferSec && settings.IDEASOFT_ACCESS_TOKEN?.trim()) {
    return settings.IDEASOFT_ACCESS_TOKEN.trim();
  }

  const refreshToken = settings.IDEASOFT_REFRESH_TOKEN?.trim();
  const { token: tokenUrl } = getOAuthPaths(base);
  if (refreshToken) {
    const refreshBody = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    });
    let { res, data: refreshData, rawText } = await postIdeasoftToken(tokenUrl, refreshBody);
    if (!res.ok && res.status === 404) {
      const second = await postIdeasoftToken(getOAuthTokenUrlFallback(base), refreshBody);
      res = second.res;
      refreshData = second.data;
      rawText = second.rawText;
    }
    const newToken = (refreshData as { access_token?: string }).access_token?.trim();
    const newRefresh = (refreshData as { refresh_token?: string }).refresh_token;
    const expiresIn = (refreshData as { expires_in?: number }).expires_in ?? 3600;
    if (newToken) {
      await saveIdeasoftTokens(env.DB, newToken, (newRefresh ?? '').trim() || refreshToken, expiresIn);
      return newToken;
    }
  }
  return null;
}

async function postIdeasoftToken(
  tokenUrl: string,
  body: URLSearchParams
): Promise<{ res: Response; data: unknown; rawText: string }> {
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  const rawText = await res.text();
  let data: unknown = {};
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    data = {};
  }
  return { res, data, rawText };
}

export async function exchangeIdeasoftAuthorizationCode(
  db: D1Database,
  baseUrl: string,
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const base = normalizeStoreBase(baseUrl);
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  });

  const primary = getOAuthPaths(base).token;
  let { res, data, rawText } = await postIdeasoftToken(primary, params);

  if (!res.ok && res.status === 404) {
    const fb = getOAuthTokenUrlFallback(base);
    const second = await postIdeasoftToken(fb, params);
    res = second.res;
    data = second.data;
    rawText = second.rawText;
  }

  const d = data as { access_token?: string; refresh_token?: string; expires_in?: number };
  const accessToken = d.access_token?.trim();
  const refreshToken = (d.refresh_token ?? '').trim();
  const expiresIn = typeof d.expires_in === 'number' ? d.expires_in : 3600;

  if (!accessToken) {
    if (res.ok) {
      const snippet = rawText.replace(/\s+/g, ' ').trim().slice(0, 280);
      return {
        ok: false,
        error: `Ideasoft access_token dönmedi. Yanıt: ${snippet || '(boş)'}`,
      };
    }
    let err = parseIdeasoftHttpError(res.status, data, rawText);
    if (res.status >= 500 || /internal server error/i.test(err)) {
      err += ` Yönlendirme adresi şu olmalı: ${redirectUri} (Ideasoft panelindeki Redirect URI ile karakter karakter aynı; genelde sondaki / olmadan).`;
    }
    return { ok: false, error: err };
  }

  await saveIdeasoftTokens(db, accessToken, refreshToken, expiresIn);
  return { ok: true };
}

function isAllowedReturnUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return true;
    if (u.protocol === 'https:' && u.hostname.endsWith('e-syncplus.com')) return true;
    if (u.protocol === 'http:' && u.hostname === 'localhost') return true;
    return false;
  } catch {
    return false;
  }
}

export function parseReturnToQuery(raw: string | undefined, requestUrl: string): string {
  const fallback = 'https://app.e-syncplus.com/ayarlar/entegrasyonlar/ideasoft';
  const v = (raw || '').trim();
  if (!v) return fallback;
  if (v.startsWith('http://') || v.startsWith('https://')) {
    return isAllowedReturnUrl(v) ? v : fallback;
  }
  try {
    const origin = new URL(requestUrl).origin;
    const full = origin + (v.startsWith('/') ? v : `/${v}`);
    return isAllowedReturnUrl(full) ? full : fallback;
  } catch {
    return fallback;
  }
}

/** OAuth start: Ideasoft yetkilendirme URL'si.
 * Resmi Admin API dokümantasyonu: authorizationUrl …/panel/auth (Ideashop OAuth2).
 * Bazı kurulumlar /admin/oauth/authorize veya /admin/user/auth kullanır; 404 alırsanız ayarlardan değiştirin.
 * @see https://apidoc.ideasoft.dev/docs/admin-api/3x74avtrv8u23-authentication */
export function buildIdeasoftAuthorizeUrl(
  storeBase: string,
  clientId: string,
  redirectUri: string,
  state: string,
  scope?: string,
  authorizePath: string = '/panel/auth'
): string {
  const base = normalizeStoreBase(storeBase);
  const ap = (authorizePath || '/panel/auth').trim() || '/panel/auth';
  const path = ap.startsWith('/') ? ap : `/${ap}`;
  const authorize = `${base}${path}`;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  });
  const sc = (scope ?? '').trim();
  if (sc) params.set('scope', sc);
  return `${authorize}?${params.toString()}`;
}

/**
 * Koleksiyon gövdesinden düz öğe listesi.
 * Ideasoft /categories endpoint'i doğrudan JSON array döndürür (Hydra wrapper yok).
 * Hem plain array hem de çeşitli sarmalayıcı formatlar desteklenir.
 */
function extractHydraMembers(raw: Record<string, unknown> | unknown[]): unknown[] {
  // Ideasoft: doğrudan array yanıt (en yaygın format)
  if (Array.isArray(raw)) return raw;
  const m = raw['hydra:member'];
  if (Array.isArray(m)) return m;
  const graph = raw['@graph'];
  if (Array.isArray(graph)) return graph;
  const legacy = raw['member'];
  if (Array.isArray(legacy)) return legacy;
  const data = raw['data'];
  if (Array.isArray(data)) return data;
  const cats = raw['categories'];
  if (Array.isArray(cats)) return cats;
  const items = raw['items'];
  if (Array.isArray(items)) return items;
  const results = raw['results'];
  if (Array.isArray(results)) return results;
  const tree = raw['tree'];
  if (Array.isArray(tree)) return tree;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const inner = extractHydraMembers(data as Record<string, unknown>);
    if (inner.length > 0) return inner;
  }
  if (cats && typeof cats === 'object' && !Array.isArray(cats)) {
    const flat = flattenIdeasoftCategoryTreeNodes(cats);
    if (flat.length > 0) return flat;
  }
  return [];
}

/** Ağaç kökü veya tek düğüm: children / subcategories ile düz liste */
function flattenIdeasoftCategoryTreeNodes(node: unknown): unknown[] {
  if (node == null) return [];
  if (Array.isArray(node)) {
    const out: unknown[] = [];
    for (const n of node) out.push(...flattenIdeasoftCategoryTreeNodes(n));
    return out;
  }
  if (typeof node === 'object') {
    const o = node as Record<string, unknown>;
    const out: unknown[] = [o];
    for (const k of ['children', 'subcategories', 'nodes', 'childCategories']) {
      const ch = o[k];
      if (Array.isArray(ch)) out.push(...flattenIdeasoftCategoryTreeNodes(ch));
    }
    return out;
  }
  return [];
}

function hydraNextPath(raw: Record<string, unknown>): string | null {
  const view = raw['hydra:view'] as Record<string, string> | undefined;
  const nextHref = view?.['hydra:next'];
  if (typeof nextHref !== 'string' || !nextHref.trim()) return null;
  if (nextHref.startsWith('http')) return nextHref;
  return nextHref.startsWith('/') ? nextHref : `/${nextHref}`;
}

/** Boş yanıtta diğer kökü denemek için — extractHydraMembers ile aynı kurallar (categories/member vb.) */
function countHydraLikeMembers(raw: Record<string, unknown> | unknown[]): number {
  return extractHydraMembers(raw).length;
}

type IdeasoftApiFetchOptions = {
  /** 200 + boş hydra:member ise sıradaki köke (api) geç */
  retryEmptyJsonCollection?: boolean;
};

/**
 * Admin API istekleri: önce /admin-api, 404 veya (isteğe bağlı) boş koleksiyonda /api.
 * Tam URL veya /admin-api/... ve /api/... ile başlayan mağaza göreli yollar olduğu gibi kullanılır.
 */
async function ideasoftApiFetch(
  storeBase: string,
  accessToken: string,
  path: string,
  init?: RequestInit,
  options?: IdeasoftApiFetchOptions
): Promise<Response> {
  const base = normalizeStoreBase(storeBase);
  const mergedHeaders: HeadersInit = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    ...(init?.headers || {}),
  };
  const doFetch = (url: string) =>
    fetch(url, {
      ...init,
      headers: mergedHeaders,
    });

  if (path.startsWith('http://') || path.startsWith('https://')) {
    return doFetch(path);
  }

  if (path.startsWith('/admin-api/') || path.startsWith('/api/')) {
    return doFetch(`${base}${path}`);
  }

  const rel = path.startsWith('/') ? path : `/${path}`;
  let last: Response | null = null;

  for (const prefix of IDEASOFT_RESOURCE_PREFIXES) {
    const url = `${base}/${prefix}${rel}`;
    const res = await doFetch(url);
    last = res;

    if (res.status === 401 || res.status === 403) return res;

    if (res.ok) {
      if (options?.retryEmptyJsonCollection) {
        const txt = await res.clone().text();
        try {
          const j = JSON.parse(txt) as Record<string, unknown> | unknown[];
          if (countHydraLikeMembers(j) === 0) {
            continue;
          }
        } catch {
          /* JSON değil veya parse hatası — yanıtı olduğu gibi kullan */
        }
      }
      return res;
    }

    if (res.status === 404) continue;
    return res;
  }

  return last!;
}

/** Tam mağaza kökü + IRI (bazı endpoint'ler için) */
function ideasoftRelationIri(
  storeBase: string,
  resource: 'categories' | 'brands' | 'currencies',
  id: string
): string {
  const b = normalizeStoreBase(storeBase);
  return `${b}/admin-api/${resource}/${id}`;
}

/** Ideasoft ilişki id: yalnızca tam sayı string ise sayı; UUID vb. için null */
function parseIdeasoftRelationNumericId(raw: string | null | undefined): number | null {
  if (raw == null || String(raw).trim() === '') return null;
  const t = String(raw).trim();
  const n = parseInt(t, 10);
  if (!Number.isNaN(n) && String(n) === t) return n;
  return null;
}

/**
 * Kategori + para birimi gövde katmanları (marka **dahil değil**).
 * Ideasoft Product POST/PUT gövdesinde `brand` ilişkisi çoğu kurulumda API Platform denormalizer’ında
 * 400 veriyor (IRI / @id / tam URL). Marka `ideasoftApplyProductBrandAfterUpsert` ile ayrı istekte atanır.
 */
function buildIdeasoftProductCategoryCurrencyLayers(params: {
  storeBase: string;
  categoryIdeasoftId?: string | null;
  currencyIdeasoftNumericId?: number | null;
}): Record<string, unknown>[] {
  const { storeBase } = params;
  const baseNorm = normalizeStoreBase(storeBase);
  const cNum = parseIdeasoftRelationNumericId(params.categoryIdeasoftId);
  const cur = params.currencyIdeasoftNumericId;
  const cStr = (params.categoryIdeasoftId ?? '').trim();

  const enc = (s: string) => encodeURIComponent(s);

  const layers: Record<string, unknown>[] = [];

  const pushIf = (o: Record<string, unknown>) => {
    if (Object.keys(o).length > 0) layers.push(o);
  };

  const iriAdmin = (resource: 'categories' | 'currencies', id: string): string | null => {
    if (!baseNorm || !id.trim()) return null;
    return `${baseNorm}/admin-api/${resource}/${enc(id.trim())}`;
  };
  const iriApi = (resource: 'categories' | 'currencies', id: string): string | null => {
    if (!baseNorm || !id.trim()) return null;
    return `${baseNorm}/api/${resource}/${enc(id.trim())}`;
  };

  if (baseNorm) {
    const o: Record<string, unknown> = {};
    const ci = cStr ? iriAdmin('categories', cStr) : null;
    const cui = cur != null ? iriAdmin('currencies', String(cur)) : null;
    if (ci) o.category = { '@id': ci };
    if (cui) o.currency = { '@id': cui };
    pushIf(o);
  }
  if (baseNorm) {
    const o: Record<string, unknown> = {};
    const ci = cStr ? iriApi('categories', cStr) : null;
    const cui = cur != null ? iriApi('currencies', String(cur)) : null;
    if (ci) o.category = { '@id': ci };
    if (cui) o.currency = { '@id': cui };
    pushIf(o);
  }
  {
    const o: Record<string, unknown> = {};
    if (cNum != null) o.category = cNum;
    if (cur != null) o.currency = cur;
    pushIf(o);
  }
  {
    const o: Record<string, unknown> = {};
    if (cNum != null) o.category = { id: cNum };
    if (cur != null) o.currency = { id: cur };
    pushIf(o);
  }
  if (baseNorm) {
    const o: Record<string, unknown> = {};
    if (cStr) {
      const u = iriAdmin('categories', cStr);
      if (u) o.category = u;
    }
    if (cur != null) {
      const u = iriAdmin('currencies', String(cur));
      if (u) o.currency = u;
    }
    pushIf(o);
  }
  if (baseNorm) {
    const o: Record<string, unknown> = {};
    if (cStr) {
      const u = iriApi('categories', cStr);
      if (u) o.category = u;
    }
    if (cur != null) {
      const u = iriApi('currencies', String(cur));
      if (u) o.currency = u;
    }
    pushIf(o);
  }

  if (layers.length === 0) layers.push({});

  return layers;
}

/**
 * Ürün kaydından sonra marka atama (POST gövdesinde brand göndermek Ideasoft’ta güvenilir değil).
 * Sıra: özel change_* yolları → PATCH → yalnızca marka alanı PUT → GET+temizle+PUT.
 */
async function ideasoftApplyProductBrandAfterUpsert(
  storeBase: string,
  accessToken: string,
  productId: string,
  brandIdeasoftId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string; raw?: unknown }> {
  const raw = brandIdeasoftId.trim();
  if (!raw) return { ok: true };
  const n = parseIdeasoftRelationNumericId(brandIdeasoftId);
  const pid = encodeURIComponent(productId);

  /** IRI bu API’de tutarlı şekilde reddediliyor; yalnızca sayısal / id gövdeleri (alt istek sayısı sınırı) */
  const bodiesBrandOnly: Record<string, unknown>[] = [];
  if (n != null) {
    bodiesBrandOnly.push({ brand: n });
    bodiesBrandOnly.push({ brand: { id: n } });
    bodiesBrandOnly.push({ brandId: n });
    bodiesBrandOnly.push({ productBrand: n });
  }

  const seen = new Set<string>();
  const deduped = bodiesBrandOnly.filter((b) => {
    const k = JSON.stringify(b);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  if (deduped.length === 0) {
    return {
      ok: false,
      status: 400,
      error:
        'Ideasoft marka eşlemesi sayısal kimlik olmalı (örn. 12). Harf/slug ile eşleme bu uçta desteklenmiyor.',
    };
  }

  const patchPath = `/products/${pid}`;

  for (const body of deduped) {
    for (const ct of ['application/merge-patch+json', 'application/json'] as const) {
      const res = await ideasoftApiFetch(storeBase, accessToken, patchPath, {
        method: 'PATCH',
        headers: { 'Content-Type': ct, Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      const rawJson = await res.json().catch(() => ({}));
      if (res.ok) return { ok: true };
      if (res.status === 404 || res.status === 405) break;
      if (res.status === 401 || res.status === 403) {
        return { ok: false, status: res.status, error: parseIdeasoftHttpError(res.status, rawJson, ''), raw: rawJson };
      }
      if (res.status !== 400 && res.status !== 422) break;
    }
  }

  const subPaths = [
    `/products/${pid}/change_brand`,
    `/products/${pid}/change-brand`,
    `/products/${pid}/changeBrand`,
    `/products/${pid}/set_brand`,
  ];

  for (const p of subPaths) {
    for (const body of deduped) {
      const res = await ideasoftApiFetch(storeBase, accessToken, p, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      const rawJson = await res.json().catch(() => ({}));
      if (res.ok) return { ok: true };
      if (res.status === 404) break;
      if (res.status === 401 || res.status === 403) {
        return { ok: false, status: res.status, error: parseIdeasoftHttpError(res.status, rawJson, ''), raw: rawJson };
      }
      if (res.status !== 400 && res.status !== 422) break;
    }
  }

  for (const body of deduped) {
    const res = await ideasoftApiFetch(storeBase, accessToken, patchPath, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const rawJson = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: res.status, error: parseIdeasoftHttpError(res.status, rawJson, ''), raw: rawJson };
    }
    if (res.status !== 400 && res.status !== 422) break;
  }

  if (n != null) {
    const g = await ideasoftGetProduct(storeBase, accessToken, productId);
    if (g.ok) {
      const r = { ...(g.raw as Record<string, unknown>) };
      for (const k of Object.keys(r)) {
        if (k.startsWith('@') || k.startsWith('hydra:')) delete r[k];
      }
      r.brand = n;
      const res = await ideasoftApiFetch(storeBase, accessToken, patchPath, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(r),
      });
      const rawJson = await res.json().catch(() => ({}));
      if (res.ok) return { ok: true };
      return { ok: false, status: res.status, error: parseIdeasoftHttpError(res.status, rawJson, ''), raw: rawJson };
    }
  }

  return {
    ok: false,
    status: 400,
    error:
      'Marka Ideasoft ürününe yazılamadı (PATCH/PUT/change_brand ve tam gövde denendi). Mağaza API sürümünü veya marka eşlemesini kontrol edin.',
  };
}

/** Tek ürün GET — [Product GET](https://apidoc.ideasoft.dev/docs/admin-api/cgov84whtjhzn-product-get) */
export async function ideasoftGetProduct(
  storeBase: string,
  accessToken: string,
  productId: string
): Promise<{ ok: true; raw: Record<string, unknown> } | { ok: false; status: number; error: string }> {
  const res = await ideasoftApiFetch(storeBase, accessToken, `/products/${encodeURIComponent(productId)}`, {
    method: 'GET',
    headers: { Accept: 'application/json, application/ld+json' },
  });
  const rawText = await res.text();
  let raw: Record<string, unknown> = {};
  try {
    raw = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
  } catch {
    return { ok: false, status: res.status, error: 'Ideasoft ürün yanıtı JSON değil' };
  }
  if (!res.ok) {
    return { ok: false, status: res.status, error: parseIdeasoftHttpError(res.status, raw, rawText) };
  }
  return { ok: true, raw };
}

/**
 * Ürün kategorisini değiştirir — [ChangeCategoryAction PUT](https://apidoc.ideasoft.dev/docs/admin-api/zlywejrq617xq-product-change-category-action-put)
 */
export async function ideasoftChangeProductCategory(
  storeBase: string,
  accessToken: string,
  productId: string,
  categoryIdeasoftId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const catIri = ideasoftRelationIri(storeBase, 'categories', categoryIdeasoftId);
  const bodies: Record<string, unknown>[] = [
    { category: catIri },
    { category: `/admin-api/categories/${categoryIdeasoftId}` },
    { category: { id: parseInt(categoryIdeasoftId, 10) } },
  ];
  const paths = [
    `/products/${encodeURIComponent(productId)}/change_category`,
    `/products/${encodeURIComponent(productId)}/change-category`,
  ];
  let lastErr = 'Kategori güncellenemedi';
  let lastStatus = 500;
  for (const path of paths) {
    for (const body of bodies) {
      const res = await ideasoftApiFetch(storeBase, accessToken, path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      const rawText = await res.text();
      let raw: Record<string, unknown> = {};
      try {
        raw = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
      } catch {
        /* ignore */
      }
      if (res.ok) return { ok: true };
      lastErr = parseIdeasoftHttpError(res.status, raw, rawText);
      lastStatus = res.status;
      if (res.status === 401 || res.status === 403) return { ok: false, status: res.status, error: lastErr };
      if (res.status !== 400 && res.status !== 422) break;
    }
  }
  return { ok: false, status: lastStatus, error: lastErr };
}

/** ISO 4217 (TRY, USD, EUR); geçersizse TRY */
function normalizeIdeasoftCurrencyCode(code: string | undefined | null): string {
  const c = (code ?? 'TRY').trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(c)) return c;
  return 'TRY';
}

/** Ürün slug'u: önce SKU, boşsa isim; Ideasoft benzersizlik için timestamp eki */
function makeProductSlug(sku: string, name: string): string {
  const fromSku = sku.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (fromSku.length >= 2) return fromSku;
  const fromName = slugify(name) || `urun-${Date.now()}`;
  return fromName;
}

/**
 * Ideasoft para birimi kod eşleme: ISO 4217 → Ideasoft'ta kullanılan kod varyantları.
 * Örn: "TRY" → ["TRY", "TL", "LIRA"] (Ideasoft Türkçe kurulumlar "TL" kullanır).
 */
const IDEASOFT_CURRENCY_ALIASES: Record<string, string[]> = {
  TRY: ['TRY', 'TL', 'LIRA', '₺'],
  USD: ['USD', 'US', 'DOLAR', '$'],
  EUR: ['EUR', 'EURO', '€'],
  GBP: ['GBP', 'POUND', '£'],
};

function ideasoftCurrencyMatches(oCode: string, targetIso: string): boolean {
  const oc = oCode.trim().toUpperCase();
  const tc = targetIso.trim().toUpperCase();
  if (oc === tc) return true;
  const aliases = IDEASOFT_CURRENCY_ALIASES[tc] ?? [];
  return aliases.some((a) => a.toUpperCase() === oc);
}

/**
 * Mağazadaki Currency kaydının sayısal kimliği.
 * Cloudflare Workers alt istek limiti için: tek koleksiyon yolu + en fazla 3 hydra sayfa (ideasoftApiFetch içi dahil).
 */
async function ideasoftResolveCurrencyNumericId(
  storeBase: string,
  accessToken: string,
  isoCode: string
): Promise<number | null> {
  const base = normalizeStoreBase(storeBase);
  const targetIso = isoCode.trim().toUpperCase();

  const toNumericId = (o: Record<string, unknown>): number | null => {
    if (o.id == null) return null;
    const n = typeof o.id === 'number' ? o.id : parseInt(String(o.id).trim(), 10);
    return !Number.isNaN(n) ? n : null;
  };

  let nextPath: string | null = '/currencies';
  let pages = 0;
  const maxPages = 3;

  while (nextPath && pages < maxPages) {
    pages++;
    const res = await ideasoftApiFetch(base, accessToken, nextPath, {
      method: 'GET',
      headers: { Accept: 'application/json, application/ld+json' },
    }).catch(() => null);
    if (!res || !res.ok) break;
    const rawText = await res.text();
    let raw: Record<string, unknown> | unknown[] = {};
    try {
      raw = rawText ? (JSON.parse(rawText) as Record<string, unknown> | unknown[]) : {};
    } catch {
      break;
    }
    const arr = Array.isArray(raw) ? raw : (raw as Record<string, unknown>);
    const members = extractHydraMembers(arr as Record<string, unknown> | unknown[]);
    for (const m of members) {
      const o = m as Record<string, unknown>;
      const oCode =
        (typeof o.code === 'string' ? o.code :
         typeof o.iso === 'string' ? o.iso :
         typeof o.isoCode === 'string' ? o.isoCode : '').trim().toUpperCase();
      if (!ideasoftCurrencyMatches(oCode, targetIso)) continue;
      const nid = toNumericId(o);
      if (nid != null) return nid;
    }
    const nextObj = Array.isArray(raw) ? null : hydraNextPath(raw as Record<string, unknown>);
    nextPath = nextObj;
  }
  return null;
}

/** Ürün oluştur / güncelle — [Product POST](https://apidoc.ideasoft.dev/docs/admin-api/8pzfiy7v4vow9-product-post) / [PUT](https://apidoc.ideasoft.dev/docs/admin-api/p7r7yfxlfjma9-product-put) */
export async function ideasoftUpsertProduct(params: {
  storeBase: string;
  accessToken: string;
  existingId?: string | null;
  sku: string;
  name: string;
  description: string;
  price: number;
  quantity: number;
  /** ISO 4217; ürün fiyatındaki para birimi (product_currencies.code) */
  currency?: string | null;
  /** Eşleştirme sayfalarından gelen Ideasoft kategori / marka id */
  categoryIdeasoftId?: string | null;
  brandIdeasoftId?: string | null;
}): Promise<
  | { ok: true; id: string; raw: unknown; brandWarning?: string }
  | { ok: false; status: number; error: string; raw?: unknown }
> {
  const { storeBase, accessToken, existingId, sku, name, description, price, quantity, categoryIdeasoftId, brandIdeasoftId } =
    params;
  const base = normalizeStoreBase(storeBase);
  const isoCode = normalizeIdeasoftCurrencyCode(params.currency);

  /** API Platform şemaları float bekler; string "99.00" → 400 */
  const listPrice = parseFloat(price.toFixed(2));
  const stockAmount = Math.max(0, Math.floor(quantity));
  /** slug — POST için genellikle zorunlu; PUT için mevcut değere dokunmaz */
  const slug = makeProductSlug(sku, name);

  const currencyNumericId = await ideasoftResolveCurrencyNumericId(base, accessToken, isoCode).catch(() => null);

  const relationLayers = buildIdeasoftProductCategoryCurrencyLayers({
    storeBase: base,
    categoryIdeasoftId,
    currencyIdeasoftNumericId: currencyNumericId,
  });

  /* 2 şablon yeterli; fazla varyant Workers alt istek limitini aşıyordu */
  const baseTemplates: Record<string, unknown>[] = [
    {
      sku,
      name,
      slug,
      shortDescription: description.slice(0, 500),
      longDescription: description,
      stockAmount,
      listPrice,
      status: 1,
    },
    {
      sku,
      name,
      slug,
      shortDescription: description.slice(0, 500),
      longDescription: description,
      stockAmount,
      listPrice,
      status: 'ACTIVE',
    },
  ];

  const tryBodies: Record<string, unknown>[] = [];
  for (const layer of relationLayers) {
    for (const tpl of baseTemplates) {
      tryBodies.push({ ...tpl, ...layer });
    }
  }

  const seenJson = new Set<string>();
  const dedupedTryBodies: Record<string, unknown>[] = [];
  for (const b of tryBodies) {
    const key = JSON.stringify(b);
    if (seenJson.has(key)) continue;
    seenJson.add(key);
    dedupedTryBodies.push(b);
  }

  const path = existingId ? `/products/${encodeURIComponent(existingId)}` : '/products';
  const method = existingId ? 'PUT' : 'POST';

  /** PUT: slug read-only; aynı gövdeleri slug'suz tekrarla (limit: Workers alt istek sayısı) */
  const tryBodiesForMethod = existingId
    ? [
        ...dedupedTryBodies,
        ...dedupedTryBodies.map((b) => {
          const { slug: _s, ...rest } = b as Record<string, unknown>;
          return rest;
        }),
      ]
    : dedupedTryBodies;

  let lastErr = '';
  let lastStatus = 500;
  let lastRaw: unknown;
  attemptLoop: for (const body of tryBodiesForMethod) {
    const doReq = (ct: string) =>
      ideasoftApiFetch(storeBase, accessToken, path, {
        method,
        headers: { 'Content-Type': ct },
        body: JSON.stringify(body),
      });

    let res = await doReq('application/json');
    let raw = await res.json().catch(() => ({}));
    if (res.status === 415) {
      res = await doReq('application/ld+json');
      raw = await res.json().catch(() => ({}));
    }
    lastRaw = raw;
    lastStatus = res.status;
    if (res.ok) {
      let id =
        (raw as { id?: string | number }).id != null
          ? String((raw as { id?: string | number }).id)
          : (raw as { data?: { id?: string } })?.data?.id != null
            ? String((raw as { data?: { id?: string } }).data?.id)
            : existingId || '';
      if (!id && !existingId) {
        const found = await ideasoftFindProductIdBySku(storeBase, accessToken, sku, { maxPaths: 1 });
        if (found) id = found;
      }
      if (id) {
        const b = (brandIdeasoftId ?? '').trim();
        if (b) {
          const br = await ideasoftApplyProductBrandAfterUpsert(storeBase, accessToken, id, b);
          if (!br.ok) {
            return {
              ok: true,
              id,
              raw,
              brandWarning: br.error,
            };
          }
        }
        return { ok: true, id, raw };
      }
      lastErr = 'Yanıtta ürün kimliği yok';
      continue;
    }
    const o = raw as Record<string, unknown>;
    const detail =
      (typeof o.detail === 'string' && o.detail.trim()) ||
      (typeof o.message === 'string' && o.message.trim()) ||
      (typeof o['hydra:description'] === 'string' && (o['hydra:description'] as string).trim()) ||
      (typeof o.error === 'string' && o.error.trim()) ||
      (typeof o.errorMessage === 'string' && o.errorMessage.trim()) ||
      '';
    const violationsText = Array.isArray(o.violations)
      ? (o.violations as Array<{ propertyPath?: string; message?: string }>)
          .map((v) => `${v.propertyPath ? v.propertyPath + ': ' : ''}${v.message ?? ''}`)
          .filter(Boolean)
          .join('; ')
      : '';
    lastErr = [detail, violationsText].filter(Boolean).join(' | ') || `HTTP ${res.status}`;
    if (res.status !== 400 && res.status !== 422) break;
  }

  /** Bazı kurulumlar ürün oluştururken markayı aynı istekte sayı olarak ister (ayrı PATCH kabul etmez) */
  const brandNumFallback = parseIdeasoftRelationNumericId(brandIdeasoftId);
  if (brandNumFallback != null) {
    const withBrand: Record<string, unknown>[] = [];
    const seen2 = new Set<string>();
    for (const b of dedupedTryBodies) {
      const merged = { ...b, brand: brandNumFallback };
      const key = JSON.stringify(merged);
      if (seen2.has(key)) continue;
      seen2.add(key);
      withBrand.push(merged);
    }
    const tryWithBrand = existingId
      ? [
          ...withBrand,
          ...withBrand.map((b) => {
            const { slug: _s, ...rest } = b as Record<string, unknown>;
            return rest;
          }),
        ]
      : withBrand;

    for (const body of tryWithBrand) {
      const doReq = (ct: string) =>
        ideasoftApiFetch(storeBase, accessToken, path, {
          method,
          headers: { 'Content-Type': ct },
          body: JSON.stringify(body),
        });

      let res = await doReq('application/json');
      let raw = await res.json().catch(() => ({}));
      if (res.status === 415) {
        res = await doReq('application/ld+json');
        raw = await res.json().catch(() => ({}));
      }
      lastRaw = raw;
      lastStatus = res.status;
      if (res.ok) {
        let id =
          (raw as { id?: string | number }).id != null
            ? String((raw as { id?: string | number }).id)
            : (raw as { data?: { id?: string } })?.data?.id != null
              ? String((raw as { data?: { id?: string } }).data?.id)
              : existingId || '';
        if (!id && !existingId) {
          const found = await ideasoftFindProductIdBySku(storeBase, accessToken, sku, { maxPaths: 1 });
          if (found) id = found;
        }
        if (id) {
          return { ok: true, id, raw };
        }
        lastErr = 'Yanıtta ürün kimliği yok';
        continue;
      }
      const o = raw as Record<string, unknown>;
      const detail =
        (typeof o.detail === 'string' && o.detail.trim()) ||
        (typeof o.message === 'string' && o.message.trim()) ||
        (typeof o['hydra:description'] === 'string' && (o['hydra:description'] as string).trim()) ||
        (typeof o.error === 'string' && o.error.trim()) ||
        (typeof o.errorMessage === 'string' && o.errorMessage.trim()) ||
        '';
      const violationsText = Array.isArray(o.violations)
        ? (o.violations as Array<{ propertyPath?: string; message?: string }>)
            .map((v) => `${v.propertyPath ? v.propertyPath + ': ' : ''}${v.message ?? ''}`)
            .filter(Boolean)
            .join('; ')
        : '';
      lastErr = [detail, violationsText].filter(Boolean).join(' | ') || `HTTP ${res.status}`;
      if (res.status !== 400 && res.status !== 422) break;
    }
  }

  return { ok: false, status: lastStatus, error: lastErr || 'Ideasoft ürün API hatası', raw: lastRaw };
}

/** SKU ile mevcut ürün ara (hydra:member veya dizi) */
export async function ideasoftFindProductIdBySku(
  storeBase: string,
  accessToken: string,
  sku: string,
  opts?: { maxPaths?: number }
): Promise<string | null> {
  const q = encodeURIComponent(sku.trim());
  const paths = [
    `/products?sku=${q}`,
    `/products?code=${q}`,
    `/products?search=${q}`,
  ];
  const maxPaths = opts?.maxPaths ?? paths.length;
  for (let i = 0; i < Math.min(maxPaths, paths.length); i++) {
    const p = paths[i];
    const res = await ideasoftApiFetch(storeBase, accessToken, p, { method: 'GET' });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) continue;
    const hydra = (raw as { 'hydra:member'?: Array<{ id?: string | number; sku?: string; code?: string }> })['hydra:member'];
    if (Array.isArray(hydra)) {
      const hit = hydra.find((m) => String(m.sku || m.code || '') === sku.trim());
      if (hit?.id != null) return String(hit.id);
    }
    const data = (raw as { data?: unknown[] }).data;
    if (Array.isArray(data) && data.length > 0) {
      const first = data[0] as { id?: string | number };
      if (first?.id != null) return String(first.id);
    }
  }
  return null;
}

/** Admin API — düz kategori listesi (hiyerarşi parent üzerinden kurulur) */
export type IdeasoftCategory = {
  id: string;
  name: string;
  /** Üst kategori yoksa null */
  parentId: string | null;
  sortOrder?: number;
  /** Ad yoksa veya sadece sayıysa gösterim için */
  slug?: string;
  /** API’de alt kategori var mı (çekim sırasında kullanılır; isteğe bağlı) */
  hasChildren?: boolean;
};

function extractIdFromIri(iri: string): string | null {
  const t = iri.trim().replace(/\?.*$/, '');
  const m = t.match(/\/(\d+)(?:\/)?$/);
  if (m) return m[1];
  const mUuid = t.match(/\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?:\/)?$/i);
  if (mUuid) return mUuid[1];
  const parts = t.split('/').filter(Boolean);
  const last = parts[parts.length - 1];
  if (!last) return null;
  if (/^\d+$/.test(last) || /^[a-f0-9-]{36}$/i.test(last)) return last;
  return last;
}

function parseIdeasoftCategoryParent(o: Record<string, unknown>): string | null {
  const keys = ['parent', 'parentCategory', 'parentId', 'parent_id', 'categoryParent'];
  for (const k of keys) {
    const p = o[k];
    if (p == null || p === '') continue;
    if (typeof p === 'string') {
      const id = extractIdFromIri(p) || p.trim();
      if (id) return id;
    }
    if (typeof p === 'object' && p !== null) {
      const po = p as Record<string, unknown>;
      if (po.id != null && String(po.id).trim()) return String(po.id).trim();
      if (typeof po['@id'] === 'string') {
        const id = extractIdFromIri(po['@id']);
        if (id) return id;
      }
    }
  }
  return null;
}

/** Ideasoft API'de kategori adı string, i18n objesi veya farklı alan adlarıyla gelebilir */
function extractIdeasoftCategoryName(o: Record<string, unknown>): string {
  const slug =
    typeof o.slug === 'string' && o.slug.trim()
      ? o.slug.trim().replace(/-/g, ' ')
      : '';

  const stringFields = ['name', 'title', 'label', 'categoryName', 'category_name', 'displayName'] as const;
  for (const key of stringFields) {
    const v = o[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }

  const nameVal = o.name;
  if (nameVal != null && typeof nameVal === 'object' && !Array.isArray(nameVal)) {
    const obj = nameVal as Record<string, unknown>;
    for (const k of ['tr', 'TR', 'tr-TR', 'default', 'name']) {
      const v = obj[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    for (const v of Object.values(obj)) {
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
  }

  const trans = o.translations;
  if (trans && typeof trans === 'object' && !Array.isArray(trans)) {
    const t = trans as Record<string, unknown>;
    if (typeof t.name === 'string' && t.name.trim()) return t.name.trim();
    if (typeof t.title === 'string' && t.title.trim()) return t.title.trim();
    for (const v of Object.values(t)) {
      if (typeof v === 'string' && v.trim()) return v.trim();
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const inner = v as Record<string, unknown>;
        if (typeof inner.name === 'string' && inner.name.trim()) return inner.name.trim();
      }
    }
  }

  if (slug) return slug;
  return '';
}

function parseIdeasoftCategoryItem(item: unknown): IdeasoftCategory | null {
  if (typeof item === 'string') {
    const id = extractIdFromIri(item);
    if (!id) return null;
    return { id, name: id, parentId: null };
  }
  if (!item || typeof item !== 'object') return null;
  const o = item as Record<string, unknown>;

  // Sadece aktif (status=1) kategoriler
  if (o.status != null && Number(o.status) !== 1) return null;

  // Silinmiş kategorileri atla (deletedAt, deleted, is_deleted)
  if (o.deletedAt != null && o.deletedAt !== '' && o.deletedAt !== false) return null;
  if (o.deleted === true || o.deleted === 1) return null;
  if (o.is_deleted === true || o.is_deleted === 1 || o.is_deleted === '1') return null;

  let idStr: string | null = null;
  if (o.id != null && String(o.id).trim()) idStr = String(o.id).trim();
  else if (typeof o['@id'] === 'string') idStr = extractIdFromIri(o['@id']);
  if (!idStr) return null;

  const nameFromFields = extractIdeasoftCategoryName(o);
  const name = nameFromFields.trim() || idStr;

  const parentId = parseIdeasoftCategoryParent(o);

  const sortOrderRaw = o.sortOrder ?? o.sort_order;
  const sortOrder =
    typeof sortOrderRaw === 'number'
      ? sortOrderRaw
      : typeof sortOrderRaw === 'string' && sortOrderRaw !== ''
        ? parseInt(sortOrderRaw, 10)
        : undefined;

  const slugStr = typeof o.slug === 'string' && o.slug.trim() ? o.slug.trim() : undefined;

  const hcRaw = o.hasChildren ?? o.has_children;
  const hasChildren =
    hcRaw === 1 || hcRaw === true || hcRaw === '1' || hcRaw === 'true';

  return {
    id: idStr,
    name,
    parentId,
    ...(sortOrder !== undefined ? { sortOrder } : {}),
    ...(slugStr ? { slug: slugStr } : {}),
    ...(hasChildren ? { hasChildren: true } : {}),
  };
}

/** Admin API’de koleksiyon yolu mağazaya göre değişebilir; sırayla dene. */
/**
 * Admin API'de koleksiyon yolu mağazaya göre değişebilir; sırayla dene.
 * status=1 ile sadece aktif kategoriler istenir (silinmemiş + yayında).
 */
/**
 * Admin API'de koleksiyon yolu mağazaya göre değişebilir; sırayla dene.
 * status=1 filtresi sorgu parametresi olarak gönderilmez — bildirilmemiş filtreler
 * API Platform'da 400 döndürebilir; filtreleme parseIdeasoftCategoryItem'de yapılır.
 */
const IDEASOFT_CATEGORY_COLLECTION_PATHS = [
  '/categories?pagination=false',
  '/categories?itemsPerPage=250&page=1',
  '/categories?itemsPerPage=100',
  '/categories',
  '/categories/search_tree',
  '/product_categories?pagination=false',
  '/product_categories?itemsPerPage=250&page=1',
  '/product_categories?itemsPerPage=100',
  '/product-categories?pagination=false',
  '/product-categories?itemsPerPage=100',
];

const categoryFetchInit: RequestInit = {
  method: 'GET',
  headers: { Accept: 'application/ld+json, application/json' },
};

/**
 * Tüm kategorileri çeker (hydra sayfalama).
 * @see GET /admin-api/categories (veya product_categories)
 */
export async function ideasoftFetchCategories(
  storeBase: string,
  accessToken: string
): Promise<{ ok: true; categories: IdeasoftCategory[] } | { ok: false; error: string }> {
  type RawJson = Record<string, unknown> | unknown[];
  const byId = new Map<string, IdeasoftCategory>();
  let gotAnyOkResponse = false;

  const mergePage = (raw: RawJson) => {
    for (const m of extractHydraMembers(raw)) {
      const c = parseIdeasoftCategoryItem(m);
      if (c) byId.set(c.id, c);
    }
  };

  for (const path of IDEASOFT_CATEGORY_COLLECTION_PATHS) {
    let nextPath: string | null = path;
    while (nextPath) {
      const res = await ideasoftApiFetch(storeBase, accessToken, nextPath, categoryFetchInit, {
        retryEmptyJsonCollection: true,
      });
      const rawText = await res.text();
      let raw: RawJson = {};
      try {
        raw = rawText ? (JSON.parse(rawText) as RawJson) : {};
      } catch {
        return { ok: false, error: 'Ideasoft kategori yanıtı JSON değil' };
      }
      if (!res.ok) {
        if (res.status === 404) break;
        const err = parseIdeasoftHttpError(res.status, raw as Record<string, unknown>, rawText);
        return { ok: false, error: err };
      }
      gotAnyOkResponse = true;
      mergePage(raw);
      nextPath = Array.isArray(raw) ? null : hydraNextPath(raw as Record<string, unknown>);
    }
  }

  if (byId.size === 0) {
    if (!gotAnyOkResponse) {
      return {
        ok: false,
        error:
          'Ideasoft kategori API yolu bulunamadı (404). OAuth uygulamasında kategori okuma izni olduğundan emin olun; Ideasoft dokümantasyonundaki Category koleksiyon yolunu kontrol edin.',
      };
    }
    return { ok: true, categories: [] };
  }

  const subPathFns = [
    (id: string) => `/categories/${id}/sub_categories`,
    (id: string) => `/categories?parent=${id}&pagination=false`,
    (id: string) => `/categories?parentId=${id}&pagination=false`,
  ];

  const fetchSubCategoriesForParent = async (parentId: string): Promise<IdeasoftCategory[]> => {
    const batch: IdeasoftCategory[] = [];
    for (const pathFn of subPathFns) {
      batch.length = 0;
      let subNext: string | null = pathFn(parentId);
      while (subNext) {
        const res = await ideasoftApiFetch(storeBase, accessToken, subNext, categoryFetchInit);
        if (!res.ok) break;
        const txt = await res.text();
        let rawSub: RawJson = {};
        try {
          rawSub = txt ? (JSON.parse(txt) as RawJson) : {};
        } catch {
          break;
        }
        for (const m of extractHydraMembers(rawSub)) {
          const c = parseIdeasoftCategoryItem(m);
          if (c) {
            const withParent: IdeasoftCategory = !c.parentId ? { ...c, parentId: parentId } : c;
            batch.push(withParent);
          }
        }
        subNext = Array.isArray(rawSub) ? null : hydraNextPath(rawSub as Record<string, unknown>);
      }
      if (batch.length > 0) return [...batch];
    }
    return [];
  };

  /** Köklerden başlayarak her düzeyde alt kategorileri çek (yalnızca kök + bir seviye değil). */
  const subFetchedParents = new Set<string>();
  const queue: string[] = [];
  for (const c of byId.values()) {
    if (c.parentId === null) queue.push(c.id);
  }
  const maxSubFetches = 4000;
  while (queue.length > 0 && subFetchedParents.size < maxSubFetches) {
    const id = queue.shift()!;
    if (subFetchedParents.has(id)) continue;
    subFetchedParents.add(id);
    const subs = await fetchSubCategoriesForParent(id);
    for (const nc of subs) {
      if (!byId.has(nc.id)) {
        byId.set(nc.id, nc);
        queue.push(nc.id);
      }
    }
  }

  return { ok: true, categories: [...byId.values()] };
}

/** Admin API — mağaza markaları (düz liste) */
export type IdeasoftBrand = {
  id: string;
  name: string;
  slug?: string;
};

function parseIdeasoftBrandItem(item: unknown): IdeasoftBrand | null {
  if (typeof item === 'string') {
    const id = extractIdFromIri(item);
    if (!id) return null;
    return { id, name: id };
  }
  if (!item || typeof item !== 'object') return null;
  const o = item as Record<string, unknown>;

  if (o.status != null && Number(o.status) !== 1) return null;
  if (o.deletedAt != null && o.deletedAt !== '' && o.deletedAt !== false) return null;
  if (o.deleted === true || o.deleted === 1) return null;
  if (o.is_deleted === true || o.is_deleted === 1 || o.is_deleted === '1') return null;

  let idStr: string | null = null;
  if (o.id != null && String(o.id).trim()) idStr = String(o.id).trim();
  else if (typeof o['@id'] === 'string') idStr = extractIdFromIri(o['@id']);
  if (!idStr) return null;

  const nameRaw =
    (typeof o.name === 'string' && o.name.trim()) ||
    (typeof o.title === 'string' && o.title.trim()) ||
    (typeof o.label === 'string' && o.label.trim()) ||
    '';
  const name = nameRaw || idStr;
  const slugStr = typeof o.slug === 'string' && o.slug.trim() ? o.slug.trim() : undefined;

  return { id: idStr, name, ...(slugStr ? { slug: slugStr } : {}) };
}

const IDEASOFT_BRAND_COLLECTION_PATHS = [
  '/brands?pagination=false',
  '/brands?itemsPerPage=250&page=1',
  '/brands?itemsPerPage=100',
  '/brands',
  '/product_brands?pagination=false',
  '/product_brands?itemsPerPage=250&page=1',
  '/product_brands?itemsPerPage=100',
  '/product-brands?pagination=false',
  '/manufacturers?pagination=false',
  '/manufacturers?itemsPerPage=250&page=1',
  '/manufacturers',
];

const brandFetchInit: RequestInit = {
  method: 'GET',
  headers: { Accept: 'application/ld+json, application/json' },
};

/**
 * Tüm markaları çeker (hydra sayfalama, birden fazla koleksiyon yolu birleştirilir).
 */
export async function ideasoftFetchBrands(
  storeBase: string,
  accessToken: string
): Promise<{ ok: true; brands: IdeasoftBrand[] } | { ok: false; error: string }> {
  type RawJson = Record<string, unknown> | unknown[];
  const byId = new Map<string, IdeasoftBrand>();
  let gotAnyOkResponse = false;

  const mergePage = (raw: RawJson) => {
    for (const m of extractHydraMembers(raw)) {
      const b = parseIdeasoftBrandItem(m);
      if (b) byId.set(b.id, b);
    }
  };

  for (const path of IDEASOFT_BRAND_COLLECTION_PATHS) {
    let nextPath: string | null = path;
    while (nextPath) {
      const res = await ideasoftApiFetch(storeBase, accessToken, nextPath, brandFetchInit, {
        retryEmptyJsonCollection: true,
      });
      const rawText = await res.text();
      let raw: RawJson = {};
      try {
        raw = rawText ? (JSON.parse(rawText) as RawJson) : {};
      } catch {
        return { ok: false, error: 'Ideasoft marka yanıtı JSON değil' };
      }
      if (!res.ok) {
        if (res.status === 404) break;
        const err = parseIdeasoftHttpError(res.status, raw as Record<string, unknown>, rawText);
        return { ok: false, error: err };
      }
      gotAnyOkResponse = true;
      mergePage(raw);
      nextPath = Array.isArray(raw) ? null : hydraNextPath(raw as Record<string, unknown>);
    }
  }

  if (byId.size === 0) {
    if (!gotAnyOkResponse) {
      return {
        ok: false,
        error:
          'Ideasoft marka API yolu bulunamadı veya yanıt alınamadı. OAuth uygulamasında marka okuma iznini ve Ideasoft dokümantasyonundaki Brand koleksiyon yolunu kontrol edin.',
      };
    }
    return { ok: true, brands: [] };
  }

  return { ok: true, brands: [...byId.values()] };
}

/** Türkçe dahil karakterleri URL uyumlu slug'a dönüştürür */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/İ/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/Ğ/g, 'g').replace(/Ü/g, 'u').replace(/Ş/g, 's').replace(/Ö/g, 'o').replace(/Ç/g, 'c')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/**
 * Ideasoft'ta yeni marka oluşturur (POST /brands veya /product_brands).
 */
export async function ideasoftCreateBrand(
  storeBase: string,
  accessToken: string,
  name: string
): Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }> {
  const trimmedName = name.trim();
  if (!trimmedName) return { ok: false, error: 'Marka adı gerekli.' };
  const slug = slugify(trimmedName) || `marka-${Date.now()}`;

  const postPaths = ['/brands', '/product_brands', '/manufacturers'];
  const bodies: Record<string, unknown>[] = [
    { name: trimmedName, slug, status: 1 },
    { name: trimmedName, slug, status: 1, sortOrder: 0 },
  ];

  let lastErr = 'Ideasoft marka oluşturma başarısız';
  for (const rel of postPaths) {
    for (const body of bodies) {
      const res = await ideasoftApiFetch(storeBase, accessToken, rel, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      const rawText = await res.text();
      let raw: Record<string, unknown> = {};
      try {
        raw = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
      } catch {
        /* ignore */
      }

      if (res.ok) {
        let id =
          raw.id != null
            ? String(raw.id)
            : (raw as { data?: { id?: unknown } }).data?.id != null
              ? String((raw as { data: { id: unknown } }).data.id)
              : '';
        if (!id) {
          const loc = res.headers.get('Location') || '';
          const m = loc.match(/\/(\d+)\/?$/);
          if (m) id = m[1];
        }
        if (!id) return { ok: false, error: 'Ideasoft marka oluşturuldu ama ID döndürülmedi.' };
        const createdName = typeof raw.name === 'string' ? raw.name : trimmedName;
        return { ok: true, id, name: createdName };
      }

      lastErr = parseIdeasoftHttpError(res.status, raw, rawText);
      if (res.status === 401 || res.status === 403) return { ok: false, error: lastErr };
      if (res.status === 404) break;
      if (res.status === 400 || res.status === 422) continue;
      return { ok: false, error: lastErr };
    }
  }

  return { ok: false, error: lastErr };
}

export type IdeasoftBrandDebugResult = {
  path: string;
  url: string;
  status: number;
  memberCount: number;
  rawPreview: string;
};

export async function ideasoftDebugBrands(
  storeBase: string,
  accessToken: string
): Promise<IdeasoftBrandDebugResult[]> {
  const base = normalizeStoreBase(storeBase);
  const results: IdeasoftBrandDebugResult[] = [];

  for (const path of IDEASOFT_BRAND_COLLECTION_PATHS.slice(0, 8)) {
    for (const prefix of IDEASOFT_RESOURCE_PREFIXES) {
      const rel = path.startsWith('/') ? path : `/${path}`;
      const url = `${base}/${prefix}${rel}`;
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/ld+json, application/json',
          },
        });
        const text = await res.text();
        let memberCount = 0;
        try {
          const j = JSON.parse(text) as Record<string, unknown>;
          memberCount = extractHydraMembers(j).length;
          const total = (j as { 'hydra:totalItems'?: number })['hydra:totalItems'];
          results.push({
            path: `/${prefix}${rel}`,
            url,
            status: res.status,
            memberCount: memberCount || (typeof total === 'number' ? total : 0),
            rawPreview: text.slice(0, 500),
          });
        } catch {
          results.push({ path: `/${prefix}${rel}`, url, status: res.status, memberCount: 0, rawPreview: text.slice(0, 200) });
        }
      } catch (e) {
        results.push({ path: `/${prefix}${rel}`, url, status: 0, memberCount: 0, rawPreview: String(e).slice(0, 200) });
      }
    }
  }
  return results;
}

export type IdeasoftCategoryDebugResult = {
  path: string;
  url: string;
  status: number;
  memberCount: number;
  rawPreview: string;
};

/**
 * Ideasoft'ta yeni kategori oluşturur.
 * POST /admin-api/categories  (veya /api/categories)
 *
 * Ideasoft zorunlu alanları: name, slug, status.
 * API Platform ilişki alanlarında IRI string bekler: "/admin-api/categories/6"
 * 400 alındığında parent formatı ve gövde alternatifleri sırayla denenir.
 */
export async function ideasoftCreateCategory(
  storeBase: string,
  accessToken: string,
  name: string,
  parentId?: string | null
): Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }> {
  const base = normalizeStoreBase(storeBase);
  const trimmedName = name.trim();
  const slug = slugify(trimmedName) || `kategori-${Date.now()}`;

  /**
   * Döküman formatı: POST /admin-api/categories
   * parent alanı bir obje: { "parent": { "id": 6 } }
   * Kök kategori için parent gönderilmez (veya boş obje).
   * @see https://apidoc.ideasoft.dev/docs/admin-api/fejso6cwrlaan-category-post
   */
  const bodies: Record<string, unknown>[] = parentId
    ? [
        // 1. Döküman formatı: parent obje, id integer
        { name: trimmedName, slug, status: 1, sortOrder: 0, parent: { id: parseInt(parentId, 10) } },
        // 2. id string varyant
        { name: trimmedName, slug, status: 1, sortOrder: 0, parent: { id: parentId } },
        // 3. IRI string fallback (API Platform kurulumları için)
        { name: trimmedName, slug, status: 1, sortOrder: 0, parent: `/admin-api/categories/${parentId}` },
      ]
    : [
        { name: trimmedName, slug, status: 1, sortOrder: 0 },
        { name: trimmedName, slug, status: 1, sortOrder: 0, parent: {} },
      ];

  let lastErr = 'Ideasoft kategori oluşturma başarısız';
  for (const body of bodies) {
    const res = await ideasoftApiFetch(storeBase, accessToken, '/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const rawText = await res.text();
    let raw: Record<string, unknown> = {};
    try { raw = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {}; } catch { /* ignore */ }

    if (res.ok) {
      let id =
        raw.id != null ? String(raw.id) :
        (raw as { data?: { id?: unknown } }).data?.id != null
          ? String((raw as { data: { id: unknown } }).data.id) : '';
      if (!id) {
        const loc = res.headers.get('Location') || '';
        const m = loc.match(/\/(\d+)\/?$/);
        if (m) id = m[1];
      }
      if (!id) return { ok: false, error: 'Ideasoft kategori oluşturuldu ama ID döndürülmedi.' };
      const createdName = typeof raw.name === 'string' ? raw.name : trimmedName;
      return { ok: true, id, name: createdName };
    }

    lastErr = parseIdeasoftHttpError(res.status, raw, rawText);

    // 401/403 → dur
    if (res.status === 401 || res.status === 403) return { ok: false, error: lastErr };

    // 400/422 → sonraki varyasyonu dene
    if (res.status === 400 || res.status === 422) continue;

    // Diğer hatalar → dur
    return { ok: false, error: lastErr };
  }

  return { ok: false, error: lastErr };
}

/**
 * Ideasoft'ta mevcut kategoriyi günceller.
 * PUT /admin-api/categories/{id}
 * Döküman: https://apidoc.ideasoft.dev/docs/admin-api/fejso6cwrlaan-category-post
 */
export async function ideasoftUpdateCategory(
  storeBase: string,
  accessToken: string,
  id: string,
  fields: { sortOrder?: number }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const body: Record<string, unknown> = {};
  if (fields.sortOrder !== undefined) body.sortOrder = fields.sortOrder;

  const res = await ideasoftApiFetch(storeBase, accessToken, `/categories/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.ok) return { ok: true };
  const rawText = await res.text();
  let raw: unknown = {};
  try { raw = JSON.parse(rawText); } catch { /* ignore */ }
  return { ok: false, error: parseIdeasoftHttpError(res.status, raw as Record<string, unknown>, rawText) };
}

/** Tanı: her path için Ideasoft ham yanıtını döndürür. Debug endpoint'te kullanılır. */
export async function ideasoftDebugCategories(
  storeBase: string,
  accessToken: string
): Promise<IdeasoftCategoryDebugResult[]> {
  const base = normalizeStoreBase(storeBase);
  const results: IdeasoftCategoryDebugResult[] = [];

  for (const path of IDEASOFT_CATEGORY_COLLECTION_PATHS.slice(0, 6)) {
    for (const prefix of IDEASOFT_RESOURCE_PREFIXES) {
      const rel = path.startsWith('/') ? path : `/${path}`;
      const url = `${base}/${prefix}${rel}`;
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/ld+json, application/json',
          },
        });
        const text = await res.text();
        let memberCount = 0;
        try {
          const j = JSON.parse(text) as Record<string, unknown>;
          memberCount = extractHydraMembers(j).length;
          const total = (j as { 'hydra:totalItems'?: number })['hydra:totalItems'];
          results.push({
            path: `/${prefix}${rel}`,
            url,
            status: res.status,
            memberCount: memberCount || (typeof total === 'number' ? total : 0),
            rawPreview: text.slice(0, 500),
          });
        } catch {
          results.push({ path: `/${prefix}${rel}`, url, status: res.status, memberCount: 0, rawPreview: text.slice(0, 200) });
        }
      } catch (e) {
        results.push({ path: `/${prefix}${rel}`, url, status: 0, memberCount: 0, rawPreview: String(e).slice(0, 200) });
      }
    }
  }
  return results;
}

const OAUTH_PENDING_KEY = 'ideasoft_oauth_pending';

export type IdeasoftOAuthPending = { nonce: string; exp: number; returnTo: string };

export async function saveIdeasoftOAuthPending(db: D1Database, data: IdeasoftOAuthPending): Promise<void> {
  const existing = await db.prepare(
    `SELECT id FROM app_settings WHERE category = ? AND "key" = ? AND is_deleted = 0`
  ).bind(CAT, OAUTH_PENDING_KEY).first();
  const val = JSON.stringify(data);
  if (existing) {
    await db.prepare(`UPDATE app_settings SET value = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(val, (existing as { id: number }).id).run();
  } else {
    await db.prepare(`INSERT INTO app_settings (category, "key", value) VALUES (?, ?, ?)`)
      .bind(CAT, OAUTH_PENDING_KEY, val).run();
  }
}

/** State doğrular; başarılı token alışından sonra clearIdeasoftOAuthPending çağırın */
export async function verifyIdeasoftOAuthPending(db: D1Database, state: string): Promise<IdeasoftOAuthPending | null> {
  const row = await db.prepare(
    `SELECT value FROM app_settings WHERE category = ? AND "key" = ? AND is_deleted = 0 LIMIT 1`
  ).bind(CAT, OAUTH_PENDING_KEY).first() as { value: string | null } | null;
  if (!row?.value) return null;
  let parsed: IdeasoftOAuthPending;
  try {
    parsed = JSON.parse(row.value) as IdeasoftOAuthPending;
  } catch {
    return null;
  }
  if (parsed.nonce !== state) return null;
  const now = Math.floor(Date.now() / 1000);
  if (parsed.exp < now) return null;
  return parsed;
}

export async function clearIdeasoftOAuthPending(db: D1Database): Promise<void> {
  await db.prepare(`UPDATE app_settings SET value = '', updated_at = datetime('now') WHERE category = ? AND "key" = ?`)
    .bind(CAT, OAUTH_PENDING_KEY).run();
}

export { CAT as IDEASOFT_APP_SETTINGS_CATEGORY };
