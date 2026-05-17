import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  setAuthTokenGetter,
  ensurePersonalWorkspace as ensurePersonalWorkspaceApi,
  listWorkspaces as fetchWorkspaces,
  createWorkspace as createWorkspaceApi,
} from '@workspace/api-client-react';
import type { WorkspaceSummary } from '@workspace/api-client-react';

const SESSION_KEY = 'fulfill:activeWorkspaceId';

interface AuthContextValue {
  session: Session | null;
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  switchWorkspace: (id: string) => void;
  createWorkspace: (name: string) => Promise<WorkspaceSummary>;
  signOut: () => Promise<void>;
  signInWithEmail: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
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
        initWorkspaces();
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);

      if (newSession) {
        setAuthTokenGetter(
          () => supabase.auth.getSession().then(({ data }) => data.session?.access_token ?? null)
        );
        initWorkspaces();
      } else {
        setWorkspaces([]);
        setActiveWorkspaceId(null);
        setAuthTokenGetter(() => Promise.resolve(null));
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function initWorkspaces() {
    try {
      const { workspaceId: personalId } = await ensurePersonalWorkspaceApi();
      const wsList = await fetchWorkspaces();
      setWorkspaces(wsList);

      const stored = sessionStorage.getItem(SESSION_KEY);
      const validStored = stored ? wsList.some((w) => w.id === stored) : false;
      setActiveWorkspaceId(validStored ? stored : personalId);
    } catch (err) {
      console.error('Failed to initialize workspaces:', err);
    }
  }

  function switchWorkspace(id: string) {
    sessionStorage.setItem(SESSION_KEY, id);
    setActiveWorkspaceId(id);
  }

  async function createWorkspace(name: string): Promise<WorkspaceSummary> {
    const result = await createWorkspaceApi({ name });
    const newWs: WorkspaceSummary = {
      id: result.workspaceId,
      name: result.name,
      isPersonal: false,
      memberCount: 1,
    };
    setWorkspaces((prev) => [...prev, newWs]);
    return newWs;
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

  const isAuthenticated = !!session && !!activeWorkspaceId;

  return (
    <AuthContext.Provider
      value={{
        session,
        workspaces,
        activeWorkspaceId,
        loading,
        isAuthenticated,
        switchWorkspace,
        createWorkspace,
        signOut,
        signInWithEmail,
      }}
    >
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
