/**
 * IdeaSoft — Store API + Admin API
 * OAuth2 (dökümanlar): authorizationUrl …/panel/auth, tokenUrl …/oauth/v2/token, akış authorization_code.
 * Access token ~24 saat; refresh token ile yenileme; refresh ~2 ay sonra yeniden yetkilendirme.
 * Store API: {mağaza}/api/...
 * Admin API: {mağaza}/admin-api/... (Stoplight / PDF; aynı Bearer token)
 */

/** Süre dolmadan ~5 dk önce yenile (saat kayması / gecikmeli istekler için) */
const IDEASOFT_TOKEN_REFRESH_SKEW_SEC = 300;

/** Mağaza kök URL (https://...myideasoft.com) — sondaki / atılır */
export function normalizeIdeasoftStoreBase(raw: string): string {
  let s = (raw || '').trim().replace(/\/+$/, '');
  if (s && !/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s;
}

export async function loadIdeasoftIntegrationSettings(db: D1Database): Promise<Record<string, string>> {
  const { results } = await db
    .prepare(
      `SELECT "key", value FROM app_settings WHERE category = 'ideasoft' AND is_deleted = 0 AND (status = 1 OR status IS NULL)`
    )
    .all();
  const out: Record<string, string> = {};
  for (const r of results as { key: string; value: string | null }[]) {
    if (r.key) out[r.key] = r.value ?? '';
  }
  return out;
}

export function getIdeasoftStoreAuth(settings: Record<string, string>): { storeBase: string; token: string } | null {
  const storeBase = normalizeIdeasoftStoreBase(settings.store_base_url ?? settings.storeBaseUrl ?? '');
  const token = (settings.IDEASOFT_ACCESS_TOKEN ?? '').trim();
  if (!storeBase || !token) return null;
  return { storeBase, token };
}

/**
 * IDEASOFT_TOKEN_EXPIRES_AT (unix sn) yakınsa veya geçmişse refresh dene.
 * Refresh bilgisi yoksa no-op (yalnızca reaktif hata sonrası yenileme).
 */
export async function ensureIdeasoftFreshAccessToken(db: D1Database): Promise<void> {
  const settings = await loadIdeasoftIntegrationSettings(db);
  const storeBase = normalizeIdeasoftStoreBase(settings.store_base_url ?? settings.storeBaseUrl ?? '');
  if (!storeBase) return;

  const refresh = (settings.IDEASOFT_REFRESH_TOKEN ?? '').trim();
  const clientId = (settings.IDEASOFT_CLIENT_ID ?? '').trim();
  const clientSecret = (settings.IDEASOFT_CLIENT_SECRET ?? '').trim();
  if (!refresh || !clientId || !clientSecret) return;

  const expRaw = (settings.IDEASOFT_TOKEN_EXPIRES_AT ?? '').trim();
  if (!expRaw) return;

  const exp = parseInt(expRaw, 10);
  if (!Number.isFinite(exp)) return;

  const now = Math.floor(Date.now() / 1000);
  if (now + IDEASOFT_TOKEN_REFRESH_SKEW_SEC < exp) return;

  await tryIdeasoftRefreshAccessToken(db, storeBase);
}

/**
 * Store API — {storeBase}/api/...
 * pathAndQuery: `/currencies` veya `/currencies?page=1&limit=20`
 */
export async function ideasoftStoreApiRequest(
  storeBase: string,
  token: string,
  pathAndQuery: string,
  init?: RequestInit
): Promise<Response> {
  const path = pathAndQuery.startsWith('/') ? pathAndQuery : `/${pathAndQuery}`;
  const url = `${storeBase}/api${path}`;
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  return fetch(url, { ...init, headers });
}

/**
 * Admin API — {storeBase}/admin-api/...
 * Authentication Admin API.pdf ile aynı OAuth token kullanılır.
 */
export async function ideasoftAdminApiRequest(
  storeBase: string,
  token: string,
  pathAndQuery: string,
  init?: RequestInit
): Promise<Response> {
  const path = pathAndQuery.startsWith('/') ? pathAndQuery : `/${pathAndQuery}`;
  const url = `${storeBase}/admin-api${path}`;
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  return fetch(url, { ...init, headers });
}

export function parseIdeasoftApiError(body: unknown, text: string, status: number): string {
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>;
    const msg =
      (typeof o.error_description === 'string' && o.error_description.trim()) ||
      (typeof o.message === 'string' && o.message) ||
      (typeof o.error === 'string' && o.error) ||
      (typeof o.detail === 'string' && o.detail);
    if (msg) return msg;
  }
  const t = text?.trim();
  if (t && t.length < 500) return t;
  return `HTTP ${status}`;
}

function ideasoftTokenHint(): string {
  return `IdeaSoft: IDEASOFT_ACCESS_TOKEN’ı güncelleyin (Panel › Entegrasyonlar › API). Otomatik yenileme için IDEASOFT_REFRESH_TOKEN, IDEASOFT_CLIENT_ID ve IDEASOFT_CLIENT_SECRET; token adresi mağaza kökü + /oauth/v2/token (Store ve Admin API aynı OAuth).`;
}

