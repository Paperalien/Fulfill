import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCreateInvitation } from '@workspace/api-client-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteModal({ open, onOpenChange }: Props) {
  const { activeWorkspaceId, workspaces } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const activeWs = workspaces.find((w) => w.id === activeWorkspaceId);

  const { mutate: sendInvite, isPending } = useCreateInvitation({
    mutation: {
      onSuccess: () => {
        setSent(true);
        setApiError(null);
      },
      onError: () => {
        setApiError('Failed to send invitation. Please try again.');
      },
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeWorkspaceId || !email.trim()) return;
    setApiError(null);
    sendInvite({ workspaceId: activeWorkspaceId, data: { email: email.trim() } });
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      setEmail('');
      setSent(false);
      setApiError(null);
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Invite to {activeWs?.name ?? 'workspace'}</DialogTitle>
          <DialogDescription>
            They'll receive an email with a link to join.
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Invitation sent to <span className="font-medium text-foreground">{email}</span>.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setEmail(''); setSent(false); }}
              >
                Invite another
              </Button>
              <Button className="flex-1" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email address</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="colleague@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                required
              />
            </div>
            {apiError && <p className="text-sm text-destructive">{apiError}</p>}
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || !email.trim()}>
                {isPending ? 'Sending…' : 'Send invite'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
