'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

const AuthContext = createContext({ user: null, loading: true, signOut: () => {} });

export function useAuth() {
  return useContext(AuthContext);
}

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Token refreshes hand back a new user object for the same person; keeping
    // the old one stops every page from reloading all its data each time.
    const keep = (next) => setUser((prev) => (prev && next && prev.id === next.id ? prev : next));

    supabase.auth.getSession().then(({ data: { session } }) => {
      keep(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      keep(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    if (supabase) await supabase.auth.signOut();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
