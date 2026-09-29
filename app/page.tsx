"use client";

import { useMemo, useRef, useState } from "react";
import AddressSearch from "./AddressSearch";
import { COMPANY, TIERS, buildQuote, pitchToRise, splitRoof, type Plane } from "@/lib/pricing";
import type { Place, RoofMeasurement, Suggestion } from "@/lib/types";

const STEPS = ["Finding your property", "Pulling satellite imagery", "Measuring roof planes and pitch", "Building your quote"];
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Request failed");
  return d;
}

function Header({ onHome, solid }: { onHome: () => void; solid?: boolean }) {
  return (
    <header className={`nav ${solid ? "solid" : ""}`}>
      <button className="nav-logo" onClick={onHome} aria-label={`${COMPANY.name} home`}>
        <img src="/logo.png" alt={COMPANY.name} />
      </button>
    </header>
  );
}

const Arrow = () => (
  <svg viewBox="0 0 24 24" className="arrow" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);

export default function Home() {
  const [view, setView] = useState<"form" | "loading" | "result">("form");
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const addr = useRef<{ picked: Suggestion | null; text: string; session: string }>({ picked: null, text: "", session: "" });
  const addrInput = useRef<HTMLInputElement>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [roof, setRoof] = useState<RoofMeasurement | null>(null);
  const [tierId, setTierId] = useState(TIERS.find((t) => t.recommended)?.id || TIERS[0].id);
  const [imgLoaded, setImgLoaded] = useState(false);

  function reset() {
    setView("form");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => addrInput.current?.focus(), 300);
  }

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const { picked, text, session } = addr.current;
    try {
      // If they typed an address without picking from the list, use Google's top match.
      let s = picked;
      if (!s) {
        const d = await getJson<{ suggestions: Suggestion[] }>(`/api/autocomplete?q=${encodeURIComponent(text)}&session=${session}`);
        s = d.suggestions[0];
        if (!s) throw new Error("We couldn't find that address. Try picking one from the list.");
      }
            // Save the email; fire-and-forget so it never slows down or blocks the quote.
      fetch("/api/lead", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }), keepalive: true }).catch(() => {});

      setPlace(null);
      setRoof(null);
      setImgLoaded(false);
      setStep(0);
      setView("loading");
      window.scrollTo({ top: 0 });

      const p = await getJson<Place>(`/api/place?id=${encodeURIComponent(s.placeId)}&session=${session}`);
      const roofReq = getJson<RoofMeasurement>(`/api/roof?lat=${p.lat}&lng=${p.lng}`);
      await sleep(700); // short pauses so the audience can watch each step happen
      setPlace(p);
      setStep(1);
      const m = await roofReq;
      setRoof(m); // lets the satellite image load with the building outline during the next steps
      await sleep(1100);
      setStep(2);
      await sleep(1300);
      setStep(3);
      await sleep(900);
      setView("result");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setView("form");
    }
  }

  const planes: Plane[] = roof ? (roof.segments.length ? roof.segments : [{ areaSqft: roof.areaSqft, pitchDegrees: roof.avgPitchDegrees }]) : [];
  const split = splitRoof(planes);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const quotes = useMemo(() => (roof ? TIERS.map((t) => buildQuote(t, planes)) : []), [roof]);
  const selected = quotes.find((q) => q.tier.id === tierId);
  const quoteNo = place ? `Q-${Math.abs(place.lat * 1e5 + place.lng * 1e3).toFixed(0).slice(-6)}` : "";

  const satUrl =
    place &&
    `/api/satellite?lat=${place.lat}&lng=${place.lng}` +
      (roof?.bbox ? `&swLat=${roof.bbox.sw.lat}&swLng=${roof.bbox.sw.lng}&neLat=${roof.bbox.ne.lat}&neLng=${roof.bbox.ne.lng}` : "");

  if (view !== "result")
    return (
      <main>
        <section className="hero">
          <Header onHome={reset} />
          {view === "form" ? (
            <div className="hero-body">
              <p className="eyebrow-caps">Fast. Easy. No obligation.</p>
              <h1>Generate Me a Roofing Quote <br className="wide-only" />in 3 Minutes</h1>
              <p className="lede">
                Get a personalized roofing quote in just a few clicks.
                <br />
                No calls. No pressure. Just answers.
              </p>
              <form className="quote-form" onSubmit={generate}>
                <label htmlFor="address">Property Address</label>
                <AddressSearch inputRef={addrInput} onChange={(picked, text, session) => (addr.current = { picked, text, session })} />
                <label htmlFor="email">Where should we send your quote?</label>
                <div className="field">
                  <svg className="field-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="m3 7 9 6 9-6" />
                  </svg>
                  <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
                </div>
                <button className="primary" type="submit">
                  Generate My Quote <Arrow />
                </button>
                {error ? <p className="form-error">{error}</p> : <p className="form-note">Takes less than 3 minutes</p>}
              </form>
            </div>
          ) : (
            <div className="hero-body">
              <div className="loading-card">
                <div className="scan">
                  {satUrl && roof ? (
                    <>
                      <img src={satUrl} alt="" onLoad={() => setImgLoaded(true)} className={imgLoaded ? "in" : ""} />
                      {imgLoaded && step >= 2 && <div className="scanline" />}
                    </>
                  ) : (
                    <div className="scan-wait">
                      <span className="pulse" />
                    </div>
                  )}
                </div>
                <div className="loading-steps">
                  <p className="eyebrow-caps small">{place ? place.address.replace(/, USA$/, "") : "Working on it"}</p>
                  <h2>Generating your quote</h2>
                  {STEPS.map((label, i) => (
                    <div key={label} className={`step ${i < step ? "done" : i === step ? "now" : ""}`}>
                      <span className="dot">{i < step ? "✓" : ""}</span>
                      {label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
        <Features />
      </main>
    );

  return (
    <main className="result-page">
      <Header onHome={reset} solid />
      {place && roof && selected && (
        <div className="results">
          <div className="results-head">
            <div>
              <p className="eyebrow-caps small">Your roof quote</p>
              <h1>{place.address.replace(/, USA$/, "")}</h1>
              {email && <p className="prepared">Prepared for {email}</p>}
            </div>
            <button className="secondary" onClick={reset}>New quote</button>
          </div>

          <section className="card roof">
            <div className="sat">
              {satUrl && <img src={satUrl} alt={`Satellite view of ${place.address}`} />}
            </div>
            <div className="roof-info">
              <p className="eyebrow">Roof measurement</p>
              <dl className="stats">
                <div><dt>Roof area</dt><dd>{roof.areaSqft.toLocaleString()} sq ft</dd></div>
                <div><dt>Squares</dt><dd>{(roof.areaSqft / 100).toFixed(1)}</dd></div>
                <div><dt>Main roof pitch</dt><dd>{pitchToRise(split.pitchedDegrees).toFixed(0)}/12</dd></div>
                <div><dt>Roof planes</dt><dd>{roof.segments.length || "n/a"}</dd></div>
              </dl>
              <p className="source">
                {roof.source === "solar" && <>Measured from Google aerial imagery{roof.imageryDate && ` (${roof.imageryDate})`}, {roof.imageryQuality?.toLowerCase()} quality.</>}
                {roof.source === "demo" && <>Demo measurement. Add a Google API key for real data.</>}
                {roof.source === "fallback" && <>Estimated size.</>}
              </p>
              {split.lowSqft > 0 && <p className="source">Includes {Math.round(split.lowSqft).toLocaleString()} sq ft of near-flat roof, priced separately.</p>}
              {roof.note && <p className="note">{roof.note}</p>}
            </div>
          </section>

          <section className="tiers">
            {quotes.map((q) => (
              <button key={q.tier.id} className={`tier card ${q.tier.id === tierId ? "selected" : ""}`} onClick={() => setTierId(q.tier.id)}>
                {q.tier.recommended && <span className="badge">Most popular</span>}
                <span className="tier-name">{q.tier.name}</span>
                <span className="tier-price">{money(q.total)}</span>
                <span className="tier-range">{money(q.low)} to {money(q.high)}</span>
                <span className="tier-mat">{q.tier.material}</span>
                <span className="tier-war">{q.tier.warranty} warranty</span>
              </button>
            ))}
          </section>

          <section className="card quote">
            <div className="quote-head">
              <div>
                <p className="eyebrow">Quote {quoteNo}</p>
                <h2>{selected.tier.name} roof replacement</h2>
              </div>
              <button className="secondary" onClick={() => window.print()}>Print / save PDF</button>
            </div>
            <table>
              <tbody>
                {selected.items.map((i) => (
                  <tr key={i.label}>
                    <td>{i.label}<small>{i.detail}</small></td>
                    <td>{money(i.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Estimated total</td>
                  <td>{money(selected.total)}</td>
                </tr>
              </tfoot>
            </table>
            <p className="fine">
              {money(selected.perSqft)} per sq ft of roof. Estimate based on satellite measurement; final price confirmed after a free on-site inspection.
              Call {COMPANY.phone}.
            </p>
          </section>
        </div>
      )}
      <Features />
    </main>
  );
}

function Features() {
  const items = [
    { t: "Fast & Easy", d: "Get your quote in 3 minutes", icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
    { t: "No Obligation", d: "100% free, no pressure", icon: <><path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z" /><path d="m9 12 2 2 4-4" /></> },
    { t: "Trusted by Homeowners", d: "Thousands of happy customers", icon: <><circle cx="12" cy="8" r="3" /><circle cx="5.5" cy="9.5" r="2" /><circle cx="18.5" cy="9.5" r="2" /><path d="M7 19a5 5 0 0 1 10 0zM2.5 18a3.5 3.5 0 0 1 4.3-3.4M21.5 18a3.5 3.5 0 0 0-4.3-3.4" /></> },
  ];
  return (
    <section className="features">
      {items.map((f) => (
        <div key={f.t} className="feature">
          <svg viewBox="0 0 24 24" aria-hidden="true">{f.icon}</svg>
          <div>
            <strong>{f.t}</strong>
            <span>{f.d}</span>
          </div>
        </div>
      ))}
    </section>
  );
}
