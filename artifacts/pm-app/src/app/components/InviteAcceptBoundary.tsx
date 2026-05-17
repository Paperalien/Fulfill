import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { useAcceptInvitation } from '@workspace/api-client-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'fulfill:pendingInvite';

// Reads ?invite=TOKEN from the current URL, saves it, and strips it from the
// address bar. Returns the token if found, otherwise null.
function consumeUrlToken(): string | null {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('invite');
  if (!token) return null;

  params.delete('invite');
  const clean = params.toString()
    ? `${window.location.pathname}?${params}`
    : window.location.pathname;
  window.history.replaceState(null, '', clean);
  return token;
}

export function InviteAcceptBoundary() {
  const { isAuthenticated, refreshWorkspaces, switchWorkspace } = useAuth();
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Capture token from URL on mount and persist it across the magic-link
  // redirect (the invite link → sign in → redirect back clears the URL).
  useEffect(() => {
    const urlToken = consumeUrlToken();
    if (urlToken) localStorage.setItem(STORAGE_KEY, urlToken);

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setPendingToken(stored);
  }, []);

  const { mutate: accept, isPending } = useAcceptInvitation({
    mutation: {
      onSuccess: async (data) => {
        localStorage.removeItem(STORAGE_KEY);
        setPendingToken(null);
        setErrorMsg(null);
        await refreshWorkspaces();
        switchWorkspace(data.workspaceId);
        toast('Invitation accepted — welcome to the workspace!');
      },
      onError: (err) => {
        const status = (err as any)?.status as number | undefined;
        const apiMsg = (err as any)?.data as { error?: string } | null;
        if (status === 410) {
          setErrorMsg(apiMsg?.error ?? 'This invitation has expired or has already been used.');
        } else if (status === 404) {
          setErrorMsg('Invitation not found. It may have been deleted.');
        } else {
          setErrorMsg('Something went wrong accepting the invitation. Please try again.');
        }
      },
    },
  });

  function handleAccept() {
    if (!pendingToken) return;
    setErrorMsg(null);
    accept({ token: pendingToken });
  }

  function handleDismiss() {
    localStorage.removeItem(STORAGE_KEY);
    setPendingToken(null);
    setErrorMsg(null);
  }

  const open = isAuthenticated && !!pendingToken;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) handleDismiss(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Workspace invitation</DialogTitle>
          <DialogDescription>
            You have a pending invitation to join a workspace.
          </DialogDescription>
        </DialogHeader>

        {errorMsg ? (
          <div className="space-y-4">
            <p className="text-sm text-destructive">{errorMsg}</p>
            <Button variant="outline" className="w-full" onClick={handleDismiss}>
              Dismiss
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Do you want to accept this invitation and join the workspace?
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={handleDismiss} disabled={isPending}>
                Decline
              </Button>
              <Button onClick={handleAccept} disabled={isPending}>
                {isPending ? 'Joining…' : 'Accept invitation'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