export function ideasoftProxyErrorParts(
  body: unknown,
  text: string,
  status: number
): { error: string; hint?: string } {
  const error = parseIdeasoftApiError(body, text, status);
  const grantErr =
    body && typeof body === 'object' && (body as Record<string, unknown>).error === 'invalid_grant';
  if (status === 401 || grantErr || /invalid.?token|expired|unauthor|invalid_grant/i.test(error)) {
    return { error: error || `HTTP ${status}`, hint: ideasoftTokenHint() };
  }
  if (status === 403) {
    return { error: error || `HTTP ${status}`, hint: ideasoftTokenHint() };
  }
  return { error: error || `HTTP ${status}` };
}

/** Mağaza API’si 401/403 veya gövdede bu mesajlarla hata döndürebilir */
export function isIdeasoftTokenInvalidError(body: unknown): boolean {
  const t = JSON.stringify(body ?? '').toLowerCase();
  if (/invalid_grant|expired|unauthorized|access_denied/.test(t)) return true;
  if (/invalid/.test(t) && /token/.test(t)) return true;
  return /invalid.?token|token.?invalid/.test(t);
}

/**
 * Bazı yanıtlar HTTP 200 ile döner; gövde OAuth hatası taşır (ör. invalid_grant).
 */
export function isIdeasoftOAuthAuthErrorBody(body: unknown): boolean {
  if (body == null || typeof body !== 'object') return false;
  const o = body as Record<string, unknown>;
  const err = o.error;
  if (typeof err === 'string') {
    const e = err.toLowerCase();
    if (e === 'invalid_grant' || e === 'invalid_token') return true;
  }
  return isIdeasoftTokenInvalidError(body);
}

function getIdeasoftRefreshInflightMap(): Map<string, Promise<boolean>> {
  const g = globalThis as unknown as { __ideasoftRefreshInflight?: Map<string, Promise<boolean>> };
  if (!g.__ideasoftRefreshInflight) {
    g.__ideasoftRefreshInflight = new Map();
  }
  return g.__ideasoftRefreshInflight;
}

