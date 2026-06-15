import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { toast } from 'sonner';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '../../components/ui/popover';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { useAuth } from '../contexts/AuthContext';
import { markFirstRunSeen, hasLocalData } from '../lib/localStore';

type Panel = 'choice' | 'email' | 'merge-confirm' | 'sent';

// Supabase enforces a minimum interval between magic-link requests per email
// (default 60s); match it so the resend button can't fire a guaranteed failure.
const RESEND_COOLDOWN_SECONDS = 60;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  resendCooldownSeconds = RESEND_COOLDOWN_SECONDS,
}: Props) {
  const { signInWithEmail } = useAuth();
  const [panel, setPanel] = useState<Panel>('choice');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Tick the resend cooldown down to zero (chained 1s timeouts).
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setPanel('choice');
      setError(null);
      setCooldown(0);
    }
    onOpenChange(next);
  }

  function handleNotNow() {
    markFirstRunSeen();
    onOpenChange(false);
    toast('You can save anytime via the icon ↖', { duration: 5000 });
  }

  // Returns true if the email already has server-side data. Any failure (network,
  // non-200) is swallowed so we fall through and send the magic link anyway.
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

  async function sendMagicLink(addr: string) {
    await signInWithEmail(addr); // throws on provider error → caller shows it
    setSentTo(addr);
    setPanel('sent');
    setError(null);
    setCooldown(resendCooldownSeconds);
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    const addr = email.trim();
    if (!addr) return;
    setSubmitting(true);
    setError(null);
    try {
      if (hasLocalData() && (await emailHasServerData(addr))) {
        setPanel('merge-confirm');
        return;
      }
      await sendMagicLink(addr);
    } catch {
      setError("Couldn't send the magic link. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMerge() {
    setSubmitting(true);
    setError(null);
    try {
      await sendMagicLink(email.trim());
    } catch {
      setError("Couldn't send the magic link. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (resending || cooldown > 0) return;
    setResending(true);
    try {
      await signInWithEmail(sentTo);
      setCooldown(resendCooldownSeconds);
      toast('Magic link resent');
    } catch {
      toast("Couldn't resend — please try again in a moment.");
    } finally {
      setResending(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          title="Save your data"
        >
          <Mail size={14} />
          <span>Save your data</span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={8}
        collisionPadding={12}
        className="w-80 max-w-[calc(100vw-1.5rem)]"
      >
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
                We'll send you a magic link — no password needed.
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
              <Button size="sm" variant="ghost" type="button" onClick={() => { setError(null); setPanel('choice'); }}>
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
              <Button size="sm" onClick={handleMerge} disabled={submitting}>
                {submitting ? 'Sending…' : 'Merge and continue'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setError(null); setPanel('email'); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {panel === 'sent' && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Check your inbox!</p>
            <p className="text-xs text-muted-foreground">
              We sent a magic link to <span className="font-medium text-foreground">{sentTo}</span>.
              Click it to sync your data.
            </p>
            <div className="flex gap-2 mt-1">
              <Button
                size="sm"
                className="flex-1"
                onClick={handleResend}
                disabled={resending || cooldown > 0}
              >
                {resending
                  ? 'Sending…'
                  : cooldown > 0
                    ? `Resend in ${cooldown}s`
                    : 'Resend email'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
