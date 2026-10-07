'use client';

import { useCallback, useState } from 'react';
import { useAuth } from './AuthProvider';
import { saveSearch } from '@/lib/savedSearches';
import styles from './SaveButton.module.css';

export default function SaveButton({ a, b, hub }) {
  const { user } = useAuth();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!user) {
      window.location.href = '/friends';
      return;
    }
    setSaving(true);
    try {
      await saveSearch({
        userId: user.id,
        a,
        b,
        hubName: hub?.name || null,
        url: window.location.href,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  }, [user, a, b, hub]);

  return (
    <button
      type="button"
      className={saved ? styles.savedBtn : styles.saveBtn}
      onClick={handleSave}
      disabled={saving}
      aria-label="Save this search"
    >
      {saved ? '✓ Saved' : saving ? '…' : '♡'}
    </button>
  );
}
