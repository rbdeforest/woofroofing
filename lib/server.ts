// Server-only helpers: Google config, a small TTL cache, and a per-IP rate limiter.
// All in-memory, which is plenty for a few dozen concurrent users.

export const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY || "";
export const DEMO_MODE = !GOOGLE_KEY || process.env.DEMO_MODE === "1";

type Entry<T> = { value: T; expires: number };

export class TTLCache<T> {
  private map = new Map<string, Entry<T>>();
  constructor(private ttlMs: number, private max = 2000) {}
  get(key: string): T | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.expires < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return e.value;
  }
  set(key: string, value: T) {
    if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value as string);
    this.map.set(key, { value, expires: Date.now() + this.ttlMs });
  }
}

// Generous on purpose: a room of 30 people on conference wifi shares one IP.
// 30 people typing addresses is ~1,000 requests a minute from one IP. This only
// exists to stop a runaway script from burning API credits.
const hits = new Map<string, { count: number; reset: number }>();
export function rateLimited(req: Request, limitPerMinute = 5000): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || h.reset < now) {
    hits.set(ip, { count: 1, reset: now + 60_000 });
    return false;
  }
  h.count++;
  return h.count > limitPerMinute;
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export function parseCoord(v: string | null, limit: number): number | null {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}

// Deterministic pseudo-random numbers so demo addresses always give the same roof.
export function seeded(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}
