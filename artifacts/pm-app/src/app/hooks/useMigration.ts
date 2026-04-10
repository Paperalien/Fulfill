import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  hasLocalData,
  clearLocalData,
  readColumns,
  readSprints,
  readTasks,
} from '../lib/localStore';

type MigrationStatus = 'idle' | 'migrating' | 'error';

const MIGRATION_TIMEOUT_MS = 60_000;

export function useMigration() {
  const { isAuthenticated, workspaceId } = useAuth();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<MigrationStatus>('idle');
  const triggeredRef = useRef(false);

  async function runMigration() {
    // Flush any unsaved modal edits to localStorage before reading
    window.dispatchEvent(new CustomEvent('fulfill:flush-edits'));
    await Promise.resolve(); // one tick so event handlers complete

    setStatus('migrating');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('No access token');

      const baseUrl = (import.meta.env.VITE_API_BASE_URL as string).replace(/\/+$/, '');

      const columns = readColumns();
      const sprints = readSprints();
      const tasks = readTasks();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), MIGRATION_TIMEOUT_MS);

      try {
        const resp = await fetch(`${baseUrl}/api/workspaces/${workspaceId}/migrate`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ columns, sprints, tasks }),
          signal: controller.signal,
        });

        if (!resp.ok) {
          throw new Error(`Migration returned ${resp.status}`);
        }
      } finally {
        clearTimeout(timeoutId);
      }

      clearLocalData();
      queryClient.invalidateQueries();
      setStatus('idle');
    } catch (err) {
      console.error('Migration failed:', err);
      setStatus('error');
    }
  }

  useEffect(() => {
    if (!isAuthenticated || !workspaceId) return;
    if (!hasLocalData()) return;
    if (triggeredRef.current) return;
    triggeredRef.current = true;
    runMigration();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, workspaceId]);

  function retry() {
    if (!isAuthenticated || !workspaceId || !hasLocalData()) return;
    triggeredRef.current = true;
    runMigration();
  }

  return { status, retry };
}
