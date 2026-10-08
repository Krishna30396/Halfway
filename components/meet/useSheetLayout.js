'use client';

import { useEffect, useState } from 'react';

const WIDE = '(min-width: 900px)';

/**
 * Tracks the bottom sheet's height (as --sheet-h on the screen root, so the
 * map ends just under it) and whether the wide, side-panel layout is in use.
 * Returns callback refs plus map insets that keep pins clear of the chrome.
 */
export function useSheetLayout() {
  const [root, setRoot] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(WIDE);
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!root || !sheet || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => root.style.setProperty('--sheet-h', `${sheet.offsetHeight}px`));
    ro.observe(sheet);
    return () => ro.disconnect();
  }, [root, sheet]);

  const insets = wide ? { top: 40, left: 450, right: 96, bottom: 40 } : { top: 130, left: 36, right: 72, bottom: 40 };
  return { rootRef: setRoot, sheetRef: setSheet, wide, insets };
}
