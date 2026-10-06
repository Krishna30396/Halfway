'use client';

import { useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import styles from '../auth.module.css';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      setError('Authentication is not configured yet. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
      return;
    }
    setLoading(true);
    setError(null);

    const { error: err } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    if (err) {
      setError(err.message);
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    const supabase = getSupabase();
    if (!supabase) {
      setError('Authentication is not configured yet.');
      return;
    }
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (err) setError(err.message);
  };

  if (success) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.logo}>HALFWAY</h1>
          <p className={styles.subtitle}>Check your email to confirm your account, then sign in.</p>
          <a href="/auth/login" className={styles.submit} style={{ textAlign: 'center', textDecoration: 'none', display: 'block' }}>
            Go to sign in
          </a>
          <a href="/" className={styles.back}>← Back to Halfway</a>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.logo}>HALFWAY</h1>
        <p className={styles.subtitle}>Create your account</p>

        <form className={styles.form} onSubmit={handleSubmit}>
          {error && <div className={styles.error}>{error}</div>}

          <div>
            <label className={styles.label} htmlFor="email">Email</label>
            <input
              id="email"
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div>
            <label className={styles.label} htmlFor="password">Password</label>
            <input
              id="password"
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className={styles.label} htmlFor="confirm">Confirm password</label>
            <input
              id="confirm"
              className={styles.input}
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>

          <button type="submit" className={styles.submit} disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>

          <div className={styles.divider}>or</div>

          <button type="button" className={styles.google} onClick={handleGoogle}>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z" fill="#4285F4"/>
              <path d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 01-7.18-2.54H1.83v2.07A8 8 0 008.98 17z" fill="#34A853"/>
              <path d="M4.5 10.52a4.8 4.8 0 010-3.04V5.41H1.83a8 8 0 000 7.18l2.67-2.07z" fill="#FBBC05"/>
              <path d="M8.98 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.59A8 8 0 001.83 5.4l2.67 2.07A4.8 4.8 0 018.98 3.58z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
        </form>

        <p className={styles.footer}>
          Already have an account? <a href="/auth/login">Sign in</a>
        </p>
        <a href="/" className={styles.back}>← Back to Halfway</a>
      </div>
    </div>
  );
}
