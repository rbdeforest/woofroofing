"use client";

import { useEffect, useRef, useState } from "react";
import type { Suggestion } from "@/lib/types";

// Address field with Google autocomplete. Reports the picked suggestion (or null once the
// user edits the text again) plus the raw text, so the form can resolve typed-only input.
export default function AddressSearch({
  onChange,
  inputRef,
}: {
  onChange: (picked: Suggestion | null, text: string, session: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const session = useRef(crypto.randomUUID());
  const picked = useRef(false);

  useEffect(() => {
    if (picked.current) {
      picked.current = false;
      return;
    }
    onChange(null, q, session.current);
    if (q.trim().length < 3) {
      setItems([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/autocomplete?q=${encodeURIComponent(q)}&session=${session.current}`, { signal: ctrl.signal });
        const d = await r.json();
        if (!r.ok) return;
        setItems(d.suggestions);
        setActive(d.suggestions.length ? 0 : -1);
        setOpen(document.activeElement === inputRef?.current);
      } catch {}
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function choose(s: Suggestion) {
    picked.current = true;
    const text = `${s.main}, ${s.secondary}`.replace(/, USA$/, "");
    setQ(text);
    setOpen(false);
    onChange(s, text, session.current);
  }

  function onKey(e: React.KeyboardEvent) {
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") setActive((a) => (a + 1) % items.length);
    else if (e.key === "ArrowUp") setActive((a) => (a - 1 + items.length) % items.length);
    else if (e.key === "Enter" && active >= 0) choose(items[active]);
    else if (e.key === "Escape") setOpen(false);
    else return;
    e.preventDefault();
  }

  return (
    <div className="field">
      <svg className="field-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 21s-7-6.2-7-12a7 7 0 1 1 14 0c0 5.8-7 12-7 12Z" />
        <circle cx="12" cy="9" r="2.5" />
      </svg>
      <input
        id="address"
        ref={inputRef}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKey}
        onFocus={() => items.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="1234 Main St, City, State, ZIP"
        autoComplete="off"
        spellCheck={false}
        required
      />
      {open && items.length > 0 && (
        <ul className="suggestions" role="listbox">
          {items.map((s, i) => (
            <li key={s.placeId} role="option" aria-selected={i === active} className={i === active ? "active" : ""} onMouseDown={() => choose(s)} onMouseEnter={() => setActive(i)}>
              <strong>{s.main}</strong>
              <span>{s.secondary}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
