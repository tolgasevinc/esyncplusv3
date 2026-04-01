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

/** ProductCategory ilişkisi: `product` + `category` alanlarında tam Admin API IRI (PDF: ProductCategory POST/PUT). */
function ideasoftAdminApiResourceIri(
  storeBase: string,
  resource: 'products' | 'categories' | 'product_categories',
  id: string
): string {
  const b = normalizeStoreBase(storeBase);
  return `${b}/admin-api/${resource}/${encodeURIComponent(String(id).trim())}`;
}

/**
 * Kategori ilişkisi için olası IRI’lar (kuruluma göre /categories/ veya /product_categories/).
 * product_to_categories POST/PUT ve ürün alt kaynakları bazen yalnızca birini kabul eder.
 */
function ideasoftCategoryRelationIris(storeBase: string, categoryId: string): string[] {
  const b = normalizeStoreBase(storeBase);
  const id = encodeURIComponent(String(categoryId).trim());
  const uniq = new Set<string>();
  const out: string[] = [];
  const push = (s: string) => {
    if (!s || uniq.has(s)) return;
    uniq.add(s);
    out.push(s);
  };
  push(`${b}/admin-api/categories/${id}`);
  push(`${b}/admin-api/product_categories/${id}`);
  push(`${b}/api/categories/${id}`);
  push(`${b}/api/product_categories/${id}`);
  push(`/admin-api/categories/${id}`);
  push(`/admin-api/product_categories/${id}`);
  return out;
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
 * Kategori gövde katmanları.
 * Marka ve para birimi gömülü nesne olarak doğrudan ürün şablonuna ekleniyor.
 */
function buildIdeasoftProductCategoryLayers(params: {
  storeBase: string;
  categoryIdeasoftId?: string | null;
}): Record<string, unknown>[] {
  const { storeBase } = params;
  const baseNorm = normalizeStoreBase(storeBase);
  const cNum = parseIdeasoftRelationNumericId(params.categoryIdeasoftId);
  const cStr = (params.categoryIdeasoftId ?? '').trim();

  if (!cStr) return [{}];

  const enc = (s: string) => encodeURIComponent(s);
  const layers: Record<string, unknown>[] = [];
  const pushIf = (o: Record<string, unknown>) => {
    if (Object.keys(o).length > 0) layers.push(o);
  };

  if (cNum != null) pushIf({ category: cNum });
  if (cNum != null) pushIf({ category: { id: cNum } });
  if (cStr) pushIf({ category: cStr });
  if (cStr) pushIf({ category: { id: cStr } });
  if (baseNorm && cStr) {
    const adminIri = `${baseNorm}/admin-api/categories/${enc(cStr)}`;
    const adminPcIri = `${baseNorm}/admin-api/product_categories/${enc(cStr)}`;
    const apiIri = `${baseNorm}/api/categories/${enc(cStr)}`;
    const apiPcIri = `${baseNorm}/api/product_categories/${enc(cStr)}`;
    const relAdmin = `/admin-api/categories/${enc(cStr)}`;
    const relPc = `/admin-api/product_categories/${enc(cStr)}`;
    pushIf({ category: { '@id': adminIri } });
    pushIf({ category: { '@id': adminPcIri } });
    pushIf({ category: adminIri });
    pushIf({ category: adminPcIri });
    pushIf({ category: { '@id': apiIri } });
    pushIf({ category: { '@id': apiPcIri } });
    pushIf({ category: apiIri });
    pushIf({ category: apiPcIri });
    pushIf({ mainCategory: adminIri });
    pushIf({ mainCategory: adminPcIri });
    pushIf({ mainCategory: { '@id': adminIri } });
    pushIf({ mainCategory: { '@id': adminPcIri } });
    pushIf({ mainCategory: relAdmin });
    pushIf({ mainCategory: relPc });
    pushIf({ categories: [adminIri] });
    pushIf({ categories: [adminPcIri] });
    pushIf({ categories: [{ '@id': adminIri }] });
    pushIf({ categories: [{ '@id': adminPcIri }] });
    pushIf({ categories: [relAdmin] });
    pushIf({ categories: [relPc] });
  }

  if (layers.length === 0) layers.push({});

  return layers;
}

/** Tek marka GET — Ideasoft Product ilişkisi düz int/IRI kabul etmiyor; gömülü nesne için kaynak */
async function ideasoftGetBrand(
  storeBase: string,
  accessToken: string,
  brandId: string
): Promise<{ ok: true; raw: Record<string, unknown> } | { ok: false; status: number; error: string }> {
  const id = encodeURIComponent(brandId.trim());
  const paths = [`/brands/${id}`, `/product_brands/${id}`, `/manufacturers/${id}`];
  let lastStatus = 404;
  let lastErr = 'Marka bulunamadı';
  for (const p of paths) {
    const res = await ideasoftApiFetch(storeBase, accessToken, p, {
      method: 'GET',
      headers: { Accept: 'application/json, application/ld+json' },
    });
    const rawText = await res.text();
    let raw: Record<string, unknown> = {};
    try {
      raw = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
    } catch {
      if (res.status === 404) continue;
      lastStatus = res.status;
      lastErr = 'Ideasoft marka yanıtı JSON değil';
      continue;
    }
    if (res.ok) return { ok: true, raw };
    lastStatus = res.status;
    lastErr = parseIdeasoftHttpError(res.status, raw, rawText);
    if (res.status !== 404) break;
  }
  return { ok: false, status: lastStatus, error: lastErr };
}

/** Brand GET yanıtını Product yazımına uygun gömülü nesneye indirger (API Platform Admin\Model\Brand) */
function sanitizeBrandEmbeddedForProduct(raw: Record<string, unknown>): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith('@') || k.startsWith('hydra:')) continue;
    if (v === undefined) continue;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) continue;
    o[k] = v;
  }
  if (o.id == null && raw.id != null) o.id = raw.id;
  return o;
}

/**
 * Ürün kaydından sonra marka atama.
 * Düz `brand: 1` veya IRI string reddedilir; GET /brands ile alınan gömülü nesne kullanılır.
 */
