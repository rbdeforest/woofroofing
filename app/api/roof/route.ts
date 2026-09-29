import { DEMO_MODE, GOOGLE_KEY, TTLCache, json, parseCoord, rateLimited, seeded } from "@/lib/server";
import type { BBox, RoofMeasurement, RoofSegment } from "@/lib/types";

const SQFT_PER_M2 = 10.7639;
const cache = new TTLCache<RoofMeasurement>(24 * 60 * 60_000);

// Used when Google has no Solar coverage for the address: a typical US single-family roof.
const FALLBACK: RoofMeasurement = {
  source: "fallback",
  areaSqft: 2400,
  footprintSqft: 2150,
  avgPitchDegrees: 26.6, // 6/12
  segments: [],
  note: "Google has no roof measurement for this address, so this uses a typical single-family roof.",
};

function summarize(segments: RoofSegment[], footprintSqft: number): Pick<RoofMeasurement, "areaSqft" | "footprintSqft" | "avgPitchDegrees"> {
  const areaSqft = segments.reduce((s, x) => s + x.areaSqft, 0);
  const avgPitchDegrees = areaSqft ? segments.reduce((s, x) => s + x.pitchDegrees * x.areaSqft, 0) / areaSqft : 0;
  return { areaSqft: Math.round(areaSqft), footprintSqft: Math.round(footprintSqft), avgPitchDegrees };
}

function demoRoof(lat: number, lng: number): RoofMeasurement {
  const rand = seeded(`${lat.toFixed(5)},${lng.toFixed(5)}`);
  const count = 4 + Math.floor(rand() * 7);
  const footprint = 1500 + rand() * 1800;
  const basePitch = 18 + rand() * 20;
  const segments: RoofSegment[] = Array.from({ length: count }, (_, i) => {
    const pitch = Math.max(8, basePitch + (rand() - 0.5) * 8);
    const ground = (footprint / count) * (0.6 + rand() * 0.8);
    return { areaSqft: ground / Math.cos((pitch * Math.PI) / 180), pitchDegrees: pitch, azimuthDegrees: (i * 90 + rand() * 20) % 360 };
  });
  const groundSum = segments.reduce((s, x) => s + x.areaSqft * Math.cos((x.pitchDegrees * Math.PI) / 180), 0);
  return { source: "demo", segments, imageryQuality: "DEMO", imageryDate: "2025-06", ...summarize(segments, groundSum) };
}

// How far the address pin is from the building's bounding box (0 if the pin is on the roof).
function distanceToBox(p: { lat: number; lng: number }, b: BBox) {
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
  return distanceMeters(p, { lat: clamp(p.lat, b.sw.lat, b.ne.lat), lng: clamp(p.lng, b.sw.lng, b.ne.lng) });
}

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function solarRoof(lat: number, lng: number): Promise<RoofMeasurement> {
  const url =
    `https://solar.googleapis.com/v1/buildingInsights:findClosest` +
    `?location.latitude=${lat}&location.longitude=${lng}&requiredQuality=LOW&key=${GOOGLE_KEY}`;
  const r = await fetch(url);
  if (r.status === 404) return FALLBACK;
  if (!r.ok) throw new Error(`Solar API ${r.status}: ${await r.text()}`);
  const d = await r.json();
  const sp = d.solarPotential || {};
  const segments: RoofSegment[] = (sp.roofSegmentStats || []).map((s: any) => ({
    areaSqft: (s.stats?.areaMeters2 || 0) * SQFT_PER_M2,
    pitchDegrees: s.pitchDegrees || 0,
    azimuthDegrees: s.azimuthDegrees || 0,
  }));
  if (segments.length === 0) return FALLBACK;

  const footprint = (sp.wholeRoofStats?.groundAreaMeters2 || 0) * SQFT_PER_M2;
  const bbox: BBox | undefined = d.boundingBox && {
    sw: { lat: d.boundingBox.sw.latitude, lng: d.boundingBox.sw.longitude },
    ne: { lat: d.boundingBox.ne.latitude, lng: d.boundingBox.ne.longitude },
  };
  // findClosest returns the nearest building it has, even if that's a neighbor. If the pin
  // isn't on (or right beside) it, the house is likely newer than the imagery: don't quote it.
  const distance = bbox ? distanceToBox({ lat, lng }, bbox) : undefined;
  if (distance !== undefined && distance > 15)
    return {
      ...FALLBACK,
      distanceMeters: distance,
      note: `Google's aerial imagery doesn't show a building at this address (the nearest one is ${Math.round(distance)} m away), so this uses a typical single-family roof.`,
    };

  const m: RoofMeasurement = {
    source: "solar",
    segments,
    ...summarize(segments, footprint),
    imageryQuality: d.imageryQuality,
    imageryDate: d.imageryDate ? `${d.imageryDate.year}-${String(d.imageryDate.month).padStart(2, "0")}` : undefined,
    distanceMeters: distance,
    bbox,
  };
  if (m.areaSqft > 12000) m.note = "This roof is unusually large for a home. It may be a multi-unit or commercial building.";
  return m;
}

export async function GET(req: Request) {
  if (rateLimited(req)) return json({ error: "Too many requests" }, 429);
  const url = new URL(req.url);
  const lat = parseCoord(url.searchParams.get("lat"), 90);
  const lng = parseCoord(url.searchParams.get("lng"), 180);
  if (lat === null || lng === null) return json({ error: "Invalid coordinates" }, 400);

  if (DEMO_MODE || url.searchParams.get("demo") === "1") return json(demoRoof(lat, lng));

  const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  const hit = cache.get(key);
  if (hit) return json(hit);
  try {
    const m = await solarRoof(lat, lng);
    cache.set(key, m);
    return json(m);
  } catch (e) {
    console.error(e);
    return json({ ...FALLBACK, note: "Roof measurement service failed, so this uses a typical single-family roof." });
  }
}
