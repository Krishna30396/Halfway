'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { loadPlaces, searchPlaces } from '@/lib/localPlaces';
import { haversine } from '@/lib/geo';
import styles from './LocationInput.module.css';

export default function LocationInput({ label, marker, value, onSelect, bias }) {
  const [text, setText] = useState(value?.name || '');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [highlight, setHighlight] = useState(0);
  const abortRef = useRef(null);
  const timerRef = useRef(null);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const skipNextFetch = useRef(false);
  // The built-in place list answers every keystroke instantly; the live
  // geocoder's results join underneath when (if) they arrive.
  const localRef = useRef([]);

  useEffect(() => {
    loadPlaces();
  }, []);

  // Keep the field in sync when the value arrives from the URL. Only raise the
  // skip flag when the text actually changes — an identical value would leave
  // the flag set and silently swallow the user's next keystroke.
  useEffect(() => {
    if (value?.name) {
      setText((prev) => {
        if (prev === value.name) return prev;
        skipNextFetch.current = true;
        return value.name;
      });
    }
  }, [value?.name]);

  // bias lives in a ref so runSearch stays stable — otherwise picking the
  // OTHER location recreates it and phantom-reopens this input's dropdown.
  const biasRef = useRef(bias);
  useEffect(() => {
    biasRef.current = bias;
  }, [bias]);

  const runSearch = useCallback(
    async (q) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);
      try {
        const bias = biasRef.current;
        const near = bias ? `&near=${bias.lat},${bias.lng}` : '';
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}${near}`, {
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Search failed');
        // Live results that the built-in list doesn't already show (same
        // first word within ~500 m) go underneath it.
        const local = localRef.current;
        const fresh = (data.results || []).filter(
          (r) =>
            !local.some(
              (l) =>
                l.name.split(/[ ,]/)[0].toLowerCase() === r.name.split(/[ ,]/)[0].toLowerCase() &&
                haversine([l.lat, l.lng], [r.lat, r.lng]) < 0.5
            )
        );
        const merged = [...local.slice(0, fresh.length ? 5 : 8), ...fresh].slice(0, 10);
        setSuggestions(merged);
        setOpen(true);
        return merged;
      } catch (err) {
        if (localRef.current.length) return localRef.current;
        if (err.name !== 'AbortError') {
          setError("Couldn't reach the address search. Try again in a moment.");
          setOpen(true);
        }
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }
    if (text.trim().length < 1) {
      localRef.current = [];
      setSuggestions([]);
      setOpen(false);
      return;
    }

    // Instant: the built-in list, ranked by distance from you (or the other point).
    const local = searchPlaces(text.trim(), biasRef.current);
    localRef.current = local;
    if (local.length) {
      setSuggestions(local);
      setOpen(true);
      setHighlight(0);
      setError(null);
    }

    // Then the live search, debounced; a newer keystroke aborts the old one.
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => runSearch(text.trim()), local.length ? 300 : 150);
    return () => clearTimeout(timerRef.current);
  }, [text, runSearch]);

  // Close on outside click.
  useEffect(() => {
    const close = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const pick = (s) => {
    skipNextFetch.current = true;
    setText(s.name);
    setOpen(false);
    setSuggestions([]);
    onSelect({ lat: +s.lat.toFixed(4), lng: +s.lng.toFixed(4), name: s.name });
  };

  const clear = () => {
    clearTimeout(timerRef.current);
    abortRef.current?.abort();
    skipNextFetch.current = false;
    setText('');
    setSuggestions([]);
    setOpen(false);
    setError(null);
    onSelect(null);
    inputRef.current?.focus();
  };

  const onChange = (e) => {
    const t = e.target.value;
    setText(t);
    // Deleting the text deletes the chosen location — the route, the muted
    // map and everything downstream reset with it.
    if (!t.trim() && value) onSelect(null);
  };

  const onKeyDown = async (e) => {
    if (e.key === 'ArrowDown' && open && suggestions.length) {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp' && open && suggestions.length) {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && suggestions.length) {
        // Enter takes the highlighted (or top) suggestion — no arrowing needed.
        pick(suggestions[Math.max(0, Math.min(highlight, suggestions.length - 1))]);
      } else if (text.trim()) {
        // Typed the full name and hit Enter before the debounce? Search now
        // and take the best match.
        clearTimeout(timerRef.current);
        const results = await runSearch(text.trim());
        if (results?.length) pick(results[0]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <label className={styles.label}>
        <span className={styles.marker} data-kind={marker} aria-hidden="true" />
        {label}
      </label>
      <div className={styles.inputWrap}>
        <input
          ref={inputRef}
          className={styles.input}
          type="text"
          value={text}
          placeholder="Town, address or postcode"
          onChange={onChange}
          onKeyDown={onKeyDown}
          onFocus={() => suggestions.length && setOpen(true)}
          role="combobox"
          aria-expanded={open}
          aria-label={label}
          autoComplete="off"
          spellCheck="false"
        />
        {text && (
          <button
            type="button"
            className={styles.clear}
            aria-label={`Clear ${label}`}
            onClick={clear}
          >
            ×
          </button>
        )}
      </div>
      {open && (
        <ul className={styles.dropdown} role="listbox">
          {loading && !suggestions.length && <li className={styles.hint}>Searching…</li>}
          {error && <li className={styles.error}>{error}</li>}
          {!loading && !error && !suggestions.length && (
            <li className={styles.hint}>No matches. Try a broader name.</li>
          )}
          {suggestions.map((s, i) => (
            <li
              key={`${s.lat},${s.lng},${i}`}
              role="option"
              aria-selected={i === highlight}
              className={i === highlight ? styles.itemActive : styles.item}
              onPointerDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              onMouseEnter={() => setHighlight(i)}
            >
              {s.name}
              {s.kind && <span className={styles.kind}>{s.kind}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
