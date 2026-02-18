import { Hono } from 'hono';
import { cors } from 'hono/cors';

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
    const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') || '10')));
    const offset = (page - 1) * limit;

    let where = 'WHERE is_deleted = 0 AND status = 1';
    const params: (string | number)[] = [];
    if (search) {
      where += ' AND (name LIKE ? OR code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const countRes = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM product_brands ${where}`
    ).bind(...params).first<{ total: number }>();

    const { results } = await c.env.DB.prepare(
      `SELECT id, name, code, slug, image, description, website, country, sort_order, created_at
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
      `SELECT id, name, code, slug, image, description, website, country, sort_order, created_at, updated_at
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
      description?: string; website?: string; country?: string; sort_order?: number;
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

    const existing = await c.env.DB.prepare(
      `SELECT id FROM product_brands WHERE code = ? AND is_deleted = 0`
    ).bind(code).first();
    if (existing) return c.json({ error: 'Bu kod zaten kullanılıyor' }, 409);

    await c.env.DB.prepare(
      `INSERT INTO product_brands (name, code, slug, image, description, website, country, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(name, code, slug, image, description, website, country, sort_order).run();

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
      description?: string; website?: string; country?: string; sort_order?: number;
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

    if (updates.length === 0) return c.json({ error: 'Güncellenecek alan yok' }, 400);

    updates.push("updated_at = datetime('now')");
    values.push(id);

    await c.env.DB.prepare(
      `UPDATE product_brands SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run();

    const row = await c.env.DB.prepare(
      `SELECT id, name, code, slug, image, description, website, country, sort_order, created_at, updated_at
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
    const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') || '10')));
    const offset = (page - 1) * limit;
    let where = 'WHERE is_deleted = 0 AND status = 1';
    const params: (string | number)[] = [];
    if (search) {
      where += ' AND (name LIKE ? OR code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    const countRes = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM products_units ${where}`
    ).bind(...params).first<{ total: number }>();
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, code, description, sort_order, created_at FROM products_units ${where}
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
    const body = await c.req.json<{ name: string; code?: string; description?: string; sort_order?: number }>();
    const name = (body.name || '').trim();
    if (!name) return c.json({ error: 'Birim adı gerekli' }, 400);
    const code = (body.code || name.slice(0, 2).toUpperCase()).trim();
    const description = body.description?.trim() || null;
    const sort_order = body.sort_order ?? 0;
    const existing = await c.env.DB.prepare(
      `SELECT id FROM products_units WHERE code = ? AND is_deleted = 0`
    ).bind(code).first();
    if (existing) return c.json({ error: 'Bu kod zaten kullanılıyor' }, 409);
    await c.env.DB.prepare(
      `INSERT INTO products_units (name, code, description, sort_order) VALUES (?, ?, ?, ?)`
    ).bind(name, code, description, sort_order).run();
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, code, description, sort_order, created_at FROM products_units WHERE id = last_insert_rowid()`
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
    const body = await c.req.json<{ name?: string; code?: string; description?: string; sort_order?: number }>();
    const existing = await c.env.DB.prepare(`SELECT id FROM products_units WHERE id = ? AND is_deleted = 0`).bind(id).first();
    if (!existing) return c.json({ error: 'Birim bulunamadı' }, 404);
    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name.trim()); }
    if (body.code !== undefined) { updates.push('code = ?'); values.push(body.code.trim()); }
    if (body.description !== undefined) { updates.push('description = ?'); values.push(body.description?.trim() || null); }
    if (body.sort_order !== undefined) { updates.push('sort_order = ?'); values.push(body.sort_order); }
    if (updates.length === 0) return c.json({ error: 'Güncellenecek alan yok' }, 400);
    updates.push("updated_at = datetime('now')");
    values.push(id);
    await c.env.DB.prepare(`UPDATE products_units SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    const row = await c.env.DB.prepare(
      `SELECT id, name, code, description, sort_order, created_at, updated_at FROM products_units WHERE id = ?`
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
      `UPDATE products_units SET is_deleted = 1, status = 0, updated_at = datetime('now') WHERE id = ? AND is_deleted = 0`
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
    const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') || '10')));
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
      `SELECT id, name, code, description, sort_order, created_at FROM product_groups ${where}
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
    const body = await c.req.json<{ name: string; code?: string; description?: string; sort_order?: number }>();
    const name = (body.name || '').trim();
    if (!name) return c.json({ error: 'Grup adı gerekli' }, 400);
    const code = (body.code || name.slice(0, 2).toUpperCase()).trim();
    const description = body.description?.trim() || null;
    const sort_order = body.sort_order ?? 0;
    const existing = await c.env.DB.prepare(
      `SELECT id FROM product_groups WHERE code = ? AND is_deleted = 0`
    ).bind(code).first();
    if (existing) return c.json({ error: 'Bu kod zaten kullanılıyor' }, 409);
    await c.env.DB.prepare(
      `INSERT INTO product_groups (name, code, description, sort_order) VALUES (?, ?, ?, ?)`
    ).bind(name, code, description, sort_order).run();
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, code, description, sort_order, created_at FROM product_groups WHERE id = last_insert_rowid()`
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
    const body = await c.req.json<{ name?: string; code?: string; description?: string; sort_order?: number }>();
    const existing = await c.env.DB.prepare(`SELECT id FROM product_groups WHERE id = ? AND is_deleted = 0`).bind(id).first();
    if (!existing) return c.json({ error: 'Grup bulunamadı' }, 404);
    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name.trim()); }
    if (body.code !== undefined) { updates.push('code = ?'); values.push(body.code.trim()); }
    if (body.description !== undefined) { updates.push('description = ?'); values.push(body.description?.trim() || null); }
    if (body.sort_order !== undefined) { updates.push('sort_order = ?'); values.push(body.sort_order); }
    if (updates.length === 0) return c.json({ error: 'Güncellenecek alan yok' }, 400);
    updates.push("updated_at = datetime('now')");
    values.push(id);
    await c.env.DB.prepare(`UPDATE product_groups SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    const row = await c.env.DB.prepare(
      `SELECT id, name, code, description, sort_order, created_at, updated_at FROM product_groups WHERE id = ?`
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
    const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') || '10')));
    const offset = (page - 1) * limit;
    let where = 'WHERE is_deleted = 0 AND status = 1';
    const params: (string | number)[] = [];
    if (search) {
      where += ' AND (name LIKE ? OR code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (groupId) {
      where += ' AND group_id = ?';
      params.push(parseInt(groupId));
    }
    if (categoryId !== undefined && categoryId !== '') {
      if (categoryId === 'null' || categoryId === '') {
        where += ' AND category_id IS NULL';
      } else {
        where += ' AND category_id = ?';
        params.push(parseInt(categoryId));
      }
    }
    const countRes = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM product_categories ${where}`
    ).bind(...params).first<{ total: number }>();
    const { results } = await c.env.DB.prepare(
      `SELECT id, group_id, category_id, name, code, slug, description, image, icon, sort_order, created_at
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
      description?: string; image?: string; icon?: string; sort_order?: number;
    }>();
    const name = (body.name || '').trim();
    if (!name) return c.json({ error: 'Kategori adı gerekli' }, 400);
    const code = (body.code || name.slice(0, 2).toUpperCase()).trim();
    const slug = body.slug?.trim() || name.toLowerCase().replace(/\s+/g, '-');
    const group_id = body.group_id ?? null;
    const category_id = body.category_id ?? null;
    const description = body.description?.trim() || null;
    const image = body.image?.trim() || null;
    const icon = body.icon?.trim() || null;
    const sort_order = body.sort_order ?? 0;
    await c.env.DB.prepare(
      `INSERT INTO product_categories (name, code, slug, group_id, category_id, description, image, icon, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(name, code, slug, group_id, category_id, description, image, icon, sort_order).run();
    const { results } = await c.env.DB.prepare(
      `SELECT id, group_id, category_id, name, code, slug, description, image, icon, sort_order, created_at
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
      description?: string; image?: string; icon?: string; sort_order?: number;
    }>();
    const existing = await c.env.DB.prepare(`SELECT id FROM product_categories WHERE id = ? AND is_deleted = 0`).bind(id).first();
    if (!existing) return c.json({ error: 'Kategori bulunamadı' }, 404);
    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name.trim()); }
    if (body.code !== undefined) { updates.push('code = ?'); values.push(body.code.trim()); }
    if (body.slug !== undefined) { updates.push('slug = ?'); values.push(body.slug?.trim() || null); }
    if (body.group_id !== undefined) { updates.push('group_id = ?'); values.push(body.group_id); }
    if (body.category_id !== undefined) { updates.push('category_id = ?'); values.push(body.category_id); }
    if (body.description !== undefined) { updates.push('description = ?'); values.push(body.description?.trim() || null); }
    if (body.image !== undefined) { updates.push('image = ?'); values.push(body.image?.trim() || null); }
    if (body.icon !== undefined) { updates.push('icon = ?'); values.push(body.icon?.trim() || null); }
    if (body.sort_order !== undefined) { updates.push('sort_order = ?'); values.push(body.sort_order); }
    if (updates.length === 0) return c.json({ error: 'Güncellenecek alan yok' }, 400);
    updates.push("updated_at = datetime('now')");
    values.push(id);
    await c.env.DB.prepare(`UPDATE product_categories SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    const row = await c.env.DB.prepare(
      `SELECT id, group_id, category_id, name, code, slug, description, image, icon, sort_order, created_at, updated_at
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