async function ideasoftApplyProductBrandAfterUpsert(
  storeBase: string,
  accessToken: string,
  productId: string,
  brandIdeasoftId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string; raw?: unknown }> {
  const rawId = brandIdeasoftId.trim();
  if (!rawId) return { ok: true };

  const gb = await ideasoftGetBrand(storeBase, accessToken, rawId);
  if (!gb.ok) {
    return {
      ok: false,
      status: gb.status,
      error:
        gb.status === 404
          ? `Ideasoft’ta marka kaydı bulunamadı (id: ${rawId}). Marka eşlemesini ve Ideasoft marka listesini kontrol edin.`
          : gb.error,
    };
  }

  const emb = sanitizeBrandEmbeddedForProduct(gb.raw);
  if (emb.id == null) {
    return {
      ok: false,
      status: 400,
      error: 'Ideasoft marka yanıtında id yok; marka API yolunu kontrol edin.',
    };
  }

  const bodiesBrandOnly: Record<string, unknown>[] = [{ brand: emb }];
  const pid = encodeURIComponent(productId);
  const patchPath = `/products/${pid}`;

  for (const body of bodiesBrandOnly) {
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

  const subPaths = [`/products/${pid}/change_brand`, `/products/${pid}/change-brand`];

  for (const p of subPaths) {
    for (const body of bodiesBrandOnly) {
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

  for (const body of bodiesBrandOnly) {
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

  const g = await ideasoftGetProduct(storeBase, accessToken, productId);
  if (g.ok) {
    const r = { ...(g.raw as Record<string, unknown>) };
    for (const k of Object.keys(r)) {
      if (k.startsWith('@') || k.startsWith('hydra:')) delete r[k];
    }
    r.brand = emb;
    const res = await ideasoftApiFetch(storeBase, accessToken, patchPath, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(r),
    });
    const rawJson = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true };
    return { ok: false, status: res.status, error: parseIdeasoftHttpError(res.status, rawJson, ''), raw: rawJson };
  }

  return {
    ok: false,
    status: 400,
    error:
      'Marka Ideasoft ürününe yazılamadı (gömülü marka nesnesi ile PATCH/PUT denendi). Mağaza API izinlerini kontrol edin.',
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

/** Ideasoft kategori GET — ürün ilişkisine gömülü nesne için */
async function ideasoftGetCategory(
  storeBase: string,
  accessToken: string,
  categoryId: string
): Promise<{ ok: true; raw: Record<string, unknown> } | { ok: false; status: number; error: string }> {
  const id = encodeURIComponent(categoryId.trim());
  const paths = [`/categories/${id}`, `/product_categories/${id}`];
  let lastStatus = 404;
  let lastErr = 'Kategori bulunamadı';
  for (const p of paths) {
    const res = await ideasoftApiFetch(storeBase, accessToken, p, {
      method: 'GET',
      headers: { Accept: 'application/json, application/ld+json' },
    });
    const rawText = await res.text();
    let raw: Record<string, unknown> = {};
    try {
      raw = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
    } catch {
      if (res.status === 404) continue;
      lastStatus = res.status;
      lastErr = 'Ideasoft kategori yanıtı JSON değil';
      continue;
    }
    if (res.ok) return { ok: true, raw };
    lastStatus = res.status;
    lastErr = parseIdeasoftHttpError(res.status, raw, rawText);
    if (res.status !== 404) break;
  }
  return { ok: false, status: lastStatus, error: lastErr };
}

function sanitizeCategoryEmbeddedForProduct(raw: Record<string, unknown>): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith('@') || k.startsWith('hydra:')) continue;
    if (v === undefined) continue;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      const sub = v as Record<string, unknown>;
      if (typeof sub['@id'] === 'string') o[k] = sub['@id'];
      else if (sub.id != null) o[k] = sub.id;
      continue;
    }
    o[k] = v;
  }
  if (o.id == null && raw.id != null) o.id = raw.id;
  /** API Platform: yalnızca @id (IRI), düz id yok — product_to_categories gövdesi için sayısal id gerekir */
  if (o.id == null && typeof raw['@id'] === 'string') {
    const m = String(raw['@id']).match(/\/(?:categories|product_categories)\/(\d+)/i);
    if (m) o.id = m[1];
  }
  return o;
}

/** Ürün–kategori ilişkisi: yedek yol; Workers alt istek limiti için tek gövde + POST + en yaygın iki path */
async function ideasoftTryProductCategorySubresource(
  storeBase: string,
  accessToken: string,
  productId: string,
  categoryIri: string
): Promise<boolean> {
  const pid = encodeURIComponent(productId);
  const bodies: string[] = [
    JSON.stringify({ category: categoryIri }),
    JSON.stringify({ category: { '@id': categoryIri } }),
  ];
  const paths = [
    `/products/${pid}/categories`,
    `/products/${pid}/change_category`,
    `/products/${pid}/change-category`,
    `/products/${pid}/product_categories`,
  ];
  for (const path of paths) {
    for (const body of bodies) {
      for (const ct of ['application/json', 'application/ld+json'] as const) {
        const res = await ideasoftApiFetch(storeBase, accessToken, path, {
          method: 'POST',
          headers: { 'Content-Type': ct, Accept: 'application/json, application/ld+json' },
          body,
        });
        if (res.ok) return true;
        if (res.status === 401 || res.status === 403) return false;
      }
    }
  }
  return false;
}

function stripIdeasoftProductForNestedPut(raw: Record<string, unknown>): Record<string, unknown> {
  const r = { ...raw };
  for (const k of Object.keys(r)) {
    if (k.startsWith('@') || k.startsWith('hydra:')) delete r[k];
  }
  return r;
}

function stripProductPayloadFromUpsertResponse(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  return stripIdeasoftProductForNestedPut(raw as Record<string, unknown>);
}

/**
 * Bazı Ideasoft kurulumlarında ürün POST/PUT uzun açıklama ve SEO alanlarını eksik yazar veya
 * Symfony yalnızca snake_case kabul eder. Upsert sonrası merge-patch ile tamamlanır.
 */
