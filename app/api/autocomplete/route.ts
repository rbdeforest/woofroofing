import { DEMO_MODE, GOOGLE_KEY, TTLCache, json, rateLimited } from "@/lib/server";
import type { Suggestion } from "@/lib/types";

const cache = new TTLCache<Suggestion[]>(10 * 60_000);

const DEMO_CITIES = [
  "Austin, TX 78704",
  "Denver, CO 80206",
  "Charlotte, NC 28203",
  "Columbus, OH 43214",
  "Nashville, TN 37212",
];

async function google(input: string, session: string, typed: boolean): Promise<Suggestion[]> {
  const body: Record<string, unknown> = {
    input,
    includedRegionCodes: ["us"],
    ...(session ? { sessionToken: session } : {}),
    ...(typed ? { includedPrimaryTypes: ["street_address", "premise", "subpremise"] } : {}),
  };
  const r = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GOOGLE_KEY },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Places autocomplete ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return (data.suggestions || [])
    .filter((s: any) => s.placePrediction)
    .map((s: any) => ({
      placeId: s.placePrediction.placeId,
      main: s.placePrediction.structuredFormat?.mainText?.text || s.placePrediction.text.text,
      secondary: s.placePrediction.structuredFormat?.secondaryText?.text || "",
    }));
}

export async function GET(req: Request) {
  if (rateLimited(req)) return json({ error: "Too many requests" }, 429);
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim().slice(0, 200);
  const session = (url.searchParams.get("session") || "").slice(0, 64);
  if (q.length < 3) return json({ suggestions: [] });

  if (DEMO_MODE) {
    const street = /\d/.test(q) ? q : `123 ${q}`;
    const suggestions = DEMO_CITIES.map((city) => ({
      placeId: `demo:${encodeURIComponent(`${street}, ${city}`)}`,
      main: street.replace(/\b\w/g, (c) => c.toUpperCase()),
      secondary: `${city}, USA`,
    }));
    return json({ suggestions });
  }

  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit) return json({ suggestions: hit });
  try {
    // Prefer street addresses; fall back to any match so partial input still shows something.
    let suggestions = await google(q, session, true);
    if (suggestions.length === 0) suggestions = await google(q, session, false);
    cache.set(key, suggestions);
    return json({ suggestions });
  } catch (e) {
    console.error(e);
    return json({ error: "Address search is unavailable right now" }, 502);
  }
}
