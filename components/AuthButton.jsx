'use client';

import { useAuth } from './AuthProvider';
import { getSupabase } from '@/lib/supabase';
import { useState } from 'react';
import styles from './AuthButton.module.css';

export default function AuthButton() {
  const { user, loading, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const supabase = getSupabase();
  // No "Sign in" button: people start by picking a username from the Friends button.
  if (!supabase || loading || !user) return null;

  const guest = user.is_anonymous || !user.email;
  const initial = guest ? '★' : user.email[0].toUpperCase();

  const leave = () => {
    if (
      guest &&
      !window.confirm(
        'This is a guest account saved only on this phone. If you sign out you will lose it and your friends. Sign out anyway?'
      )
    ) {
      return;
    }
    signOut();
    setMenuOpen(false);
  };

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
          <div className={styles.menuEmail}>{guest ? 'Guest account on this phone' : user.email}</div>
          <a href="/friends" className={styles.menuItem}>Friends & meetups</a>
          <a href="/auth/saved" className={styles.menuItem}>Saved searches</a>
          <button type="button" className={styles.menuItem} onClick={leave}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
