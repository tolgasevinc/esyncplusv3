/**
 * Ideasoft Admin API + OAuth2 (mağaza tabanı: https://{subdomain}.myideasoft.com)
 * Dokümantasyon: https://apidoc.ideasoft.dev/
 */

type IdeasoftEnv = { DB: D1Database };

const CAT = 'ideasoft';

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

async function ideasoftApiFetch(
  storeBase: string,
  accessToken: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const base = normalizeStoreBase(storeBase);
  const url = path.startsWith('http') ? path : `${base}/admin-api${path.startsWith('/') ? path : `/${path}`}`;
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...(init?.headers || {}),
    },
  });
}

/** Ürün oluştur / güncelle — API Platform (JSON-LD) uyumlu deneme + düz JSON yedek */
export async function ideasoftUpsertProduct(params: {
  storeBase: string;
  accessToken: string;
  existingId?: string | null;
  sku: string;
  name: string;
  description: string;
  price: number;
  quantity: number;
}): Promise<{ ok: true; id: string; raw: unknown } | { ok: false; status: number; error: string; raw?: unknown }> {
  const { storeBase, accessToken, existingId, sku, name, description, price, quantity } = params;
  const base = normalizeStoreBase(storeBase);

  const tryBodies: Record<string, unknown>[] = [
    {
      sku,
      name,
      shortDescription: description.slice(0, 500),
      longDescription: description,
      stockAmount: Math.max(0, Math.floor(quantity)),
      listPrice: price.toFixed(2),
      currency: 'TRY',
      status: 'ACTIVE',
    },
    {
      code: sku,
      name,
      description,
      stockAmount: Math.max(0, Math.floor(quantity)),
      listPrice: price.toFixed(2),
      currency: 'TRY',
    },
    {
      '@context': `${base}/admin-api/contexts/Product`,
      '@type': 'Product',
      sku,
      name,
      shortDescription: description.slice(0, 500),
      longDescription: description,
      stockAmount: Math.max(0, Math.floor(quantity)),
      listPrice: price.toFixed(2),
      currency: 'TRY',
    },
  ];

  const path = existingId ? `/products/${encodeURIComponent(existingId)}` : '/products';
  const method = existingId ? 'PUT' : 'POST';

  let lastErr = '';
  let lastStatus = 500;
  let lastRaw: unknown;
  attemptLoop: for (const body of tryBodies) {
    const attempts: { ct: string }[] = [{ ct: 'application/json' }, { ct: 'application/ld+json' }];
    for (const { ct } of attempts) {
      const res = await ideasoftApiFetch(storeBase, accessToken, path, {
        method,
        headers: { 'Content-Type': ct },
        body: JSON.stringify(body),
      });
      const raw = await res.json().catch(() => ({}));
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
          const found = await ideasoftFindProductIdBySku(storeBase, accessToken, sku);
          if (found) id = found;
        }
        if (id) return { ok: true, id, raw };
        lastErr = 'Yanıtta ürün kimliği yok';
        continue attemptLoop;
      }
      lastErr =
        (raw as { detail?: string }).detail
        || (raw as { message?: string }).message
        || (raw as { 'hydra:description'?: string })['hydra:description']
        || (raw as { error?: string }).error
        || `HTTP ${res.status}`;
      if (res.status === 415) continue;
      if (res.status !== 400 && res.status !== 422) break attemptLoop;
    }
  }

  return { ok: false, status: lastStatus, error: lastErr || 'Ideasoft ürün API hatası', raw: lastRaw };
}

