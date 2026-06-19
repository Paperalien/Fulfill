import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { toast } from 'sonner';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '../../components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { useAuth } from '../contexts/AuthContext';
import {
  markFirstRunSeen,
  hasLocalData,
  writeLastEmail,
  clearLastEmail,
} from '../lib/localStore';

type Panel = 'choice' | 'welcome' | 'email' | 'merge-confirm' | 'account-exists' | 'code';

// Supabase enforces a minimum interval between code requests per email
// (default 60s); match it so the resend button can't fire a guaranteed failure.
const RESEND_COOLDOWN_SECONDS = 60;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Shell to render the flow in. `popover` anchors to the trigger (desktop);
   * `dialog` is a centered modal (mobile, where there's no stable anchor once
   * the sidebar collapses into a drawer).
   */
  variant?: 'popover' | 'dialog';
  /**
   * Last email a code was sent to on this device, if any. When present the
   * prompt opens on a "Welcome back" panel pre-filled with this address so a
   * returning user can sign in with one tap.
   */
  rememberedEmail?: string | null;
  /**
   * Seconds the Resend button stays disabled after a send. Defaults to
   * RESEND_COOLDOWN_SECONDS (matches Supabase's min OTP interval); overridable
   * so tests can exercise the enabled state without waiting.
   */
  resendCooldownSeconds?: number;
}

