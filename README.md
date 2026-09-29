# Roof Quote

Type an address, get a roof replacement quote. Google Places autocomplete finds the address,
the Google Solar API measures each roof plane (area + pitch) from aerial imagery, and
`lib/pricing.ts` turns that into three priced options.

## Run

    npm install
    npm run build && npm start    # http://localhost:3111
    # or: npm run dev

With no key the app runs in **demo mode** (fake addresses, fake roofs, "Demo data" badge).

## Real data

1. Google Cloud console: create a project, enable billing.
2. Enable **Places API (New)**, **Solar API**, **Maps Static API**.
3. Create an API key, restrict it to those three APIs.
4. `cp .env.example .env.local`, paste the key, restart.

The key stays on the server; the browser only talks to `/api/*`.

## Edit prices

Everything is in `lib/pricing.ts`: tiers, per-square rates, waste, steep-roof surcharge, permit, tax.

## Files

- `app/page.tsx`: the page. `app/AddressSearch.tsx`: autocomplete box.
- `app/api/autocomplete`, `place`: Google Places proxy.
- `app/api/roof`: Solar API measurement, with a typical-home fallback when there's no coverage.
- `app/api/satellite`: Static Maps image with the measured building outlined.
