import { DEMO_MODE, json } from "@/lib/server";

export function GET() {
  return json({ ok: true, mode: DEMO_MODE ? "demo" : "live" });
}
