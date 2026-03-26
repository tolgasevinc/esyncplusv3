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

export function normalizeStoreBase(url: string): string {
  return (url || '').trim().replace(/\/+$/, '');
}

function getOAuthPaths(base: string): { authorize: string; token: string } {
  return {
    authorize: `${base}/oauth/v2/auth`,
    token: `${base}/oauth/v2/token`,
  };
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
    const refreshRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
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
    const expiresIn = (refreshData as { expires_in?: number }).expires_in ?? 3600;
    if (newToken) {
      await saveIdeasoftTokens(env.DB, newToken, newRefresh || refreshToken, expiresIn);
      return newToken;
    }
  }
  return null;
}

export async function exchangeIdeasoftAuthorizationCode(
  db: D1Database,
  baseUrl: string,
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { token: tokenUrl } = getOAuthPaths(normalizeStoreBase(baseUrl));
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }).toString(),
  });
  const data = await res.json().catch(() => ({}));
  const accessToken = (data as { access_token?: string }).access_token;
  const refreshToken = (data as { refresh_token?: string }).refresh_token;
  const expiresIn = (data as { expires_in?: number }).expires_in ?? 3600;
  if (!accessToken || !refreshToken) {
    const err =
      (data as { error_description?: string }).error_description
      || (data as { error?: string }).error
      || `Token alınamadı (HTTP ${res.status})`;
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

/** OAuth start: Ideasoft yetkilendirme URL'si */
export function buildIdeasoftAuthorizeUrl(
  storeBase: string,
  clientId: string,
  redirectUri: string,
  state: string,
  scope?: string
): string {
  const base = normalizeStoreBase(storeBase);
  const { authorize } = getOAuthPaths(base);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  });
  const sc = (scope || 'public').trim();
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
