import type { AuthResponse, AuthUser, LoginInput, RegisterInput } from '@calisthenics/shared';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiFetch, refreshSession, setAccessToken, setSessionExpiredHandler } from '../../api/http';

type AuthState =
  | { status: 'loading' } // still asking the server whether a session exists
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: AuthUser };

interface AuthContextValue {
  state: AuthState;
  login: (input: LoginInput) => Promise<AuthUser>;
  register: (input: RegisterInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  // On first load, try to restore the session from the refresh cookie.
  useEffect(() => {
    let active = true;
    void refreshSession().then((session) => {
      if (!active) return;
      setState(session ? { status: 'authenticated', user: session.user } : { status: 'anonymous' });
    });
    setSessionExpiredHandler(() => setState({ status: 'anonymous' }));
    return () => {
      active = false;
      setSessionExpiredHandler(null);
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const start = (session: AuthResponse) => {
      setAccessToken(session.accessToken);
      setState({ status: 'authenticated', user: session.user });
      return session.user;
    };
    return {
      state,
      login: async (input) =>
        start(await apiFetch<AuthResponse>('/auth/login', { method: 'POST', body: input })),
      register: async (input) =>
        start(await apiFetch<AuthResponse>('/auth/register', { method: 'POST', body: input })),
      logout: async () => {
        try {
          await apiFetch('/auth/logout', { method: 'POST' });
        } finally {
          // Even if the request fails, this browser forgets the session.
          setAccessToken(null);
          setState({ status: 'anonymous' });
        }
      },
    };
  }, [state]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
