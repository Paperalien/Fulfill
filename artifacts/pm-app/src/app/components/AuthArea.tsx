import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { readLastEmail } from '../lib/localStore';
import { useSavePromptOpener } from '../contexts/SavePromptContext';
import { SavePrompt } from './SavePrompt';

interface Props {
  /**
   * Where this instance lives. Layout renders AuthArea twice — once in the
   * desktop sidebar, once in the mobile drawer — but only the one matching the
   * current viewport is "active". The inactive one renders nothing, so a single
   * save prompt opens (a centered dialog on mobile, an anchored popover on
   * desktop) instead of both firing at once.
   */
  placement: 'desktop' | 'mobile';
}

export function AuthArea({ placement }: Props) {
  const { isAuthenticated } = useAuth();
  const { openRequest } = useSavePromptOpener();
  const isMobile = useIsMobile();
  const active = placement === 'mobile' ? isMobile : !isMobile;
  const [open, setOpen] = useState(false);
  // Captured once at mount so the panel choice/auto-open stays stable for this
  // session even after the user signs in or clears their remembered email.
  const rememberedEmailRef = useRef<string | null>(readLastEmail());
  const autoOpenedRef = useRef(false);

  // Auto-open once, when this instance becomes active, for returning users with
  // a remembered email (the "Welcome back" nudge). Brand-new visitors are
  // handled by the WelcomeIntro dialog instead.
  useEffect(() => {
    if (autoOpenedRef.current || !active) return;
    autoOpenedRef.current = true;
    if (rememberedEmailRef.current) {
      setOpen(true);
    }
  }, [active]);

  // Open on demand when another component (e.g. WelcomeIntro) requests it.
  useEffect(() => {
    if (active && openRequest > 0) setOpen(true);
  }, [openRequest, active]);

  if (isAuthenticated || !active) return null;

  return (
    <SavePrompt
      variant={placement === 'mobile' ? 'dialog' : 'popover'}
      open={open}
      onOpenChange={setOpen}
      rememberedEmail={rememberedEmailRef.current}
    />
  );
}
