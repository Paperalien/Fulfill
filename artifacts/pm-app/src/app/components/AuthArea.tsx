import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { hasSeenFirstRun } from '../lib/localStore';
import { SavePrompt } from './SavePrompt';

export function AuthArea() {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const autoOpenedRef = useRef(false);

  // Auto-open on first visit, once per mount
  useEffect(() => {
    if (autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    if (!hasSeenFirstRun()) {
      setOpen(true);
    }
  }, []);

  if (isAuthenticated) return null;

  return <SavePrompt open={open} onOpenChange={setOpen} />;
}
