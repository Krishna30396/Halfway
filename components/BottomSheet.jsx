'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import styles from './BottomSheet.module.css';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Phone bottom sheet over the full-screen map. Three snap points:
 *   peek — just the header + footer (the map gets the screen)
 *   half — about half the space, for browsing results next to the map
 *   tall — the search form (leaves the top of the map and the wordmark visible)
 *   full — up to the top of the screen (See all)
 * Drag from the handle/header. `snap` + `snapKey` let the page ask for a
 * snap point (e.g. results → half); the user's drags win until it asks again.
 * With `fit`, tall is only as high as the content needs. With `fitHalf`, half
 * ends just below the first <section> of the content (the first row of spots). `above` floats just
 * over the sheet's top edge and moves with it (the category chips).
 */
export default function BottomSheet({ header, footer, children, snap: wanted = 'tall', snapKey, fit = false, fitHalf = false, above, onSnapChange, page = false }) {
  const sheetRef = useRef(null);
  const headRef = useRef(null);
  const footRef = useRef(null);
  const bodyRef = useRef(null);
  const dragRef = useRef(null);
  const [snap, setSnap] = useState(wanted);
  const [heights, setHeights] = useState(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    setSnap(wanted);
  }, [wanted, snapKey]);

  const measure = useCallback(() => {
    const sheet = sheetRef.current;
    if (!sheet || getComputedStyle(sheet).display === 'none') return;
    const vh = window.innerHeight;
    // Space above the tab bar: the sheet's bottom edge sits on top of it. Read
    // from CSS, not the sheet's box: while the sheet slides in it is shifted
    // down, which made every snap height come out taller on first load.
    const avail = vh - (parseFloat(getComputedStyle(sheet).bottom) || 0);
    const head = (headRef.current?.offsetHeight || 0) + (footRef.current?.offsetHeight || 0);
    const peek = Math.max(96, head + 4);
    let tall = Math.max(peek + 120, avail - Math.min(0.22 * vh, 190));
    if (fit && bodyRef.current) tall = Math.max(peek + 120, Math.min(tall, head + bodyRef.current.offsetHeight + 24));
    const half = Math.max(peek + 60, Math.min(tall - 40, avail * 0.5));
    const full = Math.max(tall, avail);
    let halfH = Math.min(half, tall);
    const first = fitHalf && bodyRef.current?.querySelector('section');
    if (first) {
      const end = first.getBoundingClientRect().bottom - bodyRef.current.getBoundingClientRect().top;
      halfH = Math.max(peek + 60, Math.min(tall, head + end + 14));
    }
    setHeights({ peek, half: halfH, tall, full });
  }, [fit, fitHalf]);

  useIsoLayoutEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  // With `fit`, follow the content as it grows or shrinks (mode switch, More).
  useEffect(() => {
    if ((!fit && !fitHalf) || !bodyRef.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(bodyRef.current);
    return () => ro.disconnect();
  }, [fit, fitHalf, measure]);

  // Header/footer content changes (results view, CTA hidden) shift the peek height.
  useEffect(() => {
    measure();
  }, [measure, snapKey, !!footer]);

  const onPointerDown = useCallback((e) => {
    if (page) return;
    if (e.target.closest('input, button, a')) return;
    const sheet = sheetRef.current;
    if (!sheet) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startY: e.clientY,
      startH: sheet.getBoundingClientRect().height,
      moved: false,
    };
    setDragging(true);
  }, [page]);

  const onPointerMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d) return;
    const dy = d.startY - e.clientY;
    if (Math.abs(dy) > 4) d.moved = true;
    const sheet = sheetRef.current;
    const max = sheet.getBoundingClientRect().bottom - 8;
    const h = Math.max(80, Math.min(max, d.startH + dy));
    sheet.style.height = `${h}px`;
  }, []);

  const onPointerUp = useCallback(() => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    const sheet = sheetRef.current;
    if (!d || !sheet || !heights) return;
    const h = sheet.getBoundingClientRect().height;
    sheet.style.height = '';
    if (!d.moved) {
      // A tap on the handle toggles between the form and the map.
      setSnap((s) => (s === 'peek' ? wanted === 'peek' ? 'tall' : wanted : 'peek'));
      return;
    }
    const keys = ['peek', 'half', 'tall', 'full'];
    let best = keys[0];
    for (const k of keys) if (Math.abs(heights[k] - h) < Math.abs(heights[best] - h)) best = k;
    setSnap(best);
    onSnapChange?.(best);
  }, [heights, wanted, onSnapChange]);

  return (
    <section
      ref={sheetRef}
      className={`${styles.sheet} ${dragging ? styles.dragging : ''} ${page ? styles.page : ''}`}
      style={heights ? { height: heights[snap] } : undefined}
      data-snap={snap}
      aria-label="Search"
    >
      {above && <div className={styles.above}>{above}</div>}
      <div
        ref={headRef}
        className={styles.grip}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {!page && (
          <div className={styles.handle} aria-hidden="true">
            <div className={styles.handleBar} />
          </div>
        )}
        {header}
      </div>
      <div className={styles.content}>
        <div ref={bodyRef}>{children}</div>
      </div>
      {footer && (
        <div ref={footRef} className={styles.footer}>
          {footer}
        </div>
      )}
    </section>
  );
}
