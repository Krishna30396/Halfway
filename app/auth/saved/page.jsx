'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import styles from '../auth.module.css';

export default function SavedPage() {
  const { user, loading: authLoading } = useAuth();
  const [searches, setSearches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      window.location.href = '/auth/login';
      return;
    }

    const supabase = getSupabase();
    if (!supabase) { setLoading(false); return; }

    supabase
      .from('saved_searches')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (!error && data) setSearches(data);
        setLoading(false);
      });
  }, [user, authLoading]);

  if (authLoading || loading) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.logo}>HALFWAY</h1>
          <p className={styles.subtitle}>Loading your saved searches…</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card} style={{ maxWidth: 500 }}>
        <h1 className={styles.logo}>HALFWAY</h1>
        <p className={styles.subtitle}>Your saved searches</p>

        {!searches.length ? (
          <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
            No saved searches yet. Find a meeting point and save it!
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {searches.map((s) => (
              <li key={s.id} style={{ borderBottom: '1px solid var(--contour)', padding: '12px 0' }}>
                <a
                  href={s.url || '/'}
                  style={{ color: 'var(--ink)', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}
                >
                  {s.name_a || 'Location A'} ↔ {s.name_b || 'Location B'}
                </a>
                {s.hub_name && (
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    Meeting in {s.hub_name}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <a href="/" className={styles.back} style={{ marginTop: 20 }}>← Back to Halfway</a>
      </div>
    </div>
  );
}
