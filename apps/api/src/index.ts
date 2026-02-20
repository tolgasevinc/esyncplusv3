import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createConnection } from 'mysql2/promise';

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

// R2 Storage - Klasör içeriği listele
app.get('/storage/list', async (c) => {
  try {
    if (!c.env.STORAGE) {
      return c.json({ error: 'R2 Storage bağlantısı bulunamadı!' }, 500);
    }

    const prefix = c.req.query('prefix') || '';
    const { objects } = await c.env.STORAGE.list({ prefix, limit: 100 });

    return c.json(
      objects.map((o) => ({
        key: o.key,
        size: o.size,
        uploaded: o.uploaded,
      }))
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return c.json({ error: message }, 500);
  }
});

// R2 Storage - Mevcut prefix'leri listele (klasör seçimi için)
// prefix query param: belirtilirse sadece o prefix altındaki alt klasörleri döner
app.get('/storage/prefixes', async (c) => {
  try {
    if (!c.env.STORAGE) {
      return c.json({ error: 'R2 Storage bağlantısı bulunamadı!' }, 500);
    }

    const basePrefix = (c.req.query('prefix') || '').replace(/\/+$/, '');
    const searchPrefix = basePrefix ? `${basePrefix}/` : '';
    const { objects } = await c.env.STORAGE.list({ prefix: searchPrefix, limit: 1000 });

    const prefixes = new Set<string>();
    for (const o of objects) {
      const rest = o.key.slice(searchPrefix.length);
      const idx = rest.indexOf('/');
      if (idx > 0) {
        prefixes.add(searchPrefix + rest.slice(0, idx + 1));
      } else if (rest && !rest.includes('/')) {
        prefixes.add(searchPrefix);
      }
    }
    if (!basePrefix && c.env.DB) {
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
      where += ' AND (name LIKE ? OR code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
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
      where += ' AND (name LIKE ? OR code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
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

// ========== PRODUCT GROUPS (Gruplar) ==========
app.get('/api/product-groups', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const search = (c.req.query('search') || '').trim();
    const page = Math.max(1, parseInt(c.req.query('page') || '1'));
    const limit = Math.min(9999, Math.max(1, parseInt(c.req.query('limit') || '10')));
    const offset = (page - 1) * limit;
    let where = 'WHERE is_deleted = 0 AND status = 1';
    const params: (string | number)[] = [];
    if (search) {
      where += ' AND (name LIKE ? OR code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    const countRes = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM product_groups ${where}`
    ).bind(...params).first<{ total: number }>();
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, code, description, sort_order, status, created_at FROM product_groups ${where}
       ORDER BY sort_order, name LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all();
    return c.json({ data: results, total: countRes?.total ?? 0, page, limit });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.post('/api/product-groups', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req.json<{ name: string; code?: string; description?: string; sort_order?: number; status?: number }>();
    const name = (body.name || '').trim();
    if (!name) return c.json({ error: 'Grup adı gerekli' }, 400);
    const code = (body.code || name.slice(0, 2).toUpperCase()).trim();
    const description = body.description?.trim() || null;
    const sort_order = body.sort_order ?? 0;
    const status = body.status !== undefined ? (body.status ? 1 : 0) : 1;
    const existing = await c.env.DB.prepare(
      `SELECT id FROM product_groups WHERE code = ? AND is_deleted = 0`
    ).bind(code).first();
    if (existing) return c.json({ error: 'Bu kod zaten kullanılıyor' }, 409);
    await c.env.DB.prepare(
      `INSERT INTO product_groups (name, code, description, sort_order, status) VALUES (?, ?, ?, ?, ?)`
    ).bind(name, code, description, sort_order, status).run();
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, code, description, sort_order, status, created_at FROM product_groups WHERE id = last_insert_rowid()`
    ).all();
    return c.json(results![0], 201);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.put('/api/product-groups/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const body = await c.req.json<{ name?: string; code?: string; description?: string; sort_order?: number; status?: number }>();
    const existing = await c.env.DB.prepare(`SELECT id FROM product_groups WHERE id = ? AND is_deleted = 0`).bind(id).first();
    if (!existing) return c.json({ error: 'Grup bulunamadı' }, 404);
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
    await c.env.DB.prepare(`UPDATE product_groups SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    const row = await c.env.DB.prepare(
      `SELECT id, name, code, description, sort_order, status, created_at, updated_at FROM product_groups WHERE id = ?`
    ).bind(id).first();
    return c.json(row);
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.delete('/api/product-groups/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const res = await c.env.DB.prepare(
      `UPDATE product_groups SET is_deleted = 1, status = 0, updated_at = datetime('now') WHERE id = ? AND is_deleted = 0`
    ).bind(id).run();
    if (res.meta.changes === 0) return c.json({ error: 'Grup bulunamadı' }, 404);
    return c.json({ success: true });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

// ========== PRODUCT CATEGORIES (Kategoriler) ==========
app.get('/api/product-categories', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const search = (c.req.query('search') || '').trim();
    const groupId = c.req.query('group_id');
    const categoryId = c.req.query('category_id');
    const page = Math.max(1, parseInt(c.req.query('page') || '1'));
    const limit = Math.min(9999, Math.max(1, parseInt(c.req.query('limit') || '10')));
    const offset = (page - 1) * limit;
    let where = 'WHERE is_deleted = 0 AND status = 1';
    const params: (string | number)[] = [];
    if (search) {
      where += ' AND (name LIKE ? OR code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
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
      `SELECT id, group_id, category_id, name, code, slug, description, image, icon, sort_order, status, created_at
       FROM product_categories ${where} ORDER BY sort_order, name LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all();
    return c.json({ data: results, total: countRes?.total ?? 0, page, limit });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
  }
});

app.post('/api/product-categories', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const body = await c.req.json<{
      name: string; code?: string; slug?: string; group_id?: number; category_id?: number;
      description?: string; image?: string; icon?: string; sort_order?: number; status?: number;
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
    const sort_order = body.sort_order ?? 0;
    const status = body.status !== undefined ? (body.status ? 1 : 0) : 1;
    await c.env.DB.prepare(
      `INSERT INTO product_categories (name, code, slug, group_id, category_id, description, image, icon, sort_order, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(name, code, slug, group_id, category_id, description, image, icon, sort_order, status).run();
    const { results } = await c.env.DB.prepare(
      `SELECT id, group_id, category_id, name, code, slug, description, image, icon, sort_order, status, created_at
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
      description?: string; image?: string; icon?: string; sort_order?: number; status?: number;
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
    if (body.sort_order !== undefined) { updates.push('sort_order = ?'); values.push(body.sort_order); }
    if (body.status !== undefined) { updates.push('status = ?'); values.push(body.status ? 1 : 0); }
    if (updates.length === 0) return c.json({ error: 'Güncellenecek alan yok' }, 400);
    updates.push("updated_at = datetime('now')");
    values.push(id);
    await c.env.DB.prepare(`UPDATE product_categories SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    const row = await c.env.DB.prepare(
      `SELECT id, group_id, category_id, name, code, slug, description, image, icon, sort_order, status, created_at, updated_at
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

// R2 Storage - Dosya yükle
app.post('/storage/upload', async (c) => {
  try {
    if (!c.env.STORAGE) return c.json({ error: 'R2 Storage bulunamadı' }, 500);
    const body = await c.req.parseBody();
    const file = body.file;
    const folder = (body.folder as string) || 'images/';
    if (!file || typeof file === 'string') return c.json({ error: 'Dosya gerekli' }, 400);

    const f = file as File;
    const ext = f.name.split('.').pop()?.toLowerCase() || 'png';
    const safeExt = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext) ? ext : 'png';
    const key = `${folder.replace(/\/+$/, '')}/${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`;

    const buf = await f.arrayBuffer();
    await c.env.STORAGE.put(key, buf, {
      httpMetadata: { contentType: f.type || `image/${safeExt}` },
    });

    return c.json({ path: key });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Yükleme hatası' }, 500);
  }
});

// R2 Storage - Dosya sun (görsel gösterimi için)
app.get('/storage/serve', async (c) => {
  try {
    if (!c.env.STORAGE) return c.json({ error: 'R2 Storage bulunamadı' }, 500);
    const key = c.req.query('key');
    if (!key) return c.json({ error: 'key gerekli' }, 400);

    const obj = await c.env.STORAGE.get(key);
    if (!obj) return c.json({ error: 'Dosya bulunamadı' }, 404);

    const ct = obj.httpMetadata?.contentType || 'image/png';
    return new Response(obj.body, {
      headers: {
        'Content-Type': ct,
        'Cache-Control': 'public, max-age=86400',
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
    const limit = Math.min(parseInt(c.req.query('limit') || '100') || 100, 500);
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
    const tables = ['product_brands', 'product_categories', 'product_groups', 'product_unit', 'app_settings'];
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

// ========== APP SETTINGS ==========
app.get('/api/app-settings', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
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
    return c.json({ error: err instanceof Error ? err.message : 'Hata' }, 500);
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
    const res = await fetch(url, { headers: { 'User-Agent': 'eSync+/1.0' } });
    if (!res.ok) return c.json({ error: 'Görsel alınamadı' }, 400);
    const ct = res.headers.get('content-type') || 'image/png';
    const buf = await res.arrayBuffer();
    return new Response(buf, {
      headers: { 'Content-Type': ct, 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err: unknown) {
    return c.json({ error: err instanceof Error ? err.message : 'Proxy hatası' }, 500);
  }
});

export default app;
