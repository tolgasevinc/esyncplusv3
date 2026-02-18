import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => c.text("Hello from Hono on Cloudflare Workers!"));

app.get("/api/hello", (c) =>
  c.json({ message: "Hello World", timestamp: new Date().toISOString() })
);

export default app;
