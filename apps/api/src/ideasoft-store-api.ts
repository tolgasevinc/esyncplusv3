import type { D1Database } from '@cloudflare/workers-types';

/** Mağaza kök URL (https://...myideasoft.com) — sondaki / atılır */
export function normalizeIdeasoftStoreBase(raw: string): string {
  let s = (raw || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s.replace(/\/+$/, '');
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

/** Store API Bearer: IDEASOFT_ACCESS_TOKEN (OAuth) + mağaza adresi */
export function getIdeasoftStoreAuth(settings: Record<string, string>): { storeBase: string; token: string } | null {
  const storeBase = normalizeIdeasoftStoreBase(settings.store_base_url ?? settings.storeBaseUrl ?? '');
  const token = (settings.IDEASOFT_ACCESS_TOKEN ?? '').trim();
  if (!storeBase || !token) return null;
  return { storeBase, token };
}

/**
 * IdeaSoft Store API — taban: {storeBase}/api/...
 * Örnek: pathAndQuery = "/currencies?page=1&limit=20"
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
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  headers.set('Authorization', `Bearer ${token}`);
  if (init?.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(url, { ...init, headers });
}
