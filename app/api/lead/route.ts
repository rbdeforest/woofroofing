import { put } from "@vercel/blob";
import { json, rateLimited } from "../../../lib/server";

// Saves the visitor's email to the Vercel Blob store connected to the project
// (Storage tab). Each email is one file under leads/, named after the address,
// so the store's file browser in the dashboard is the list.

async function save(email: string) {
  const path = `leads/${email}.txt`;
  try {
    // Private store: files can't be opened by URL. Same name = same person, so overwrite.
    await put(path, email, { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "text/plain" });
  } catch (e: any) {
    if (!/access|private/i.test(String(e?.message))) throw e;
    // Public store: keep the URL unguessable with a random suffix.
    await put(path, email, { access: "public", addRandomSuffix: true, contentType: "text/plain" });
  }
}

export async function POST(req: Request) {
  if (rateLimited(req)) return json({ error: "Too many requests" }, 429);
  const { email } = await req.json().catch(() => ({}));
  const clean = String(email || "").trim().toLowerCase();
  if (clean.length > 254 || !/^[^\s@/\\]+@[^\s@/\\]+\.[^\s@/\\]+$/.test(clean)) return json({ error: "Invalid email" }, 400);

  // On Vercel, connecting the store sets BLOB_STORE_ID and the SDK signs in via OIDC;
  // elsewhere (or older stores) it uses BLOB_READ_WRITE_TOKEN.
  if (!process.env.BLOB_STORE_ID && !process.env.BLOB_READ_WRITE_TOKEN) {
    console.log("lead (no Blob store connected):", clean);
    return json({ ok: true, stored: false });
  }
  try {
    await save(clean);
    return json({ ok: true, stored: true });
  } catch (e) {
    console.error("lead save failed", e);
    return json({ ok: false }, 502);
  }
}
