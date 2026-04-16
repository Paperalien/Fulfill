import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { setAuthTokenGetter } from '@workspace/api-client-react';

interface AuthContextValue {
  session: Session | null;
  workspaceId: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
  signInWithEmail: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Resolve loading as soon as getSession() returns — don't wait for workspace
    supabase.auth.getSession().then(({ data }) => {
      const initialSession = data.session ?? null;
      setSession(initialSession);
      setLoading(false);

      if (initialSession) {
        setAuthTokenGetter(
          () => supabase.auth.getSession().then(({ data }) => data.session?.access_token ?? null)
        );
        ensurePersonalWorkspace(initialSession.access_token);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);

      if (newSession) {
        setAuthTokenGetter(
          () => supabase.auth.getSession().then(({ data }) => data.session?.access_token ?? null)
        );
        ensurePersonalWorkspace(newSession.access_token);
      } else {
        setWorkspaceId(null);
        setAuthTokenGetter(() => Promise.resolve(null));
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function ensurePersonalWorkspace(accessToken: string) {
    try {
      const baseUrl = (import.meta.env.VITE_API_BASE_URL as string).replace(/\/+$/, '');
      const response = await fetch(`${baseUrl}/api/workspaces/ensure-personal`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setWorkspaceId(data.workspaceId ?? null);
      }
    } catch (err) {
      console.error('Failed to ensure personal workspace:', err);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function signInWithEmail(email: string) {
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
  }

  const isAuthenticated = !!session && !!workspaceId;

  return (
    <AuthContext.Provider value={{ session, workspaceId, loading, isAuthenticated, signOut, signInWithEmail }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
