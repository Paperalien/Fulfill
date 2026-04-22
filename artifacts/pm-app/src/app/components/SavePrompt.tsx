import { useState } from 'react';
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SavePrompt({ open, onOpenChange }: Props) {
  const { signInWithEmail } = useAuth();
  const [panel, setPanel] = useState<Panel>('choice');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState('');

  function handleOpenChange(next: boolean) {
    if (!next) setPanel('choice');
    onOpenChange(next);
  }

  function handleNotNow() {
    markFirstRunSeen();
    onOpenChange(false);
    toast('You can save anytime via the icon ↖', { duration: 5000 });
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      // If there's local data, check whether this email already has server data.
      // If so, show the merge-confirm panel before sending the OTP.
      if (hasLocalData()) {
        const baseUrl = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '').replace(/\/+$/, '');
        const resp = await fetch(`${baseUrl}/api/users/check-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim() }),
        });
        if (resp.ok) {
          const data = await resp.json() as { hasData: boolean };
          if (data.hasData) {
            setPanel('merge-confirm');
            return;
          }
        }
        // If the check fails (network error etc.), fall through and send OTP anyway
      }
      await signInWithEmail(email.trim());
      setSentTo(email.trim());
      setPanel('sent');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMerge() {
    setSubmitting(true);
    try {
      await signInWithEmail(email.trim());
      setSentTo(email.trim());
      setPanel('sent');
    } finally {
      setSubmitting(false);
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
        side="right"
        align="start"
        sideOffset={12}
        className="w-80"
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
            <div className="flex gap-2">
              <Button size="sm" type="submit" disabled={submitting} className="flex-1">
                {submitting ? 'Checking…' : 'Continue'}
              </Button>
              <Button size="sm" variant="ghost" type="button" onClick={() => setPanel('choice')}>
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
            <div className="flex flex-col gap-2">
              <Button size="sm" onClick={handleMerge} disabled={submitting}>
                {submitting ? 'Sending…' : 'Merge and continue'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPanel('email')}>
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
            <Button size="sm" variant="ghost" className="w-full mt-1" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
