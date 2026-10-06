'use client';

import { useAuth } from './AuthProvider';
import { getSupabase } from '@/lib/supabase';
import { useCallback, useState } from 'react';
import styles from './AuthButton.module.css';

export default function AuthButton() {
  const { user, loading, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const supabase = getSupabase();
  if (!supabase) return null;
  if (loading) return null;

  if (!user) {
    return (
      <a href="/auth/login" className={styles.signIn}>
        Sign in
      </a>
    );
  }

  const initial = (user.email || '?')[0].toUpperCase();

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.avatar}
        onClick={() => setMenuOpen((o) => !o)}
        aria-label="Account menu"
      >
        {initial}
      </button>
      {menuOpen && (
        <div className={styles.menu}>
          <div className={styles.menuEmail}>{user.email}</div>
          <a href="/auth/saved" className={styles.menuItem}>Saved searches</a>
          <button type="button" className={styles.menuItem} onClick={() => { signOut(); setMenuOpen(false); }}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
