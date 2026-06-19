import { useEffect, useRef, useState } from 'react';
import { Cloud, LayoutGrid, Users, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '../contexts/AuthContext';
import { useSavePromptOpener } from '../contexts/SavePromptContext';
import {
  hasSeenFirstRun,
  hasLocalData,
  markFirstRunSeen,
  readLastEmail,
} from '../lib/localStore';
import { detectPrivateMode } from '../lib/detectPrivateMode';

// Time to let the dialog's close animation finish before opening the save flow.
const DISMISS_ANIMATION_MS = 220;

interface Props {
  /** Injectable for tests; defaults to the real heuristic. */
  detectPrivate?: () => Promise<boolean>;
}

// First-run intro panel. Shows once, to a brand-new visitor on an empty device,
// explaining what Fulfill is and — upfront — that local data is browser-bound
// and lost when site data/cookies are cleared. If we think this is a private/
// incognito window we add a stronger "save your data" nudge. Returning users
// (remembered email) get the SavePrompt "Welcome back" flow instead, so this is
// deliberately skipped for them.
export function WelcomeIntro({ detectPrivate = detectPrivateMode }: Props) {
  const { isAuthenticated } = useAuth();
  const { requestOpenSavePrompt } = useSavePromptOpener();

  // Decide once, at mount. Skip when authenticated, when the intro was already
  // dismissed, when there's local data to protect, or for returning users.
  const shouldShowRef = useRef(
    !isAuthenticated &&
      !hasSeenFirstRun() &&
      !hasLocalData() &&
      !readLastEmail(),
  );
  const [open, setOpen] = useState(shouldShowRef.current);
  const [isPrivate, setIsPrivate] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    detectPrivate()
      .then((v) => {
        if (!cancelled) setIsPrivate(v);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, detectPrivate]);

  if (!shouldShowRef.current) return null;

  function dismiss() {
    markFirstRunSeen();
    setOpen(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) dismiss();
  }

  function handleSaveData() {
    markFirstRunSeen();
    setOpen(false);
    // Wait for this dialog's close animation to finish before opening the save
    // flow, so the two panels/overlays never stack (that double-transparency
    // looked muddy). Matches the Radix dialog close duration (~200ms).
    window.setTimeout(requestOpenSavePrompt, DISMISS_ANIMATION_MS);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Welcome to Fulfill</DialogTitle>
          <DialogDescription>You can close this and jump right in.</DialogDescription>
        </DialogHeader>

        {/* Data-persistence caveat — shown to everyone, upfront. */}
        <p className="text-sm text-muted-foreground">
          Your tasks are saved in this browser. They&rsquo;ll stay until you clear your
          cookies or site data &mdash; and they won&rsquo;t follow you to other devices.
        </p>

        {isPrivate && (
          <div
            className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
            role="alert"
          >
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <p>
              This looks like a private/incognito window. Anything you create here is
              erased when you close it &mdash;{' '}
              <span className="font-medium">save your data</span> to keep it.
            </p>
          </div>
        )}

        <ul className="space-y-3 text-sm">
          <li className="flex gap-2.5">
            <Cloud size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
            <span>
              <span className="font-medium text-foreground">Save your data</span> to keep
              your tasks and open them on any device.
            </span>
          </li>
          <li className="flex gap-2.5">
            <LayoutGrid size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
            <span>
              Need more? <span className="font-medium text-foreground">Kanban, sprints</span>{' '}
              and other views let you scale effortlessly.
            </span>
          </li>
          <li className="flex gap-2.5">
            <Users size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
            <span>
              Create and share{' '}
              <span className="font-medium text-foreground">workspaces</span> to make
              collaboration a breeze.
            </span>
          </li>
        </ul>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={dismiss}>
            Jump in
          </Button>
          <Button onClick={handleSaveData}>Save your data</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
