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
    const page = Math.max(1, parseInt(c.req.query('page') || '1'));
    const limit = Math.min(9999, Math.max(1, parseInt(c.req.query('limit') || '10')));
    const offset = (page - 1) * limit;
    let where = 'WHERE p.is_deleted = 0';
    const params: (string | number)[] = [];
    if (search) {
      where += ' AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    const countRes = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM products p ${where}`
    ).bind(...params).first<{ total: number }>();
    const { results } = await c.env.DB.prepare(
      `SELECT p.id, p.name, p.sku, p.barcode, p.brand_id, p.category_id, p.type_id, p.unit_id, p.currency_id,
       p.price, p.quantity, p.image, p.tax_rate, p.supplier_code, p.gtip_code, p.sort_order, p.status,
       p.created_at, p.updated_at,
       b.name as brand_name, c.name as category_name, c.color as category_color, t.name as type_name, t.color as type_color, u.name as unit_name, cur.symbol as currency_symbol
       FROM products p
       LEFT JOIN product_brands b ON p.brand_id = b.id AND b.is_deleted = 0
       LEFT JOIN product_categories c ON p.category_id = c.id AND c.is_deleted = 0
       LEFT JOIN product_types t ON p.type_id = t.id AND t.is_deleted = 0
       LEFT JOIN product_unit u ON p.unit_id = u.id AND u.is_deleted = 0
       LEFT JOIN product_currencies cur ON p.currency_id = cur.id AND cur.is_deleted = 0
       ${where} ORDER BY p.sort_order, p.name LIMIT ? OFFSET ?`
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

app.get('/api/products/:id', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const row = await c.env.DB.prepare(
      `SELECT p.*, b.name as brand_name, c.name as category_name, c.color as category_color, t.name as type_name, t.color as type_color, u.name as unit_name, cur.name as currency_name, cur.symbol as currency_symbol
       FROM products p
       LEFT JOIN product_brands b ON p.brand_id = b.id AND b.is_deleted = 0
       LEFT JOIN product_categories c ON p.category_id = c.id AND c.is_deleted = 0
       LEFT JOIN product_types t ON p.type_id = t.id AND t.is_deleted = 0
       LEFT JOIN product_unit u ON p.unit_id = u.id AND u.is_deleted = 0
       LEFT JOIN product_currencies cur ON p.currency_id = cur.id AND cur.is_deleted = 0
       WHERE p.id = ? AND p.is_deleted = 0`
    ).bind(id).first();
    if (!row) return c.json({ error: 'Ürün bulunamadı' }, 404);
    return c.json(row);
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
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM products WHERE id = last_insert_rowid()`
    ).all();
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
    const { results } = await c.env.DB.prepare(`SELECT * FROM products WHERE id = ?`).bind(id).all();
    return c.json(results![0]);
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
app.get('/api/products/:id/package-items', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
    const id = c.req.param('id');
    const { results } = await c.env.DB.prepare(
      `SELECT pi.id, pi.product_id, pi.item_product_id, pi.quantity, pi.sort_order,
       p.name as item_name, p.sku as item_sku
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
    const { results } = await c.env.DB.prepare(
      `SELECT pi.id, pi.product_id, pi.item_product_id, pi.quantity, pi.sort_order,
       p.name as item_name, p.sku as item_sku
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
      where += ' AND (name LIKE ? OR code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
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
      where += ' AND (name LIKE ? OR code LIKE ? OR symbol LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
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
      where += ' AND (name LIKE ? OR description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
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
      where += ' AND (name LIKE ? OR code LIKE ? OR description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
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
      where += ' AND (name LIKE ? OR code LIKE ? OR city LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
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
    const page = Math.max(1, parseInt(c.req.query('page') || '1'));
    const limit = Math.min(9999, Math.max(1, parseInt(c.req.query('limit') || '100')));
    const offset = (page - 1) * limit;
    let where = 'WHERE s.is_deleted = 0 AND (s.status = 1 OR s.status IS NULL)';
    const params: (string | number)[] = [];
    if (search) {
      where += ' AND (s.name LIKE ? OR s.table_name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    const countRes = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM suppliers s ${where}`
    ).bind(...params).first<{ total: number }>();
    const { results } = await c.env.DB.prepare(
      `SELECT s.id, s.name, s.brand_id, s.source_type, s.currency_id, s.source_file, s.table_name,
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
      source_file?: string; table_name?: string; record_count?: number;
      column_mappings?: string; column_types?: string; sort_order?: number; status?: number;
    }>();
    const name = (body.name || '').trim();
    if (!name) return c.json({ error: 'Tedarikçi adı gerekli' }, 400);
    const brand_id = body.brand_id ?? null;
    const source_type = (body.source_type || 'excel').trim();
    const currency_id = body.currency_id ?? null;
    const source_file = body.source_file?.trim() || null;
    const table_name = body.table_name?.trim() || null;
    const record_count = body.record_count ?? 0;
    const column_mappings = body.column_mappings?.trim() || null;
    const column_types = body.column_types?.trim() || null;
    const sort_order = body.sort_order ?? 0;
    const status = body.status !== undefined ? (body.status ? 1 : 0) : 1;
    await c.env.DB.prepare(
      `INSERT INTO suppliers (name, brand_id, source_type, currency_id, source_file, table_name, record_count, column_mappings, column_types, sort_order, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(name, brand_id, source_type, currency_id, source_file, table_name, record_count, column_mappings, column_types, sort_order, status).run();
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
      source_file?: string; table_name?: string; record_count?: number;
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
    if (body.table_name !== undefined) { updates.push('table_name = ?'); values.push(body.table_name?.trim() || null); }
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

// R2 Storage - Dosya yükle
// preserveFilename=true: İkonlar klasörü için - orijinal dosya adı korunur (boyut/format işlemleri client'ta uygulanır)
app.post('/storage/upload', async (c) => {
  try {
    if (!c.env.STORAGE) return c.json({ error: 'R2 Storage bulunamadı' }, 500);
    const body = await c.req.parseBody();
    const file = body.file;
    const folder = (body.folder as string) || 'images/';
    const preserveFilename = body.preserveFilename === 'true' || body.preserveFilename === true;
    if (!file || typeof file === 'string') return c.json({ error: 'Dosya gerekli' }, 400);

    const f = file as File;
    const ext = f.name.split('.').pop()?.toLowerCase() || 'png';
    const safeExt = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext) ? ext : 'png';

    let key: string;
    if (preserveFilename) {
      // Orijinal dosya adını koru (güvenli karakterlere çevir)
      const baseName = f.name.replace(/\.[^.]+$/, '');
      const safeName = baseName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'icon';
      const finalName = `${safeName}.${safeExt}`;
      key = `${folder.replace(/\/+$/, '')}/${finalName}`;
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
    if (!c.env.DB) return c.json({ error: 'DB bulunamadı' }, 500);
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
