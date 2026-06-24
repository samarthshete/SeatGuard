import { useState } from 'react';

export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
}

interface Props {
  apiUrl: string;
  user: AuthUser | null;
  onAuth: (token: string, user: AuthUser) => void;
  onLogout: () => void;
}

export default function AuthPanel({ apiUrl, user, onAuth, onLogout }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) {
    return (
      <div className="auth-bar">
        <span className="auth-who">
          Signed in as <strong>{user.email}</strong>
        </span>
        <button className="auth-btn ghost" onClick={onLogout}>
          Log out
        </button>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const path = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body =
        mode === 'login' ? { email, password } : { email, password, name: name || undefined };
      const res = await fetch(`${apiUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Authentication failed');
        return;
      }
      onAuth(data.token, data.user);
    } catch {
      setError('Network error — is the API reachable?');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="auth-bar" onSubmit={submit}>
      <div className="auth-tabs">
        <button
          type="button"
          className={mode === 'login' ? 'active' : ''}
          onClick={() => setMode('login')}
        >
          Log in
        </button>
        <button
          type="button"
          className={mode === 'register' ? 'active' : ''}
          onClick={() => setMode('register')}
        >
          Register
        </button>
      </div>
      {mode === 'register' && (
        <input
          aria-label="name"
          placeholder="Name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      )}
      <input
        aria-label="email"
        type="email"
        placeholder="Email"
        value={email}
        required
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        aria-label="password"
        type="password"
        placeholder={mode === 'register' ? 'Password (min 8 chars)' : 'Password'}
        value={password}
        required
        onChange={(e) => setPassword(e.target.value)}
      />
      <button className="auth-btn" type="submit" disabled={busy}>
        {busy ? '…' : mode === 'login' ? 'Log in' : 'Create account'}
      </button>
      {error && <span className="auth-error">{error}</span>}

      <style>{`
        .auth-bar {
          display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem;
          justify-content: center; margin: 1rem auto; padding: 0.75rem 1rem;
          background: #111; border: 1px solid #333; border-radius: 10px; max-width: 720px;
        }
        .auth-bar input {
          background: #1a1a1a; border: 1px solid #333; color: #fff;
          padding: 0.5rem 0.6rem; border-radius: 6px; font-size: 0.85rem;
        }
        .auth-tabs { display: flex; gap: 0.25rem; }
        .auth-tabs button {
          background: transparent; border: 1px solid #333; color: #888;
          padding: 0.4rem 0.7rem; border-radius: 6px; cursor: pointer; font-size: 0.8rem;
        }
        .auth-tabs button.active { color: #00ff88; border-color: rgba(0,255,136,0.4); }
        .auth-btn {
          background: #00ff88; color: #000; border: none; font-weight: 700;
          padding: 0.5rem 0.9rem; border-radius: 6px; cursor: pointer; font-size: 0.85rem;
        }
        .auth-btn:disabled { opacity: 0.6; cursor: default; }
        .auth-btn.ghost { background: transparent; color: #888; border: 1px solid #333; }
        .auth-who { color: #ccc; font-size: 0.85rem; }
        .auth-error { color: #ff5555; font-size: 0.8rem; width: 100%; text-align: center; }
      `}</style>
    </form>
  );
}
