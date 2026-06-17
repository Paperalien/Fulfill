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
  refreshWorkspaces: () => Promise<void>;
  signOut: () => Promise<void>;
  signInWithEmail: (email: string) => Promise<void>;
  verifyOtp: (email: string, token: string) => Promise<void>;
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

  async function refreshWorkspaces() {
    try {
      const wsList = await fetchWorkspaces();
      setWorkspaces(wsList);
      const stillPresent = wsList.some((w) => w.id === activeWorkspaceId);
      if (!stillPresent) {
        const personal = wsList.find((w) => w.isPersonal);
        if (personal) {
          sessionStorage.setItem(SESSION_KEY, personal.id);
          setActiveWorkspaceId(personal.id);
        }
      }
    } catch (err) {
      console.error('Failed to refresh workspaces:', err);
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
    // Surface provider failures (e.g. rate limits). signInWithOtp reports errors
    // via the returned { error } rather than throwing, so callers that don't
    // check it would falsely treat a failed send as success.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
  }

  // Verify the 6-digit code the user typed back into this same tab. Completing
  // auth here (rather than via an emailed link opening some other browser) is
  // what guarantees the session lands where the user's local data lives, so the
  // localStorage→server migration runs against the right data. On success the
  // onAuthStateChange subscription above fires and drives workspace init.
  async function verifyOtp(email: string, token: string) {
    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });
    if (error) throw error;
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
        refreshWorkspaces,
        signOut,
        signInWithEmail,
        verifyOtp,
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
