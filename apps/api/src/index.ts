import { Hono } from 'hono'
import { cors } from 'hono/cors'

<{ Bindings: { DB: D1Database } }>()

// Tüm isteklere izin ver
app.use('/*', cors())

app.get('/', async (c) => {
const { results } = await c.env.DB.prepare("SELECT * FROM users").all();
return c.json(results);
})

export default app
