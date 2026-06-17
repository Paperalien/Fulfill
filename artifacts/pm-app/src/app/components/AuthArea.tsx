import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { hasSeenFirstRun, readLastEmail } from '../lib/localStore';
import { SavePrompt } from './SavePrompt';

export function AuthArea() {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  // Captured once at mount so the panel choice/auto-open stays stable for this
  // session even after the user signs in or clears their remembered email.
  const rememberedEmailRef = useRef<string | null>(readLastEmail());
  const autoOpenedRef = useRef(false);

  // Auto-open on startup, once per mount, for two cases:
  //  • brand-new visitors who haven't seen the first-run prompt, and
  //  • returning users with a remembered email (the "Welcome back" nudge).
  useEffect(() => {
    if (autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    if (!hasSeenFirstRun() || rememberedEmailRef.current) {
      setOpen(true);
    }
  }, []);

  if (isAuthenticated) return null;

  return (
    <SavePrompt
      open={open}
      onOpenChange={setOpen}
      rememberedEmail={rememberedEmailRef.current}
    />
  );
}
