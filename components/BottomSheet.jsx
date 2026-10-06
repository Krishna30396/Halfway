'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './BottomSheet.module.css';

const SNAP_PEEK = 0.18;
const SNAP_HALF = 0.52;
const SNAP_FULL = 0.92;
const SNAPS = [SNAP_PEEK, SNAP_HALF, SNAP_FULL];

function closest(value) {
  let best = SNAPS[0];
  for (const s of SNAPS) {
    if (Math.abs(s - value) < Math.abs(best - value)) best = s;
  }
  return best;
}

export default function BottomSheet({ children, hasResults }) {
  const sheetRef = useRef(null);
  const dragRef = useRef(null);
  const [snap, setSnap] = useState(SNAP_PEEK);

  useEffect(() => {
    if (hasResults && snap === SNAP_PEEK) setSnap(SNAP_HALF);
  }, [hasResults]);

  const onPointerDown = useCallback((e) => {
    if (e.target.closest('input, button, a, [role="listbox"], [role="combobox"]')) return;
    const sheet = sheetRef.current;
    if (!sheet) return;
    e.preventDefault();
    sheet.setPointerCapture(e.pointerId);
    const vh = window.innerHeight;
    dragRef.current = {
      startY: e.clientY,
      startFrac: 1 - sheet.getBoundingClientRect().top / vh,
    };
  }, []);

  const onPointerMove = useCallback((e) => {
    if (!dragRef.current) return;
    const vh = window.innerHeight;
    const dy = dragRef.current.startY - e.clientY;
    const frac = Math.max(0.1, Math.min(0.95, dragRef.current.startFrac + dy / vh));
    const sheet = sheetRef.current;
    if (sheet) sheet.style.height = `${frac * 100}dvh`;
  }, []);

  const onPointerUp = useCallback((e) => {
    if (!dragRef.current) return;
    const vh = window.innerHeight;
    const sheet = sheetRef.current;
    if (!sheet) { dragRef.current = null; return; }
    const currentFrac = 1 - sheet.getBoundingClientRect().top / vh;
    const target = closest(currentFrac);
    sheet.style.height = '';
    setSnap(target);
    dragRef.current = null;
  }, []);

  const snapClass =
    snap >= SNAP_FULL ? styles.sheetFull :
    snap >= SNAP_HALF ? styles.sheetHalf :
    styles.sheetPeek;

  return (
    <div
      ref={sheetRef}
      className={`${styles.sheet} ${snapClass}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{ touchAction: 'none' }}
    >
      <div className={styles.handle} aria-hidden="true">
        <div className={styles.handleBar} />
      </div>
      <div className={styles.content}>
        {children}
      </div>
    </div>
  );
}