export async function ideasoftPatchProductMarketingAndSeo(
  storeBase: string,
  accessToken: string,
  productId: string,
  args: {
    longDescription: string;
    pageTitle: string;
    metaDescription: string;
    metaKeywords: string;
    searchKeywords: string;
  }
): Promise<void> {
  const short = args.longDescription.slice(0, 500);
  const searchMerged =
    (args.searchKeywords ?? '').trim() || (args.metaKeywords ?? '').trim();
  const body: Record<string, unknown> = {
    longDescription: args.longDescription,
    shortDescription: short,
    long_description: args.longDescription,
    short_description: short,
    pageTitle: args.pageTitle,
    page_title: args.pageTitle,
  };
  const md = (args.metaDescription ?? '').trim();
  const mk = (args.metaKeywords ?? '').trim();
  if (md) {
    body.metaDescription = md;
    body.meta_description = md;
  }
  if (mk) {
    body.metaKeywords = mk;
    body.meta_keywords = mk;
  }
  if (searchMerged) {
    body.searchKeywords = searchMerged;
    body.search_keywords = searchMerged;
  }
  const pid = encodeURIComponent(productId);
  const path = `/products/${pid}`;
  for (const ct of ['application/merge-patch+json', 'application/json'] as const) {
    const res = await ideasoftApiFetch(storeBase, accessToken, path, {
      method: 'PATCH',
      headers: { 'Content-Type': ct, Accept: 'application/json, application/ld+json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return;
  }
}

/**
 * [ProductCategory list](https://apidoc.ideasoft.dev/) — ürüne bağlı product_to_categories satırları.
 * Farklı mağazalarda `product` filtresi IRI veya düz id olabilir.
 */
async function ideasoftListProductToCategories(
  storeBase: string,
  accessToken: string,
  productId: string
): Promise<Record<string, unknown>[]> {
  const pid = String(productId).trim();
  const b = normalizeStoreBase(storeBase);
  const productIriFull = `${b}/admin-api/products/${encodeURIComponent(pid)}`;
  /** PDF ProductCategory LIST: product= sayısal id veya tam IRI; limit ile tek sayfada toplu sonuç */
  const queryVariants = [
    `limit=100&product=${encodeURIComponent(pid)}`,
    `product=${encodeURIComponent(pid)}`,
    `product=${encodeURIComponent(productIriFull)}`,
    `limit=100&product=${encodeURIComponent(productIriFull)}`,
    `product=${pid}`,
  ];
  const paths = queryVariants.map((q) => `/product_to_categories?${q}`);
  for (const path of paths) {
    const res = await ideasoftApiFetch(
      storeBase,
      accessToken,
      path,
      {
        method: 'GET',
        headers: { Accept: 'application/json, application/ld+json' },
      },
      { retryEmptyJsonCollection: true }
    );
    if (!res.ok) continue;
    const rawText = await res.text();
    let raw: Record<string, unknown> | unknown[] = {};
    try {
      raw = rawText ? (JSON.parse(rawText) as Record<string, unknown> | unknown[]) : {};
    } catch {
      continue;
    }
    const members = extractHydraMembers(Array.isArray(raw) ? raw : raw);
    if (members.length > 0) return members as Record<string, unknown>[];
  }
  return [];
}

function extractProductToCategoryRowId(row: Record<string, unknown>): string | null {
  const id = row.id;
  if (id != null) {
    const s = String(id).trim();
    if (/^\d+$/.test(s)) return s;
  }
  const aid = row['@id'];
  if (typeof aid === 'string') {
    const m = aid.match(/\/product_to_categories\/(\d+)/i);
    if (m) return m[1];
    const tail = aid.match(/\/(\d+)\s*$/);
    if (tail && /^\d+$/.test(tail[1])) return tail[1];
  }
  return null;
}

function normalizeIdeasoftCategoryIdForCompare(raw: string | number | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (/^\d+$/.test(s)) return s;
  const m = s.match(/\/(?:categories|product_categories)\/(\d+)/i);
  if (m) return m[1];
  return null;
}

function extractCategoryIdFromEmbeddedOrIri(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'number') return normalizeIdeasoftCategoryIdForCompare(String(value));
  if (typeof value === 'string') return normalizeIdeasoftCategoryIdForCompare(value);
  if (typeof value === 'object' && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    if (o.id != null) {
      const n = normalizeIdeasoftCategoryIdForCompare(String(o.id));
      if (n) return n;
    }
    if (typeof o['@id'] === 'string') {
      const n = normalizeIdeasoftCategoryIdForCompare(o['@id']);
      if (n) return n;
    }
  }
  return null;
}

/**
 * Ürün gerçekten bu kategori id’sine bağlı mı? (PATCH/POST bazen 200 dönüp ilişkiyi kurmaz.)
 * Önce product_to_categories listesi, sonra ürün GET (category / mainCategory / categories).
 */
async function ideasoftProductHasCategoryId(
  storeBase: string,
  accessToken: string,
  productId: string,
  expectedCategoryId: string
): Promise<boolean> {
  const want = normalizeIdeasoftCategoryIdForCompare(expectedCategoryId);
  if (!want) return false;

  const checkOnce = async (): Promise<boolean> => {
    const rows = await ideasoftListProductToCategories(storeBase, accessToken, productId);
    for (const row of rows) {
      const cid = extractCategoryIdFromEmbeddedOrIri(row.category);
      if (cid && cid === want) return true;
    }
    const gp = await ideasoftGetProduct(storeBase, accessToken, productId);
    if (!gp.ok) return false;
    const r = gp.raw as Record<string, unknown>;
    for (const key of ['category', 'mainCategory', 'main_category', 'primaryCategory'] as const) {
      const cid = extractCategoryIdFromEmbeddedOrIri(r[key]);
      if (cid && cid === want) return true;
    }
    const cats = r.categories;
    if (Array.isArray(cats)) {
      for (const c of cats) {
        const cid = extractCategoryIdFromEmbeddedOrIri(c);
        if (cid && cid === want) return true;
      }
    }
    return false;
  };

  if (await checkOnce()) return true;
  await new Promise((r) => setTimeout(r, 280));
  return checkOnce();
}

/**
 * [PUT product_to_categories/{id}](https://apidoc.ideasoft.dev/) — ürün–kategori ilişki kaydı.
 * Mevcut satır yoksa POST ile oluşturmayı dener.
 * PDF: gövde `product` + `category`; birçok kurulum tam ürün nesnesi yerine Admin API IRI string kabul eder.
 */
async function ideasoftTryProductToCategoryPutOrPost(
  storeBase: string,
  accessToken: string,
  productId: string,
  categoryEmb: Record<string, unknown>,
  /** Ürün az önce POST/PUT ile oluşturulduysa GET tekrarını önler (Workers alt istek) */
  productPayloadPreload?: Record<string, unknown> | null
): Promise<boolean> {
  const catIdRaw = categoryEmb.id != null ? String(categoryEmb.id).trim() : '';
  if (!catIdRaw) return false;

  const productIri = ideasoftAdminApiResourceIri(storeBase, 'products', productId);
  const categoryIri = ideasoftAdminApiResourceIri(storeBase, 'categories', catIdRaw);
  const categoryIriProductCat = ideasoftAdminApiResourceIri(storeBase, 'product_categories', catIdRaw);
  const catNum = parseIdeasoftRelationNumericId(catIdRaw);
  const pidNum = parseIdeasoftRelationNumericId(String(productId));

  /** PDF LIST: product= sayısal veya IRI — POST/PUT gövdesinde de aynı esneklik */
  const productLightVariants: unknown[] = [
    productIri,
    pidNum != null ? pidNum : null,
    `/admin-api/products/${encodeURIComponent(String(productId).trim())}`,
  ].filter((x) => x != null);

  /** Önce hafif gövdeler (IRI / sayısal id); tam ürün nesnesi en sonda */
  const lightCategoryVariants: unknown[] = [
    categoryIri,
    categoryIriProductCat,
    `/admin-api/categories/${encodeURIComponent(catIdRaw)}`,
    `/admin-api/product_categories/${encodeURIComponent(catIdRaw)}`,
    catNum != null ? catNum : null,
    catNum != null ? { id: catNum } : null,
    { id: catIdRaw },
    categoryEmb,
  ].filter((x) => x != null);

  const rows = await ideasoftListProductToCategories(storeBase, accessToken, productId);
  const relId = rows.length > 0 ? extractProductToCategoryRowId(rows[0] as Record<string, unknown>) : null;
  const sortOrder =
    rows.length > 0 && (rows[0] as Record<string, unknown>).sortOrder != null
      ? (rows[0] as Record<string, unknown>).sortOrder
      : undefined;

  const doPut = async (rowId: string, body: Record<string, unknown>, contentType: string) =>
    ideasoftApiFetch(storeBase, accessToken, `/product_to_categories/${encodeURIComponent(rowId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': contentType, Accept: 'application/json' },
      body: JSON.stringify(body),
    });

  const doPost = async (body: Record<string, unknown>, contentType: string) =>
    ideasoftApiFetch(storeBase, accessToken, `/product_to_categories`, {
      method: 'POST',
      headers: { 'Content-Type': contentType, Accept: 'application/json' },
      body: JSON.stringify(body),
    });

  const tryLightBodies = async (method: 'PUT' | 'POST'): Promise<boolean> => {
    const relNum = relId != null ? parseInt(relId, 10) : NaN;
    for (const prod of productLightVariants) {
      for (const cat of lightCategoryVariants) {
        for (const ct of ['application/json', 'application/ld+json'] as const) {
          const base: Record<string, unknown> = { product: prod as unknown, category: cat as unknown };
          if (sortOrder !== undefined) base.sortOrder = sortOrder;
          if (method === 'PUT' && relId != null && Number.isFinite(relNum)) {
            const putBody = { id: relNum, ...base };
            const res = await doPut(relId, putBody, ct);
            if (res.ok) return true;
          } else if (method === 'POST') {
            const res = await doPost(base, ct);
            if (res.ok) return true;
            /** Çift kayıt: zaten ilişki varsa LIST + PUT */
            if (res.status === 409 || res.status === 422) {
              const again = await ideasoftListProductToCategories(storeBase, accessToken, productId);
              const rid = again.length > 0 ? extractProductToCategoryRowId(again[0] as Record<string, unknown>) : null;
              if (rid != null) {
                const n = parseInt(rid, 10);
                const pb = { id: n, ...base };
                const r2 = await ideasoftApiFetch(
                  storeBase,
                  accessToken,
                  `/product_to_categories/${encodeURIComponent(rid)}`,
                  {
                    method: 'PUT',
                    headers: { 'Content-Type': ct, Accept: 'application/json' },
                    body: JSON.stringify(pb),
                  }
                );
                if (r2.ok) return true;
              }
            }
          }
        }
      }
    }
    return false;
  };

  if (relId != null) {
    if (await tryLightBodies('PUT')) return true;
  } else {
    if (await tryLightBodies('POST')) return true;
  }

  let productPayload: Record<string, unknown>;
  if (productPayloadPreload && Object.keys(productPayloadPreload).length > 0) {
    productPayload = productPayloadPreload;
  } else {
    const gp = await ideasoftGetProduct(storeBase, accessToken, productId);
    if (!gp.ok) return false;
    productPayload = stripIdeasoftProductForNestedPut(gp.raw);
  }

  const baseBody: Record<string, unknown> = {
    product: productPayload,
    category: categoryEmb,
  };
  if (sortOrder !== undefined) baseBody.sortOrder = sortOrder;

  if (relId != null) {
    const relNum = parseInt(relId, 10);
    const putBody: Record<string, unknown> = Number.isFinite(relNum)
      ? { id: relNum, ...baseBody }
      : { ...baseBody };
    for (const ct of ['application/json', 'application/ld+json'] as const) {
      const res = await doPut(relId, putBody, ct);
      if (res.ok) return true;
    }
    return false;
  }

  for (const ct of ['application/json', 'application/ld+json'] as const) {
    const resPost = await doPost(baseBody, ct);
    if (resPost.ok) return true;
  }
  return false;
}

/**
 * Önce resmi `product_to_categories` (GET kategori + liste + PUT/POST), sonra yedek: alt kaynak → PATCH katmanları → … → tam ürün PUT.
 */
async function ideasoftApplyProductCategoryAfterUpsert(
  storeBase: string,
  accessToken: string,
  productId: string,
  categoryIdeasoftId: string,
  options?: { productPayloadFromUpsert?: Record<string, unknown> }
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const catTrim = categoryIdeasoftId.trim();
  const pid = encodeURIComponent(productId);
  const patchPath = `/products/${pid}`;
  const confirmCat = () => ideasoftProductHasCategoryId(storeBase, accessToken, productId, catTrim);

  const gc = await ideasoftGetCategory(storeBase, accessToken, catTrim);
  if (gc.ok) {
    let embPtc = sanitizeCategoryEmbeddedForProduct(gc.raw);
    if (embPtc.id == null && /^\d+$/.test(catTrim)) {
      embPtc = { id: catTrim };
    }
    if (embPtc.id != null) {
      if (
        await ideasoftTryProductToCategoryPutOrPost(
          storeBase,
          accessToken,
          productId,
          embPtc,
          options?.productPayloadFromUpsert
        )
      ) {
        if (await confirmCat()) return { ok: true };
      }
    }
  }

  for (const catIri of ideasoftCategoryRelationIris(storeBase, catTrim)) {
    if (await ideasoftTryProductCategorySubresource(storeBase, accessToken, productId, catIri)) {
      if (await confirmCat()) return { ok: true };
    }
  }

  const layers = buildIdeasoftProductCategoryLayers({ storeBase, categoryIdeasoftId: catTrim });
  const thinLayers = layers.filter((l) => Object.keys(l).length > 0).slice(0, 20);
  for (const layer of thinLayers) {
    for (const ct of ['application/json', 'application/merge-patch+json'] as const) {
      const res = await ideasoftApiFetch(storeBase, accessToken, patchPath, {
        method: 'PATCH',
        headers: { 'Content-Type': ct, Accept: 'application/json, application/ld+json' },
        body: JSON.stringify(layer),
      });
      const rawJson = await res.json().catch(() => ({}));
      if (res.ok) {
        if (await confirmCat()) return { ok: true };
      }
      if (res.status === 401 || res.status === 403) {
        return { ok: false, status: res.status, error: parseIdeasoftHttpError(res.status, rawJson, '') };
      }
      if (res.status === 404 || res.status === 405) break;
      if (res.status !== 400 && res.status !== 415 && res.status !== 422) break;
    }
  }

  if (!gc.ok) {
    return {
      ok: false,
      status: gc.status,
      error:
        gc.status === 404
          ? `Ideasoft’ta kategori bulunamadı (id: ${catTrim}). Kategori eşlemesini kontrol edin.`
          : gc.error,
    };
  }
  let emb = sanitizeCategoryEmbeddedForProduct(gc.raw);
  if (emb.id == null && /^\d+$/.test(catTrim)) {
    emb = { id: catTrim };
  }
  if (emb.id == null) {
    return { ok: false, status: 400, error: 'Ideasoft kategori yanıtında id yok.' };
  }

  const bodiesCategoryOnly: Record<string, unknown>[] = [
    { category: emb },
    { mainCategory: emb },
    { categories: [emb] },
  ];
  for (const body of bodiesCategoryOnly) {
    for (const ct of ['application/merge-patch+json', 'application/json'] as const) {
      const res = await ideasoftApiFetch(storeBase, accessToken, patchPath, {
        method: 'PATCH',
        headers: { 'Content-Type': ct, Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      const rawJson = await res.json().catch(() => ({}));
      if (res.ok) {
        if (await confirmCat()) return { ok: true };
      }
      if (res.status === 404 || res.status === 405) break;
      if (res.status === 401 || res.status === 403) {
        return { ok: false, status: res.status, error: parseIdeasoftHttpError(res.status, rawJson, '') };
      }
      if (res.status !== 400 && res.status !== 422) break;
    }
  }

  const subPaths = [`/products/${pid}/change_category`, `/products/${pid}/change-category`];
  for (const p of subPaths) {
    for (const body of bodiesCategoryOnly) {
      const res = await ideasoftApiFetch(storeBase, accessToken, p, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      const rawJson = await res.json().catch(() => ({}));
      if (res.ok) {
        if (await confirmCat()) return { ok: true };
      }
      if (res.status === 404) break;
      if (res.status === 401 || res.status === 403) {
        return { ok: false, status: res.status, error: parseIdeasoftHttpError(res.status, rawJson, '') };
      }
      if (res.status !== 400 && res.status !== 422) break;
    }
  }

  for (const body of bodiesCategoryOnly) {
    const res = await ideasoftApiFetch(storeBase, accessToken, patchPath, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const rawJson = await res.json().catch(() => ({}));
    if (res.ok) {
      if (await confirmCat()) return { ok: true };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: res.status, error: parseIdeasoftHttpError(res.status, rawJson, '') };
    }
    if (res.status !== 400 && res.status !== 422) break;
  }

  const g = await ideasoftGetProduct(storeBase, accessToken, productId);
  if (g.ok) {
    const r = { ...(g.raw as Record<string, unknown>) };
    for (const k of Object.keys(r)) {
      if (k.startsWith('@') || k.startsWith('hydra:')) delete r[k];
    }
    r.category = emb;
    const res = await ideasoftApiFetch(storeBase, accessToken, patchPath, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(r),
    });
    const rawJson = await res.json().catch(() => ({}));
    if (res.ok) {
      if (await confirmCat()) return { ok: true };
    } else {
      return { ok: false, status: res.status, error: parseIdeasoftHttpError(res.status, rawJson, '') };
    }
  }

  return {
    ok: false,
    status: 400,
    error:
      'Ideasoft kategorisi ürüne yazılamadı: istekler başarılı görünse de ürün hâlâ bu kategoriye bağlı değil (product_to_categories / ürün GET doğrulaması). Kategori id’sini ve OAuth kapsamını kontrol edin.',
  };
}

/**
 * Kategori ataması: öncelik `product_to_categories` (dokümantasyon: PUT `/admin-api/product_to_categories/{id}`).
 * @see https://apidoc.ideasoft.dev/docs/admin-api/zlywejrq617xq-product-change-category-action-put
 */
export async function ideasoftChangeProductCategory(
  storeBase: string,
  accessToken: string,
  productId: string,
  categoryIdeasoftId: string,
  options?: { productPayloadFromUpsert?: Record<string, unknown> }
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const catTrim = categoryIdeasoftId.trim();
  if (!catTrim) return { ok: false, status: 400, error: 'Ideasoft kategori id boş.' };
  return ideasoftApplyProductCategoryAfterUpsert(storeBase, accessToken, productId, catTrim, options);
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
 * Ideasoft ürün slug: kayıtlı SEO slug → vitrin (e-ticaret) adı → dahili ad; SKU yalnızca son çare.
 * @see Product slug pattern ^[a-z0-9-]+$
 */
function makeIdeasoftProductSlug(
  seoSlug: string | null | undefined,
  displayName: string,
  sku: string,
  fallbackName: string
): string {
  const raw = (seoSlug ?? '').trim();
  if (raw) {
    const cleaned = slugify(raw).replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (cleaned.length >= 2) return cleaned.slice(0, 255);
  }
  const fromDisplay = slugify(displayName.trim());
  if (fromDisplay.length >= 2) return fromDisplay.slice(0, 255);
  const fromFallback = slugify(fallbackName.trim());
  if (fromFallback.length >= 2) return fromFallback.slice(0, 255);
  return makeProductSlug(sku, fallbackName);
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

function ideasoftCurrencyNumericId(o: Record<string, unknown>): number | null {
  if (o.id == null) return null;
  const n = typeof o.id === 'number' ? o.id : parseInt(String(o.id).trim(), 10);
  return !Number.isNaN(n) ? n : null;
}

function ideasoftCurrencySanitizeForUpsert(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (k.startsWith('@') || k.startsWith('hydra:')) continue;
    if (v === undefined) continue;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) continue;
    out[k] = v;
  }
  if (out.id == null && o.id != null) out.id = o.id;
  return out;
}

function packageCurrencyResolvedFromObject(o: Record<string, unknown>): {
  numericId: number;
  raw: Record<string, unknown>;
  sanitized: Record<string, unknown>;
} | null {
  const nid = ideasoftCurrencyNumericId(o);
  if (nid == null) return null;
  return { numericId: nid, raw: o, sanitized: ideasoftCurrencySanitizeForUpsert(o) };
}

/**
 * Mağazadaki Currency kaydı — ham nesne, sanitize nesne ve sayısal id.
 * Birden çok koleksiyon yolu + tekil GET deneniyor.
 */
async function ideasoftResolveCurrency(
  storeBase: string,
  accessToken: string,
  isoCode: string
): Promise<{
  numericId: number;
  raw: Record<string, unknown>;
  sanitized: Record<string, unknown>;
} | null> {
  const base = normalizeStoreBase(storeBase);
  const targetIso = isoCode.trim().toUpperCase();

  const extractCode = (o: Record<string, unknown>): string =>
    (typeof o.code === 'string' ? o.code :
     typeof o.iso === 'string' ? o.iso :
     typeof o.isoCode === 'string' ? o.isoCode :
     typeof o.abbreviation === 'string' ? o.abbreviation :
     typeof o.label === 'string' ? o.label :
     typeof o.name === 'string' ? o.name : '').trim().toUpperCase();

  const collectionPaths = ['/currencies', '/product_currencies'];

  for (const colPath of collectionPaths) {
    let nextPath: string | null = colPath;
    let pages = 0;
    const maxPages = 1;

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
      const members = extractHydraMembers(
        Array.isArray(raw) ? raw : (raw as Record<string, unknown>)
      );
      for (const m of members) {
        const o = m as Record<string, unknown>;
        if (!ideasoftCurrencyMatches(extractCode(o), targetIso)) continue;
        const packed = packageCurrencyResolvedFromObject(o);
        if (packed) return packed;
      }
      const nextObj = Array.isArray(raw) ? null : hydraNextPath(raw as Record<string, unknown>);
      nextPath = nextObj;
    }
  }

  return null;
}

/** Tekil Currency GET — `/currencies/{id}` veya `/product_currencies/{id}` (Admin API). */
async function ideasoftGetCurrencyById(
  storeBase: string,
  accessToken: string,
  currencyId: string
): Promise<{
  numericId: number;
  raw: Record<string, unknown>;
  sanitized: Record<string, unknown>;
} | null> {
  const id = encodeURIComponent(currencyId.trim());
  const paths = [`/currencies/${id}`, `/product_currencies/${id}`];
  for (const p of paths) {
    const res = await ideasoftApiFetch(storeBase, accessToken, p, {
      method: 'GET',
      headers: { Accept: 'application/json, application/ld+json' },
    });
    const rawText = await res.text();
    let raw: Record<string, unknown> = {};
    try {
      raw = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
    } catch {
      if (res.status === 404) continue;
      continue;
    }
    if (res.ok) {
      const packed = packageCurrencyResolvedFromObject(raw);
      if (packed) return packed;
    }
    if (res.status !== 404) break;
  }
  return null;
}

/**
 * Önce eşleştirilmiş Ideasoft para birimi id (sayısal) ile dener; başarısızsa ISO koda göre koleksiyondan çözümler.
 */
export async function ideasoftResolveCurrencyForProduct(
  storeBase: string,
  accessToken: string,
  isoCode: string,
  mappedIdeasoftCurrencyId: string | null | undefined
): Promise<{
  numericId: number;
  raw: Record<string, unknown>;
  sanitized: Record<string, unknown>;
} | null> {
  const base = normalizeStoreBase(storeBase);
  const pref = (mappedIdeasoftCurrencyId ?? '').trim();
  if (pref && /^\d+$/.test(pref)) {
    const got = await ideasoftGetCurrencyById(base, accessToken, pref);
    if (got) return got;
  }
  return ideasoftResolveCurrency(base, accessToken, isoCode);
}

/** Para birimi: tek sanitize nesne + { id } + ISO; eski çoklu varyant yerine sınırlı deneme (Workers alt istek). */
function buildIdeasoftCurrencyVariantsForUpsert(
  isoCode: string,
  currencyResolved: {
    numericId: number;
    raw: Record<string, unknown>;
    sanitized: Record<string, unknown>;
  } | null
): unknown[] {
  const seen = new Set<string>();
  const out: unknown[] = [];
  const push = (v: unknown) => {
    const k = JSON.stringify(v);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(v);
  };
  const iso = isoCode.trim().toUpperCase();
  if (currencyResolved) {
    push(currencyResolved.sanitized);
    push({ id: currencyResolved.numericId });
  }
  push(iso);
  return out;
}

/** Ürün oluştur / güncelle — [Product POST](https://apidoc.ideasoft.dev/docs/admin-api/8pzfiy7v4vow9-product-post) / [PUT](https://apidoc.ideasoft.dev/docs/admin-api/p7r7yfxlfjma9-product-put) */
export async function ideasoftUpsertProduct(params: {
  storeBase: string;
  accessToken: string;
  existingId?: string | null;
  sku: string;
  /** Mağazada görünen ürün adı (e-ticaret adı veya dahili ad) */
  name: string;
  /** Uzun açıklama (e-ticaret / ürün detay metni) */
  description: string;
  price: number;
  quantity: number;
  /** ISO 4217; ürün fiyatındaki para birimi (product_currencies.code) */
  currency?: string | null;
  /** Para birimi eşleştirmesinden gelen Ideasoft currency id (sayısal string) */
  currencyIdeasoftId?: string | null;
  /** Eşleştirme sayfalarından gelen Ideasoft kategori / marka id */
  categoryIdeasoftId?: string | null;
  brandIdeasoftId?: string | null;
  /** Dahili ürün adı (slug yedekleri için) */
  internalName?: string;
  seoSlug?: string | null;
  pageTitle?: string | null;
  metaDescription?: string | null;
  metaKeywords?: string | null;
  searchKeywords?: string | null;
  /** Boşsa `urun/{slug}` üretilir (Ideasoft canonical pattern) */
  canonicalUrl?: string | null;
}): Promise<
  | { ok: true; id: string; raw: unknown; brandWarning?: string; categoryWarning?: string }
  | { ok: false; status: number; error: string; raw?: unknown }
> {
  const { storeBase, accessToken, existingId, sku, name, description, price, quantity, categoryIdeasoftId, brandIdeasoftId } =
    params;
  const base = normalizeStoreBase(storeBase);
  const isoCode = normalizeIdeasoftCurrencyCode(params.currency);

  /** API Platform şemaları float bekler; string "99.00" → 400 */
  const listPrice = parseFloat(price.toFixed(2));
  const stockAmount = Math.max(0, Math.floor(quantity));
  const fallbackInternal = (params.internalName ?? name).trim();
  const slug = makeIdeasoftProductSlug(params.seoSlug, name, sku, fallbackInternal);

  const currencyResolved = await ideasoftResolveCurrencyForProduct(
    base,
    accessToken,
    isoCode,
    params.currencyIdeasoftId ?? null
  ).catch(() => null);
  const currencyNumericId = currencyResolved?.numericId ?? null;

  /**
   * Kategori: POST/PUT gövdesinde çoklu deneme (IRI / id / mainCategory); yine de
   * `ideasoftChangeProductCategory` ile `product_to_categories` tamamlanır.
   */
  const relationLayers: Record<string, unknown>[] = (() => {
    const layers = buildIdeasoftProductCategoryLayers({ storeBase, categoryIdeasoftId });
    const max = 14;
    return layers.length > max ? layers.slice(0, max) : layers;
  })();

  const currencyVariants = buildIdeasoftCurrencyVariantsForUpsert(isoCode, currencyResolved);

  const pageTitle = (params.pageTitle ?? '').trim() || name;
  const metaDesc = (params.metaDescription ?? '').trim();
  const metaKw = (params.metaKeywords ?? '').trim();
  const searchKw = (params.searchKeywords ?? '').trim();
  const canonRaw = (params.canonicalUrl ?? '').trim();
  const canonicalUrl = canonRaw || (slug ? `urun/${slug}` : '');

  const common: Record<string, unknown> = {
    sku,
    name,
    slug,
    shortDescription: description.slice(0, 500),
    longDescription: description,
    short_description: description.slice(0, 500),
    long_description: description,
    stockAmount,
    status: 1,
    pageTitle,
    page_title: pageTitle,
  };
  if (metaDesc) {
    common.metaDescription = metaDesc;
    common.meta_description = metaDesc;
  }
  if (metaKw) {
    common.metaKeywords = metaKw;
    common.meta_keywords = metaKw;
  }
  if (searchKw) {
    common.searchKeywords = searchKw;
    common.search_keywords = searchKw;
  } else if (metaKw) {
    common.searchKeywords = metaKw;
    common.search_keywords = metaKw;
  }
  if (canonicalUrl && /^[a-z0-9-/]+$/i.test(canonicalUrl)) common.canonicalUrl = canonicalUrl;

  const baseTemplates: Record<string, unknown>[] = [];
  for (const cur of currencyVariants) {
    baseTemplates.push({ ...common, price1: listPrice, listPrice, currency: cur });
  }

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

  /** Ideasoft brand: int/IRI değil, GET /brands ile gömülü nesne (Admin\Model\Brand) */
  let embeddedBrand: Record<string, unknown> | null = null;
  const brandTrim = (brandIdeasoftId ?? '').trim();
  if (brandTrim) {
    const gb = await ideasoftGetBrand(storeBase, accessToken, brandTrim);
    if (gb.ok) {
      const emb = sanitizeBrandEmbeddedForProduct(gb.raw);
      if (emb.id != null) embeddedBrand = emb;
    }
  }

  const dedupedMerged: Record<string, unknown>[] = [];
  const seenMerged = new Set<string>();
  const pushMerged = (b: Record<string, unknown>) => {
    const key = JSON.stringify(b);
    if (seenMerged.has(key)) return;
    seenMerged.add(key);
    dedupedMerged.push(b);
  };
  if (embeddedBrand) {
    for (const b of dedupedTryBodies) {
      pushMerged({ ...b, brand: embeddedBrand });
    }
  } else {
    for (const b of dedupedTryBodies) pushMerged(b);
  }

  const path = existingId ? `/products/${encodeURIComponent(existingId)}` : '/products';
  const method = existingId ? 'PUT' : 'POST';

  /** PUT: slug çoğu kurulumda salt okunur — tek gövde (slug alanı yok) ile deneme; POST’ta slug kalır */
  const tryBodiesForMethod = existingId
    ? dedupedMerged.map((b) => {
        const { slug: _s, ...rest } = b as Record<string, unknown>;
        return rest;
      })
    : dedupedMerged;

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
        await ideasoftPatchProductMarketingAndSeo(storeBase, accessToken, id, {
          longDescription: description,
          pageTitle,
          metaDescription: metaDesc,
          metaKeywords: metaKw,
          searchKeywords: searchKw,
        });
        let brandWarning: string | undefined;
        const b = (brandIdeasoftId ?? '').trim();
        if (b && !Object.prototype.hasOwnProperty.call(body, 'brand')) {
          const br = await ideasoftApplyProductBrandAfterUpsert(storeBase, accessToken, id, b);
          if (!br.ok) brandWarning = br.error;
        }
        let categoryWarning: string | undefined;
        const cat = (categoryIdeasoftId ?? '').trim();
        if (cat) {
          const ch = await ideasoftChangeProductCategory(storeBase, accessToken, id, cat, {
            productPayloadFromUpsert: stripProductPayloadFromUpsertResponse(raw),
          });
          if (!ch.ok) categoryWarning = ch.error;
        }
        return { ok: true, id, raw, brandWarning, categoryWarning };
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

  /**
   * Kayıtlı marketplace_model_code Ideasoft’ta silinmiş / geçersizse PUT sürekli 404 verir.
   * Para birimi doğru olsa da ürün yolu bulunmaz; bu durumda POST ile yeniden oluştur.
   */
  if (existingId && lastStatus === 404) {
    const postPath = '/products';
    for (const body of dedupedMerged) {
      const doReqPost = (ct: string) =>
        ideasoftApiFetch(storeBase, accessToken, postPath, {
          method: 'POST',
          headers: { 'Content-Type': ct },
          body: JSON.stringify(body),
        });

      let res = await doReqPost('application/json');
      let raw = await res.json().catch(() => ({}));
      if (res.status === 415) {
        res = await doReqPost('application/ld+json');
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
              : '';
        if (!id) {
          const found = await ideasoftFindProductIdBySku(storeBase, accessToken, sku, { maxPaths: 1 });
          if (found) id = found;
        }
        if (id) {
          await ideasoftPatchProductMarketingAndSeo(storeBase, accessToken, id, {
            longDescription: description,
            pageTitle,
            metaDescription: metaDesc,
            metaKeywords: metaKw,
            searchKeywords: searchKw,
          });
          let brandWarning: string | undefined;
          const b = (brandIdeasoftId ?? '').trim();
          if (b && !Object.prototype.hasOwnProperty.call(body, 'brand')) {
            const br = await ideasoftApplyProductBrandAfterUpsert(storeBase, accessToken, id, b);
            if (!br.ok) brandWarning = br.error;
          }
          let categoryWarning: string | undefined;
          const cat = (categoryIdeasoftId ?? '').trim();
          if (cat) {
            const ch = await ideasoftChangeProductCategory(storeBase, accessToken, id, cat, {
              productPayloadFromUpsert: stripProductPayloadFromUpsertResponse(raw),
            });
            if (!ch.ok) categoryWarning = ch.error;
          }
          return { ok: true, id, raw, brandWarning, categoryWarning };
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
    lastErr = `${lastErr || 'Not Found'} — Kayıtlı Ideasoft ürün id’si (${existingId}) bulunamadı; yeniden oluşturma da başarısız.`;
  }

  const debugCurrency = currencyResolved
    ? `currency_resolved(id=${currencyNumericId})`
    : `currency_unresolved(iso=${isoCode}, tried=${currencyVariants.length} variants)`;
  const errWithDebug = `${lastErr || 'Ideasoft ürün API hatası'} [${debugCurrency}, bodies=${tryBodiesForMethod.length}]`;
  return { ok: false, status: lastStatus, error: errWithDebug, raw: lastRaw };
}

/**
 * Ideasoft ProductImage POST — attachment: `data:image/(jpeg|jpg|png|gif|webp);base64,...`
 * filename: `^[a-z0-9-]+$` uzantısız; extension ayrı; sortOrder 1–8; product: { id }
 * @see https://apidoc.ideasoft.dev/docs/admin-api/mn7plewrf9155-product-image-list
 */
function ideasoftSlugProductImageFilename(leaf: string, sortOrder: number): string {
  const clean = leaf.replace(/\.[a-zA-Z0-9]{1,8}$/, '').trim();
  const base = (clean || `product-image-${sortOrder}`).split('/').filter(Boolean).pop() || `img-${sortOrder}`;
  let s = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!s) s = `product-image-${sortOrder}`;
  return s.slice(0, 255);
}

/** Base64 payload (data URL) boşsa Ideasoft "attachment: This value should not be blank" döner. */
export function ideasoftDataUrlBase64PayloadNonEmpty(dataUrl: string): boolean {
  const t = dataUrl.trim();
  const idx = t.lastIndexOf('base64,');
  if (idx < 0) return false;
  const payload = t.slice(idx + 7).replace(/\s/g, '');
  return payload.length > 0;
}

/** Döküman: `^data:image\/(jpeg|jpg|png|gif|webp);base64,` */
function ideasoftNormalizeProductImageAttachment(dataUrl: string): {
  attachment: string;
  extension: string;
} | null {
  const t = dataUrl.trim();
  if (!ideasoftDataUrlBase64PayloadNonEmpty(t)) return null;
  const docPattern = /^data:image\/(jpeg|jpg|png|gif|webp);base64,/i;
  if (docPattern.test(t)) {
    const m = t.match(/^data:image\/(jpeg|jpg|png|gif|webp);base64,/i);
    const sub = (m?.[1] ?? 'jpeg').toLowerCase();
    let ext = 'jpg';
    if (sub === 'png') ext = 'png';
    else if (sub === 'gif') ext = 'gif';
    else if (sub === 'webp') ext = 'webp';
    else if (sub === 'jpeg' || sub === 'jpg') ext = 'jpg';
    return { attachment: t, extension: ext };
  }
  const comma = t.indexOf(',');
  if (comma < 0) return null;
  const b64 = t.slice(comma + 1).trim();
  if (!b64) return null;
  const mime = t.match(/^data:([^;]+);base64,/i)?.[1]?.toLowerCase() || '';
  if (mime.includes('png')) return { attachment: `data:image/png;base64,${b64}`, extension: 'png' };
  if (mime.includes('webp')) return { attachment: `data:image/webp;base64,${b64}`, extension: 'webp' };
  if (mime.includes('gif')) return { attachment: `data:image/gif;base64,${b64}`, extension: 'gif' };
  if (mime.includes('jpeg') || mime.includes('jpg')) {
    return { attachment: `data:image/jpeg;base64,${b64}`, extension: 'jpg' };
  }
  return { attachment: `data:image/jpeg;base64,${b64}`, extension: 'jpg' };
}

export async function ideasoftUploadProductImages(params: {
  storeBase: string;
  accessToken: string;
  productId: string;
  images: Array<{ dataUrl: string; sourceUrl?: string; filename?: string; sortOrder: number }>;
}): Promise<{ uploaded: number; errors: string[] }> {
  const { storeBase, accessToken, productId, images } = params;
  const pid = String(productId || '').trim();
  if (!pid || images.length === 0) return { uploaded: 0, errors: [] };

  const numericPid = Number(pid);
  const productIdForApi = Number.isFinite(numericPid) && numericPid >= 1 ? Math.floor(numericPid) : null;

  const pe = encodeURIComponent(pid);
  const fallbackEndpoints = [`/products/${pe}/images`, `/products/${pe}/product_images`, '/product-images'];

  const errors: string[] = [];
  let uploaded = 0;
  let rateLimited = false;
  let learnedEndpoint: string | null = null;

  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  const retryAfterMs = (res: Response): number => {
    const v = (res.headers.get('retry-after') || '').trim();
    if (!v) return 1200;
    const sec = parseInt(v, 10);
    if (!Number.isNaN(sec) && sec >= 0) return Math.max(800, sec * 1000);
    const when = Date.parse(v);
    if (!Number.isNaN(when)) return Math.max(800, when - Date.now());
    return 1200;
  };

  const parsePostError = (res: Response, raw: unknown): string => {
    const baseErr = parseIdeasoftHttpError(res.status, raw, '');
    const o = raw as Record<string, unknown>;
    const detailStr =
      (typeof o.detail === 'string' && o.detail.trim()) ||
      (typeof o.description === 'string' && o.description.trim()) ||
      '';
    const kv =
      o && typeof o === 'object' && o.errors && typeof o.errors === 'object'
        ? Object.entries(o.errors as Record<string, unknown>)
            .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
            .join(' | ')
        : '';
    const violations = Array.isArray(o?.violations)
      ? (o.violations as Array<{ propertyPath?: string; message?: string }>)
          .map((x) => `${x.propertyPath ?? 'field'}: ${x.message ?? ''}`)
          .join(' | ')
      : '';
    const detail = [detailStr, kv, violations].filter(Boolean).join(' | ');
    return detail ? `${baseErr} — ${detail}` : baseErr;
  };

  const tryPost = async (
    endpoint: string,
    body: Record<string, unknown>
  ): Promise<{ ok: boolean; status: number; error: string; rateLimited: boolean }> => {
    const doReq = (ct: string) =>
      ideasoftApiFetch(storeBase, accessToken, endpoint, {
        method: 'POST',
        headers: { 'Content-Type': ct, Accept: 'application/json, application/ld+json' },
        body: JSON.stringify(body),
      });

    for (let attempt = 0; attempt < 2; attempt++) {
      let res = await doReq('application/json');
      let raw = await res.json().catch(() => ({}));
      if (res.status === 415) {
        res = await doReq('application/ld+json');
        raw = await res.json().catch(() => ({}));
      }
      if (res.ok) return { ok: true, status: res.status, error: '', rateLimited: false };
      if (res.status === 429) {
        if (attempt === 0) {
          await sleep(retryAfterMs(res));
          continue;
        }
        return {
          ok: false,
          status: 429,
          error: 'Çok fazla sayıda istekte bulundunuz. Lütfen kısa bir süre sonra tekrar deneyin.',
          rateLimited: true,
        };
      }
      return {
        ok: false,
        status: res.status,
        error: parsePostError(res, raw),
        rateLimited: false,
      };
    }
    return { ok: false, status: 429, error: 'Çok fazla sayıda istekte bulundunuz.', rateLimited: true };
  };

  for (const image of images) {
    if (rateLimited) break;

    const sortOrderRaw = Math.max(1, Math.floor(image.sortOrder || 1));
    const sortOrder = Math.min(8, sortOrderRaw);
    const leafName = (image.filename || '').trim() || `product-image-${sortOrder}.jpg`;
    const filenameSlug = ideasoftSlugProductImageFilename(leafName, sortOrder);
    const sourceUrl = (image.sourceUrl || '').trim();
    const dataUrl = (image.dataUrl || '').trim();

    let ok = false;
    let lastStatus = 500;
    let lastErr = 'Görsel yüklenemedi';

    const norm = ideasoftNormalizeProductImageAttachment(dataUrl);
    const canUseRemoteUrl =
      !!sourceUrl && (sourceUrl.startsWith('https://') || sourceUrl.startsWith('http://'));

    /** 1) Döküman POST gövdesi — önce /product_images */
    if (norm && productIdForApi != null) {
      const extApi = norm.extension === 'jpeg' ? 'jpg' : norm.extension;
      const docBodies: Record<string, unknown>[] = [
        {
          attachment: norm.attachment,
          filename: filenameSlug,
          extension: extApi,
          sortOrder,
          product: { id: productIdForApi },
        },
        {
          attachment: norm.attachment,
          filename: filenameSlug,
          extension: extApi,
          sort_order: sortOrder,
          product: { id: productIdForApi },
        },
      ];
      const primaryEndpoints = learnedEndpoint
        ? [learnedEndpoint]
        : ['/product_images', ...fallbackEndpoints];

      docLoop: for (const endpoint of primaryEndpoints) {
        for (const body of docBodies) {
          const res = await tryPost(endpoint, body);
          if (res.ok) {
            ok = true;
            uploaded++;
            learnedEndpoint = endpoint;
            break docLoop;
          }
          lastStatus = res.status;
          lastErr = res.error;
          if (res.rateLimited) {
            rateLimited = true;
            break docLoop;
          }
          if (res.status === 401 || res.status === 403) break docLoop;
          if (![400, 404, 405, 415, 422].includes(res.status)) break docLoop;
        }
      }
    } else if (!norm && dataUrl.trim()) {
      lastErr =
        'Görsel data URL formatı Ideasoft şemasına uymuyor (jpeg/png/gif/webp; base64).';
      lastStatus = 400;
    }

    if (rateLimited) break;
    if (ok) continue;

    /** 2) product id sayı değilse veya 1 başarısız: product IRI + aynı attachment */
    if (norm && !ok && !rateLimited) {
      const baseNorm = normalizeStoreBase(storeBase);
      const extApi = norm.extension === 'jpeg' ? 'jpg' : norm.extension;
      const productIrises: unknown[] = [
        ...(productIdForApi != null ? [{ id: productIdForApi }] : []),
        `${baseNorm}/admin-api/products/${encodeURIComponent(pid)}`,
        `/admin-api/products/${encodeURIComponent(pid)}`,
      ];
      const altBodies: Record<string, unknown>[] = [];
      for (const pref of productIrises) {
        altBodies.push({
          attachment: norm.attachment,
          filename: filenameSlug,
          extension: extApi,
          sortOrder,
          product: pref,
        });
      }
      altLoop: for (const endpoint of ['/product_images', ...fallbackEndpoints]) {
        for (const body of altBodies) {
          const res = await tryPost(endpoint, body);
          if (res.ok) {
            ok = true;
            uploaded++;
            learnedEndpoint = endpoint;
            break altLoop;
          }
          lastStatus = res.status;
          lastErr = res.error;
          if (res.rateLimited) {
            rateLimited = true;
            break altLoop;
          }
          if (res.status === 401 || res.status === 403) break altLoop;
          if (![400, 404, 405, 415, 422].includes(res.status)) break altLoop;
        }
      }
    }

    /** 3) Uzak URL (originalUrl) — dökümandaki alan adı */
    if (!ok && !rateLimited && canUseRemoteUrl && productIdForApi != null) {
      const extApi = norm?.extension === 'jpeg' ? 'jpg' : norm?.extension || 'jpg';
      const urlBody: Record<string, unknown> = {
        originalUrl: sourceUrl,
        filename: filenameSlug,
        extension: extApi,
        sortOrder,
        product: { id: productIdForApi },
      };
      const res = await tryPost('/product_images', urlBody);
      if (res.ok) {
        ok = true;
        uploaded++;
        learnedEndpoint = '/product_images';
      } else {
        lastStatus = res.status;
        lastErr = res.error;
        if (res.rateLimited) rateLimited = true;
      }
    }

    if (!ok && !rateLimited) {
      errors.push(`Görsel ${sortOrder}: ${lastErr} (HTTP ${lastStatus})`);
    }
  }

  if (rateLimited) {
    errors.push('Ideasoft hız limiti (429) nedeniyle görsellerin bir kısmı aktarılmadı; kısa süre sonra yeniden deneyin.');
  }

  return { uploaded, errors };
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

/** Admin API — mağaza para birimleri (Currency / ProductCurrency) */
export type IdeasoftCurrency = {
  id: string;
  name: string;
  code?: string;
};

function parseIdeasoftCurrencyItem(item: unknown): IdeasoftCurrency | null {
  const extractCodeDisplay = (o: Record<string, unknown>): string =>
    (typeof o.code === 'string' ? o.code :
     typeof o.iso === 'string' ? o.iso :
     typeof o.isoCode === 'string' ? o.isoCode :
     typeof o.abbreviation === 'string' ? o.abbreviation :
     typeof o.label === 'string' ? o.label : '').trim();

  if (typeof item === 'string') {
    const id = extractIdFromIri(item);
    if (!id) return null;
    return { id, name: id, code: id };
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

  const codeDisp = extractCodeDisplay(o);
  const nameRaw =
    (typeof o.name === 'string' && o.name.trim()) ||
    (typeof o.title === 'string' && o.title.trim()) ||
    (typeof o.label === 'string' && o.label.trim()) ||
    codeDisp ||
    idStr;
  return { id: idStr, name: nameRaw, ...(codeDisp ? { code: codeDisp } : {}) };
}

const IDEASOFT_CURRENCY_COLLECTION_PATHS = [
  '/currencies?pagination=false',
  '/currencies?itemsPerPage=250&page=1',
  '/currencies?itemsPerPage=100',
  '/currencies',
  '/product_currencies?pagination=false',
  '/product_currencies?itemsPerPage=250&page=1',
  '/product_currencies?itemsPerPage=100',
  '/product_currencies',
];

const currencyFetchInit: RequestInit = {
  method: 'GET',
  headers: { Accept: 'application/ld+json, application/json' },
};

/**
 * Tüm para birimlerini çeker (hydra sayfalama, birden fazla koleksiyon yolu birleştirilir).
 */
export async function ideasoftFetchCurrencies(
  storeBase: string,
  accessToken: string
): Promise<{ ok: true; currencies: IdeasoftCurrency[] } | { ok: false; error: string }> {
  type RawJson = Record<string, unknown> | unknown[];
  const byId = new Map<string, IdeasoftCurrency>();
  let gotAnyOkResponse = false;

  const mergePage = (raw: RawJson) => {
    for (const m of extractHydraMembers(raw)) {
      const cur = parseIdeasoftCurrencyItem(m);
      if (cur) byId.set(cur.id, cur);
    }
  };

  for (const path of IDEASOFT_CURRENCY_COLLECTION_PATHS) {
    let nextPath: string | null = path;
    while (nextPath) {
      const res = await ideasoftApiFetch(storeBase, accessToken, nextPath, currencyFetchInit, {
        retryEmptyJsonCollection: true,
      });
      const rawText = await res.text();
      let raw: RawJson = {};
      try {
        raw = rawText ? (JSON.parse(rawText) as RawJson) : {};
      } catch {
        return { ok: false, error: 'Ideasoft para birimi yanıtı JSON değil' };
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
          'Ideasoft para birimi API yolu bulunamadı veya yanıt alınamadı. OAuth izinlerini ve Currency koleksiyon yolunu kontrol edin.',
      };
    }
    return { ok: true, currencies: [] };
  }

  return { ok: true, currencies: [...byId.values()] };
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

export type IdeasoftCurrencyDebugResult = {
  path: string;
  url: string;
  status: number;
  memberCount: number;
  members: unknown[];
  rawPreview: string;
};

const IDEASOFT_CURRENCY_DEBUG_PATHS = ['/currencies', '/product_currencies'];

export async function ideasoftDebugCurrencies(
  storeBase: string,
  accessToken: string
): Promise<IdeasoftCurrencyDebugResult[]> {
  const base = normalizeStoreBase(storeBase);
  const results: IdeasoftCurrencyDebugResult[] = [];

  for (const path of IDEASOFT_CURRENCY_DEBUG_PATHS) {
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
        try {
          const j = JSON.parse(text) as Record<string, unknown> | unknown[];
          const members = extractHydraMembers(
            Array.isArray(j) ? j : (j as Record<string, unknown>)
          );
          results.push({
            path: `/${prefix}${rel}`,
            url,
            status: res.status,
            memberCount: members.length,
            members: members.slice(0, 10),
            rawPreview: text.slice(0, 1000),
          });
        } catch {
          results.push({ path: `/${prefix}${rel}`, url, status: res.status, memberCount: 0, members: [], rawPreview: text.slice(0, 500) });
        }
      } catch (e) {
        results.push({ path: `/${prefix}${rel}`, url, status: 0, memberCount: 0, members: [], rawPreview: String(e).slice(0, 200) });
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
