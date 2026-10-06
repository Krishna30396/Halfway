'use client';

import { useEffect, useState } from 'react';

let cached = null;

/** Which sign-in providers are switched on in the Supabase project. */
export function useAuthProviders() {
  const [providers, setProviders] = useState(cached);

  useEffect(() => {
    if (cached) return;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return;
    fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
      .then((r) => r.json())
      .then((s) => {
        cached = { google: !!s.external?.google, confirmEmail: !s.mailer_autoconfirm };
        setProviders(cached);
      })
      .catch(() => {});
  }, []);

  return providers || { google: false, confirmEmail: true };
}
