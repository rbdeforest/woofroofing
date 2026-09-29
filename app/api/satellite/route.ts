import { DEMO_MODE, GOOGLE_KEY, json, parseCoord, rateLimited } from "@/lib/server";

// Proxies Google Static Maps so the API key never reaches the browser.
// Browsers and CDNs cache the image for a day, so repeat views are free.

function demoSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400">
  <rect width="640" height="400" fill="#4a5d3a"/>
  <rect x="0" y="300" width="640" height="46" fill="#77726a"/>
  <rect x="120" y="40" width="70" height="60" fill="#3d7a9e" rx="6"/>
  <circle cx="540" cy="80" r="45" fill="#2f4a26"/><circle cx="80" cy="230" r="38" fill="#2f4a26"/>
  <polygon points="220,90 420,90 470,160 420,230 220,230 170,160" fill="#8a6f5c"/>
  <polygon points="220,90 420,90 470,160 170,160" fill="#9c8069"/>
  <polygon points="220,90 420,90 470,160 420,230 220,230 170,160" fill="#ffcc00" fill-opacity=".18" stroke="#ffcc00" stroke-width="4"/>
  <rect x="300" y="230" width="40" height="70" fill="#8d887f"/>
  <text x="320" y="385" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#fff" fill-opacity=".8">Demo imagery. Add a Google key for real satellite photos.</text>
</svg>`;
}

export async function GET(req: Request) {
  if (rateLimited(req)) return json({ error: "Too many requests" }, 429);
  const url = new URL(req.url);
  const lat = parseCoord(url.searchParams.get("lat"), 90);
  const lng = parseCoord(url.searchParams.get("lng"), 180);
  if (lat === null || lng === null) return json({ error: "Invalid coordinates" }, 400);

  if (DEMO_MODE) return new Response(demoSvg(), { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" } });

  const box = ["swLat", "swLng", "neLat", "neLng"].map((k) => parseCoord(url.searchParams.get(k), 180));
  const hasBox = box.every((v) => v !== null);
  const [s, w, n, e] = box as number[];
  const params = new URLSearchParams({
    // Center on the measured building so the outline is always in frame.
    center: hasBox ? `${(s + n) / 2},${(w + e) / 2}` : `${lat},${lng}`,
    zoom: "20",
    size: "640x400",
    scale: "2",
    maptype: "satellite",
    key: GOOGLE_KEY,
  });
  // Outline the measured building if we were given its bounding box.
  if (hasBox) {
    params.append("path", `color:0xffcc00ff|weight:3|fillcolor:0xffcc0026|${s},${w}|${n},${w}|${n},${e}|${s},${e}|${s},${w}`);
  } else {
    params.append("markers", `color:red|${lat},${lng}`);
  }
  const r = await fetch(`https://maps.googleapis.com/maps/api/staticmap?${params}`);
  if (!r.ok) {
    console.error("Static Maps", r.status, await r.text());
    return json({ error: "Satellite image unavailable" }, 502);
  }
  return new Response(r.body, {
    headers: { "Content-Type": r.headers.get("Content-Type") || "image/png", "Cache-Control": "public, max-age=86400" },
  });
}