/** SKU ile mevcut ürün ara (hydra:member veya dizi) */
export async function ideasoftFindProductIdBySku(
  storeBase: string,
  accessToken: string,
  sku: string
): Promise<string | null> {
  const q = encodeURIComponent(sku.trim());
  const paths = [
    `/products?sku=${q}`,
    `/products?code=${q}`,
    `/products?search=${q}`,
  ];
  for (const p of paths) {
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

function parseIdeasoftCategoryItem(item: unknown): IdeasoftCategory | null {
  if (typeof item === 'string') {
    const id = extractIdFromIri(item);
    if (!id) return null;
    return { id, name: id, parentId: null };
  }
  if (!item || typeof item !== 'object') return null;
  const o = item as Record<string, unknown>;
  let idStr: string | null = null;
  if (o.id != null && String(o.id).trim()) idStr = String(o.id).trim();
  else if (typeof o['@id'] === 'string') idStr = extractIdFromIri(o['@id']);
  if (!idStr) return null;

  const nameRaw =
    typeof o.name === 'string'
      ? o.name
      : typeof o.title === 'string'
        ? o.title
        : typeof (o as { translations?: { name?: string } }).translations?.name === 'string'
          ? (o as { translations: { name: string } }).translations.name
          : '';
  const name = nameRaw.trim() || idStr;

  const parentId = parseIdeasoftCategoryParent(o);

  return { id: idStr, name, parentId };
}

function extractHydraMembers(raw: Record<string, unknown>): unknown[] {
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
  return [];
}

function hydraNextPath(raw: Record<string, unknown>): string | null {
  const view = raw['hydra:view'] as Record<string, string> | undefined;
  const nextHref = view?.['hydra:next'];
  if (typeof nextHref !== 'string' || !nextHref.trim()) return null;
  if (nextHref.startsWith('http')) return nextHref;
  return nextHref.startsWith('/') ? nextHref : `/${nextHref}`;
}

/** Admin API’de koleksiyon yolu mağazaya göre değişebilir; sırayla dene. */
const IDEASOFT_CATEGORY_COLLECTION_PATHS = [
  '/categories?itemsPerPage=100',
  '/product_categories?itemsPerPage=100',
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
  const all: IdeasoftCategory[] = [];
  let firstPath: string | null = null;
  let rawFirst: Record<string, unknown> | null = null;
  let gotAnyOkResponse = false;

  for (const path of IDEASOFT_CATEGORY_COLLECTION_PATHS) {
    const res = await ideasoftApiFetch(storeBase, accessToken, path, categoryFetchInit);
    const rawText = await res.text();
    let raw: Record<string, unknown> = {};
    try {
      raw = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
    } catch {
      return { ok: false, error: 'Ideasoft kategori yanıtı JSON değil' };
    }
    if (!res.ok) {
      if (res.status === 404) continue;
      const err = parseIdeasoftHttpError(res.status, raw, rawText);
      return { ok: false, error: err };
    }
    gotAnyOkResponse = true;
    const arr = extractHydraMembers(raw);
    if (arr.length > 0) {
      firstPath = path;
      rawFirst = raw;
      break;
    }
  }

  if (!firstPath || !rawFirst) {
    if (!gotAnyOkResponse) {
      return {
        ok: false,
        error:
          'Ideasoft kategori API yolu bulunamadı (404). OAuth uygulamasında kategori okuma izni olduğundan emin olun; Ideasoft dokümantasyonundaki Category koleksiyon yolunu kontrol edin.',
      };
    }
    return { ok: true, categories: [] };
  }

  const collectPage = (raw: Record<string, unknown>) => {
    for (const m of extractHydraMembers(raw)) {
      const c = parseIdeasoftCategoryItem(m);
      if (c) all.push(c);
    }
  };

  collectPage(rawFirst);

  let nextPath = hydraNextPath(rawFirst);
  while (nextPath) {
    const res = await ideasoftApiFetch(storeBase, accessToken, nextPath, categoryFetchInit);
    const rawText = await res.text();
    let raw: Record<string, unknown> = {};
    try {
      raw = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
    } catch {
      break;
    }
    if (!res.ok) break;
    collectPage(raw);
    nextPath = hydraNextPath(raw);
  }

  const seen = new Map<string, IdeasoftCategory>();
  for (const c of all) {
    if (!seen.has(c.id)) seen.set(c.id, c);
  }
  return { ok: true, categories: [...seen.values()] };
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
