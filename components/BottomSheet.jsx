'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import styles from './BottomSheet.module.css';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Phone bottom sheet over the full-screen map. Three snap points:
 *   peek — just the header + footer (the map gets the screen)
 *   half — about half the space, for browsing results next to the map
 *   tall — the search form (leaves the top of the map and the wordmark visible)
 * Drag from the handle/header. `snap` + `snapKey` let the page ask for a
 * snap point (e.g. results → half); the user's drags win until it asks again.
 */
export default function BottomSheet({ header, footer, children, snap: wanted = 'tall', snapKey }) {
  const sheetRef = useRef(null);
  const headRef = useRef(null);
  const footRef = useRef(null);
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
    // Space above the tab bar: the sheet's bottom edge sits on top of it.
    const avail = sheet.getBoundingClientRect().bottom;
    const head = (headRef.current?.offsetHeight || 0) + (footRef.current?.offsetHeight || 0);
    const peek = Math.max(96, head + 4);
    const tall = Math.max(peek + 120, avail - Math.min(0.22 * vh, 190));
    const half = Math.max(peek + 60, Math.min(tall - 40, avail * 0.5));
    setHeights({ peek, half, tall });
  }, []);

  useIsoLayoutEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  // Header/footer content changes (results view, CTA hidden) shift the peek height.
  useEffect(() => {
    measure();
  }, [measure, snapKey, !!footer]);

  const onPointerDown = useCallback((e) => {
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
  }, []);

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
    const keys = ['peek', 'half', 'tall'];
    let best = keys[0];
    for (const k of keys) if (Math.abs(heights[k] - h) < Math.abs(heights[best] - h)) best = k;
    setSnap(best);
  }, [heights, wanted]);

  return (
    <section
      ref={sheetRef}
      className={`${styles.sheet} ${dragging ? styles.dragging : ''}`}
      style={heights ? { height: heights[snap] } : undefined}
      data-snap={snap}
      aria-label="Search"
    >
      <div
        ref={headRef}
        className={styles.grip}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className={styles.handle} aria-hidden="true">
          <div className={styles.handleBar} />
        </div>
        {header}
      </div>
      <div className={styles.content}>{children}</div>
      {footer && (
        <div ref={footRef} className={styles.footer}>
          {footer}
        </div>
      )}
    </section>
  );
}