export function SavePrompt({
  open,
  onOpenChange,
  variant = 'popover',
  rememberedEmail = null,
  resendCooldownSeconds = RESEND_COOLDOWN_SECONDS,
}: Props) {
  const { signInWithEmail, verifyOtp } = useAuth();
  const initialPanel: Panel = rememberedEmail ? 'welcome' : 'choice';
  const [panel, setPanel] = useState<Panel>(initialPanel);
  const [email, setEmail] = useState(rememberedEmail ?? '');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sentTo, setSentTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Tick the resend cooldown down to zero (chained 1s timeouts).
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  function resetToStart() {
    setPanel(rememberedEmail ? 'welcome' : 'choice');
    setError(null);
    setCodeError(null);
    setCode('');
    setCooldown(0);
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      resetToStart();
    }
    onOpenChange(next);
  }

  function handleNotNow() {
    markFirstRunSeen();
    onOpenChange(false);
    toast('You can save anytime via the icon ↖', { duration: 5000 });
  }

  // Returns true if the email already has server-side data. Any failure (network,
  // non-200) is swallowed so we fall through and send the code anyway.
  async function emailHasServerData(addr: string): Promise<boolean> {
    try {
      const baseUrl = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '').replace(/\/+$/, '');
      const resp = await fetch(`${baseUrl}/api/users/check-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addr }),
      });
      if (!resp.ok) return false;
      const data = await resp.json() as { hasData: boolean };
      return data.hasData;
    } catch {
      return false;
    }
  }

  async function sendCode(addr: string) {
    await signInWithEmail(addr); // throws on provider error → caller shows it
    writeLastEmail(addr);
    setSentTo(addr);
    setCode('');
    setCodeError(null);
    setPanel('code');
    setError(null);
    setCooldown(resendCooldownSeconds);
  }

  // Shared submit path used by both the email form and the returning-user
  // "Email me a code" button. When the email already has a server account we
  // surface that before sending the code: a merge confirmation if there's local
  // data to upload, otherwise a "welcome back" acknowledgment so a returning
  // user on a new device isn't shown sign-up framing. `acknowledgeExisting` is
  // false when the caller (the "Welcome back" panel) has already done that.
  async function submitEmail(addr: string, acknowledgeExisting = true) {
    setSubmitting(true);
    setError(null);
    try {
      if (await emailHasServerData(addr)) {
        if (hasLocalData()) {
          setPanel('merge-confirm');
          return;
        }
        if (acknowledgeExisting) {
          setPanel('account-exists');
          return;
        }
      }
      await sendCode(addr);
    } catch {
      setError("Couldn't send the code. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    const addr = email.trim();
    if (!addr) return;
    await submitEmail(addr);
  }

  // Send the code to the email already entered. Shared by the merge-confirm and
  // account-exists panels — both just need to fire the code once the user has
  // acknowledged that the email already has a server account.
  async function sendCodeToEnteredEmail() {
    setSubmitting(true);
    setError(null);
    try {
      await sendCode(email.trim());
    } catch {
      setError("Couldn't send the code. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    const token = code.trim();
    if (!token) return;
    setVerifying(true);
    setCodeError(null);
    try {
      await verifyOtp(sentTo, token);
      // Auth state flips via onAuthStateChange; close the popover. Migration
      // (if any local data) is driven by useMigration in the same tab.
      onOpenChange(false);
    } catch {
      setCodeError('That code didn’t work. Check it and try again.');
    } finally {
      setVerifying(false);
    }
  }

  function handleUseDifferentEmail() {
    clearLastEmail();
    setEmail('');
    setError(null);
    setPanel('email');
  }

  async function handleResend() {
    if (resending || cooldown > 0) return;
    setResending(true);
    try {
      await signInWithEmail(sentTo);
      setCooldown(resendCooldownSeconds);
      toast('Code resent');
    } catch {
      toast("Couldn't resend — please try again in a moment.");
    } finally {
      setResending(false);
    }
  }

  const triggerButton = (
    <button
      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      title={rememberedEmail ? 'Sign in' : 'Save your data'}
    >
      <Mail size={14} />
      <span>{rememberedEmail ? 'Sign in' : 'Save your data'}</span>
    </button>
  );

  const body = (
    <>
        {panel === 'welcome' && (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-foreground">Welcome back</p>
              <p className="text-xs text-muted-foreground mt-1">
                Sign in as <span className="font-medium text-foreground">{rememberedEmail}</span> to
                sync your tasks. We'll email you a 6-digit code.
              </p>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex flex-col gap-2">
              <Button size="sm" onClick={() => submitEmail((rememberedEmail ?? '').trim(), false)} disabled={submitting}>
                {submitting ? 'Sending…' : 'Email me a code'}
              </Button>
              <Button size="sm" variant="ghost" onClick={handleUseDifferentEmail}>
                Use a different email
              </Button>
              <Button size="sm" variant="ghost" onClick={handleNotNow}>
                Not now
              </Button>
            </div>
          </div>
        )}

        {panel === 'choice' && (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-foreground">Save across devices?</p>
              <p className="text-xs text-muted-foreground mt-1">
                Your tasks are stored locally right now. Add your email to sync them anywhere.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button size="sm" onClick={() => setPanel('email')}>
                Yes, set me up
              </Button>
              <Button size="sm" variant="ghost" onClick={handleNotNow}>
                Not now
              </Button>
            </div>
          </div>
        )}

        {panel === 'email' && (
          <form onSubmit={handleEmailSubmit} className="space-y-3">
            <div>
              <p className="text-sm font-medium text-foreground">Enter your email</p>
              <p className="text-xs text-muted-foreground mt-1">
                We'll email you a 6-digit code — no password needed.
              </p>
            </div>
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              required
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button size="sm" type="submit" disabled={submitting} className="flex-1">
                {submitting ? 'Checking…' : 'Continue'}
              </Button>
              <Button size="sm" variant="ghost" type="button" onClick={() => { setError(null); resetToStart(); }}>
                Back
              </Button>
            </div>
          </form>
        )}

        {panel === 'merge-confirm' && (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-foreground">You already have saved data</p>
              <p className="text-xs text-muted-foreground mt-1">
                This email has existing tasks on the server. Your local tasks will be merged in — nothing will be deleted.
              </p>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex flex-col gap-2">
              <Button size="sm" onClick={sendCodeToEnteredEmail} disabled={submitting}>
                {submitting ? 'Sending…' : 'Merge and continue'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setError(null); setPanel('email'); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {panel === 'account-exists' && (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-foreground">Welcome back</p>
              <p className="text-xs text-muted-foreground mt-1">
                <span className="font-medium text-foreground">{email}</span> already has an
                account. We'll email you a 6-digit code to sign in — your saved tasks will load
                once you're in.
              </p>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex flex-col gap-2">
              <Button size="sm" onClick={sendCodeToEnteredEmail} disabled={submitting}>
                {submitting ? 'Sending…' : 'Email me a code'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setError(null); setPanel('email'); }}>
                Use a different email
              </Button>
            </div>
          </div>
        )}

        {panel === 'code' && (
          <form onSubmit={handleVerify} className="space-y-3">
            <div>
              <p className="text-sm font-medium text-foreground">Check your email</p>
              <p className="text-xs text-muted-foreground mt-1">
                Enter the 6-digit code we sent to{' '}
                <span className="font-medium text-foreground">{sentTo}</span>.
              </p>
            </div>
            <Input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              autoFocus
              required
            />
            {codeError && <p className="text-xs text-destructive">{codeError}</p>}
            <Button size="sm" type="submit" disabled={verifying} className="w-full">
              {verifying ? 'Verifying…' : 'Sign in'}
            </Button>
            <div className="flex items-center justify-between pt-0.5">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleResend}
                disabled={resending || cooldown > 0}
              >
                {resending
                  ? 'Sending…'
                  : cooldown > 0
                    ? `Resend in ${cooldown}s`
                    : 'Resend code'}
              </button>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => { setCodeError(null); setCode(''); setPanel('email'); }}
              >
                Use a different email
              </button>
            </div>
          </form>
        )}
    </>
  );

  if (variant === 'dialog') {
    // Controlled-only (no trigger): on mobile the "Save your data" trigger lives
    // in the collapsible drawer, which unmounts when closed — so this dialog is
    // mounted at the top level and opened via the SavePrompt opener instead.
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          aria-describedby={undefined}
          className="w-80 max-w-[calc(100vw-1.5rem)] gap-3"
        >
          {/* The visible panel headings act as the title; this keeps Radix's
              a11y requirement satisfied without a duplicate heading. */}
          <DialogTitle className="sr-only">Save your data</DialogTitle>
          {body}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={8}
        collisionPadding={12}
        className="w-80 max-w-[calc(100vw-1.5rem)]"
      >
        {body}
      </PopoverContent>
    </Popover>
  );
}