async function upsertIdeasoftSetting(db: D1Database, key: string, value: string): Promise<void> {
  const existing = await db
    .prepare(`SELECT id FROM app_settings WHERE category = 'ideasoft' AND "key" = ? AND is_deleted = 0`)
    .bind(key)
    .first();
  if (existing) {
    await db
      .prepare(`UPDATE app_settings SET value = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(value, (existing as { id: number }).id)
      .run();
  } else {
    await db.prepare(`INSERT INTO app_settings (category, "key", value) VALUES ('ideasoft', ?, ?)`).bind(key, value).run();
  }
}

/**
 * Store API Authentication: authorization_code → POST/GET …/oauth/v2/token → access + refresh kaydı.
 */
export async function exchangeIdeasoftAuthorizationCode(
  db: D1Database,
  code: string,
  redirectUri: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const settings = await loadIdeasoftIntegrationSettings(db);
  const base = normalizeIdeasoftStoreBase(settings.store_base_url ?? settings.storeBaseUrl ?? '');
  const clientId = (settings.IDEASOFT_CLIENT_ID ?? '').trim();
  const clientSecret = (settings.IDEASOFT_CLIENT_SECRET ?? '').trim();
  const rUri = redirectUri.trim();
  const c = code.trim();
  if (!base) return { ok: false, error: 'Mağaza adresi (store_base_url) ayarlarda kayıtlı olmalı.' };
  if (!clientId || !clientSecret) {
    return { ok: false, error: 'Client ID ve Client Secret veritabanında olmalı. Önce formu Client Secret ile kaydedin.' };
  }
  if (!rUri) return { ok: false, error: 'Redirect URI gerekli (Panel’deki API kaydı ile birebir aynı olmalı).' };
  if (!c) return { ok: false, error: 'Yetkilendirme kodu (code) gerekli.' };

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code: c,
    redirect_uri: rUri,
  });
  const tokenPath = `/oauth/v2/token?${params.toString()}`;

  let res = await fetch(`${base}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: params.toString(),
  });
  let text = await res.text();
  if (!res.ok) {
    const resGet = await fetch(`${base}${tokenPath}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    const textGet = await resGet.text();
    res = resGet;
    text = textGet;
  }
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    return { ok: false, error: parseIdeasoftApiError(data, text, res.status) };
  }
  const access = (data as { access_token?: string })?.access_token;
  const newRefresh = (data as { refresh_token?: string })?.refresh_token;
  const expiresIn = (data as { expires_in?: number })?.expires_in;
  if (!access) return { ok: false, error: 'Yanıtta access_token yok.' };
  await upsertIdeasoftSetting(db, 'IDEASOFT_ACCESS_TOKEN', access);
  if (newRefresh) await upsertIdeasoftSetting(db, 'IDEASOFT_REFRESH_TOKEN', newRefresh);
  if (typeof expiresIn === 'number' && expiresIn > 0) {
    const expiresAt = String(Math.floor(Date.now() / 1000) + expiresIn);
    await upsertIdeasoftSetting(db, 'IDEASOFT_TOKEN_EXPIRES_AT', expiresAt);
  }
  return { ok: true };
}

export async function tryIdeasoftRefreshAccessToken(db: D1Database, storeBase: string): Promise<boolean> {
  const base = normalizeIdeasoftStoreBase(storeBase);
  const settings = await loadIdeasoftIntegrationSettings(db);
  const refresh = (settings.IDEASOFT_REFRESH_TOKEN ?? '').trim();
  const clientId = (settings.IDEASOFT_CLIENT_ID ?? '').trim();
  const clientSecret = (settings.IDEASOFT_CLIENT_SECRET ?? '').trim();
  if (!refresh || !clientId || !clientSecret) return false;

  const map = getIdeasoftRefreshInflightMap();
  const inflight = map.get(base);
  if (inflight) return inflight;

  const p = (async (): Promise<boolean> => {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refresh,
    });
    const tokenPath = `/oauth/v2/token?${params.toString()}`;

    let res = await fetch(`${base}/oauth/v2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: params.toString(),
    });
    let text = await res.text();
    if (!res.ok) {
      const resGet = await fetch(`${base}${tokenPath}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      const textGet = await resGet.text();
      res = resGet;
      text = textGet;
    }
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok) return false;
    const access = (data as { access_token?: string })?.access_token;
    const newRefresh = (data as { refresh_token?: string })?.refresh_token;
    const expiresIn = (data as { expires_in?: number })?.expires_in;
    if (!access) return false;
    await upsertIdeasoftSetting(db, 'IDEASOFT_ACCESS_TOKEN', access);
    if (newRefresh) await upsertIdeasoftSetting(db, 'IDEASOFT_REFRESH_TOKEN', newRefresh);
    if (typeof expiresIn === 'number' && expiresIn > 0) {
      const expiresAt = String(Math.floor(Date.now() / 1000) + expiresIn);
      await upsertIdeasoftSetting(db, 'IDEASOFT_TOKEN_EXPIRES_AT', expiresAt);
    }
    return true;
  })().finally(() => {
    map.delete(base);
  });

  map.set(base, p);
  return p;
}

type IdeasoftFetchFn = (
  storeBase: string,
  token: string,
  pathAndQuery: string,
  init?: RequestInit
) => Promise<Response>;

async function ideasoftDoRequestWithRefresh(
  db: D1Database,
  pathAndQuery: string,
  init: RequestInit | undefined,
  doFetch: IdeasoftFetchFn,
  _authHint: { storeBase: string }
): Promise<Response> {
  await ensureIdeasoftFreshAccessToken(db);

  const settings = await loadIdeasoftIntegrationSettings(db);
  const authResolved = getIdeasoftStoreAuth(settings);
  if (!authResolved) {
    return new Response(
      JSON.stringify({
        error: 'IdeaSoft mağaza adresi ve erişim token’ı gerekli (store_base_url, IDEASOFT_ACCESS_TOKEN).',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const ct = () => ({ 'Content-Type': 'application/json' as const });
  const run = (token: string) => doFetch(authResolved.storeBase, token, pathAndQuery, init);

  let res = await run(authResolved.token);
  let text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  const oauthErrInBody = isIdeasoftOAuthAuthErrorBody(body);
  const shouldTryRefresh =
    oauthErrInBody ||
    res.status === 401 ||
    (res.status === 403 && isIdeasoftTokenInvalidError(body)) ||
    (!res.ok && isIdeasoftTokenInvalidError(body));

  if (!shouldTryRefresh && (res.ok || res.status === 204)) {
    return new Response(text, { status: res.status, headers: ct() });
  }
  if (!shouldTryRefresh) {
    return new Response(text, { status: res.status, headers: ct() });
  }

  const refreshed = await tryIdeasoftRefreshAccessToken(db, authResolved.storeBase);
  if (!refreshed) {
    const statusOut = oauthErrInBody && res.ok ? 401 : res.status;
    return new Response(text, { status: statusOut, headers: ct() });
  }
  const settings2 = await loadIdeasoftIntegrationSettings(db);
  const auth2 = getIdeasoftStoreAuth(settings2);
  if (!auth2) {
    const statusOut = oauthErrInBody && res.ok ? 401 : res.status;
    return new Response(text, { status: statusOut, headers: ct() });
  }
  return run(auth2.token);
}

export async function ideasoftDoStoreRequestWithRefresh(
  db: D1Database,
  pathAndQuery: string,
  init: RequestInit | undefined,
  _settings: Record<string, string>,
  auth: { storeBase: string; token: string }
): Promise<Response> {
  return ideasoftDoRequestWithRefresh(db, pathAndQuery, init, ideasoftStoreApiRequest, auth);
}

/** Admin API proxy — aynı OAuth; path `/currencies` → GET {base}/admin-api/currencies */
export async function ideasoftDoAdminRequestWithRefresh(
  db: D1Database,
  pathAndQuery: string,
  init: RequestInit | undefined,
  _settings: Record<string, string>,
  auth: { storeBase: string; token: string }
): Promise<Response> {
  return ideasoftDoRequestWithRefresh(db, pathAndQuery, init, ideasoftAdminApiRequest, auth);
}
