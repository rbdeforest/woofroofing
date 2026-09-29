import { DEMO_MODE, GOOGLE_KEY, TTLCache, json, rateLimited, seeded } from "@/lib/server";
import type { Place } from "@/lib/types";

const cache = new TTLCache<Place>(24 * 60 * 60_000);

export async function GET(req: Request) {
  if (rateLimited(req)) return json({ error: "Too many requests" }, 429);
  const url = new URL(req.url);
  const id = url.searchParams.get("id") || "";
  const session = (url.searchParams.get("session") || "").slice(0, 64);
  if (!id || id.length > 500) return json({ error: "Missing place id" }, 400);

  if (id.startsWith("demo:")) {
    const address = decodeURIComponent(id.slice(5)).replace(/^[^,]+/, (s) => s.replace(/\b\w/g, (c) => c.toUpperCase()));
    const rand = seeded(address);
    return json({
      placeId: id,
      address: `${address}, USA`,
      lat: 30 + rand() * 12,
      lng: -120 + rand() * 40,
    } satisfies Place);
  }
  if (DEMO_MODE) return json({ error: "Demo mode only supports demo addresses" }, 400);

  const hit = cache.get(id);
  if (hit) return json(hit);
  try {
    const qs = session ? `?sessionToken=${encodeURIComponent(session)}` : "";
    const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}${qs}`, {
      headers: { "X-Goog-Api-Key": GOOGLE_KEY, "X-Goog-FieldMask": "id,formattedAddress,location" },
    });
    if (!r.ok) throw new Error(`Place details ${r.status}: ${await r.text()}`);
    const d = await r.json();
    const place: Place = {
      placeId: id,
      address: d.formattedAddress,
      lat: d.location.latitude,
      lng: d.location.longitude,
    };
    cache.set(id, place);
    return json(place);
  } catch (e) {
    console.error(e);
    return json({ error: "Could not look up that address" }, 502);
  }
}
