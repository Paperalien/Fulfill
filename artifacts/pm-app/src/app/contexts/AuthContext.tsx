import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { setAuthTokenGetter } from '@workspace/api-client-react';

interface AuthContextValue {
  session: Session | null;
  workspaceId: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initialize from the current session on mount
    supabase.auth.getSession().then(({ data }) => {
      const initialSession = data.session ?? null;
      setSession(initialSession);

      if (initialSession) {
        setAuthTokenGetter(
          () => supabase.auth.getSession().then(({ data }) => data.session?.access_token ?? null)
        );
        ensurePersonalWorkspace(initialSession.access_token);
      } else {
        setLoading(false);
      }
    });

    // Listen for future auth state changes
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
        setLoading(false);
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
        setWorkspaceId(data.workspaceId ?? data.id ?? null);
      }
    } catch (err) {
      console.error('Failed to ensure personal workspace:', err);
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ session, workspaceId, loading, signOut }}>
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
