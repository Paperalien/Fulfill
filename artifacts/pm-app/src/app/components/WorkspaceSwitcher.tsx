import { useState, useEffect } from 'react';
import {
  Check,
  ChevronDown,
  Plus,
  LogOut,
  UserPlus,
  Pencil,
  DoorOpen,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import {
  useRenameWorkspace,
  useLeaveWorkspace,
  useCheckWorkspaceName,
  getCheckWorkspaceNameQueryKey,
} from '@workspace/api-client-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InviteModal } from './InviteModal';

// ── Helpers ───────────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

// ── Create workspace dialog ───────────────────────────────────────────────────

interface CreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function CreateWorkspaceDialog({ open, onOpenChange }: CreateDialogProps) {
  const { createWorkspace, switchWorkspace } = useAuth();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const debouncedName = useDebounce(name.trim(), 400);
  const canCheck = debouncedName.length >= 1 && debouncedName.length <= 20;

  const { data: availability } = useCheckWorkspaceName(
    { name: debouncedName },
    { query: { enabled: canCheck, queryKey: getCheckWorkspaceNameQueryKey({ name: debouncedName }) } }
  );

  const nameError =
    name.trim().length === 0
      ? null
      : name.trim().length > 20
      ? 'Name must be 20 characters or fewer'
      : canCheck && availability?.available === false
      ? 'That name is already taken'
      : null;

  const canSubmit =
    name.trim().length >= 1 &&
    name.trim().length <= 20 &&
    !nameError &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setApiError(null);
    try {
      const ws = await createWorkspace(name.trim());
      switchWorkspace(ws.id);
      onOpenChange(false);
      toast(`Workspace "${ws.name}" created`);
    } catch {
      setApiError('Failed to create workspace. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) { setName(''); setApiError(null); }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Create workspace</DialogTitle>
          <DialogDescription>
            A shared space for your team. Up to 20 characters.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ws-name">Name</Label>
            <Input
              id="ws-name"
              placeholder="e.g. Acme Team"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={21}
              autoFocus
            />
            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
            {apiError && <p className="text-xs text-destructive">{apiError}</p>}
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Rename workspace dialog ───────────────────────────────────────────────────

interface RenameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  currentName: string;
}

function RenameWorkspaceDialog({ open, onOpenChange, workspaceId, currentName }: RenameDialogProps) {
  const { refreshWorkspaces } = useAuth();
  const [name, setName] = useState(currentName);
  const [apiError, setApiError] = useState<string | null>(null);

  const debouncedName = useDebounce(name.trim(), 400);
  const changed = name.trim() !== currentName;
  const canCheck = changed && debouncedName.length >= 1 && debouncedName.length <= 20;

  const { data: availability } = useCheckWorkspaceName(
    { name: debouncedName },
    { query: { enabled: canCheck, queryKey: getCheckWorkspaceNameQueryKey({ name: debouncedName }) } }
  );

  const nameError =
    !changed
      ? null
      : name.trim().length === 0
      ? 'Name is required'
      : name.trim().length > 20
      ? 'Name must be 20 characters or fewer'
      : canCheck && availability?.available === false
      ? 'That name is already taken'
      : null;

  const { mutate: rename, isPending } = useRenameWorkspace({
    mutation: {
      onSuccess: async () => {
        await refreshWorkspaces();
        onOpenChange(false);
        toast('Workspace renamed');
      },
      onError: () => {
        setApiError('Failed to rename. Please try again.');
      },
    },
  });

  const canSubmit = changed && !nameError && !isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setApiError(null);
    rename({ workspaceId, data: { name: name.trim() } });
  }

  function handleOpenChange(next: boolean) {
    if (!next) { setName(currentName); setApiError(null); }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename workspace</DialogTitle>
          <DialogDescription>Up to 20 characters, must be unique.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rename-ws">Name</Label>
            <Input
              id="rename-ws"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={21}
              autoFocus
            />
            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
            {apiError && <p className="text-xs text-destructive">{apiError}</p>}
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── WorkspaceSwitcher ─────────────────────────────────────────────────────────

export function WorkspaceSwitcher() {
  const { workspaces, activeWorkspaceId, switchWorkspace, signOut, refreshWorkspaces } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const activeWs = workspaces.find((w) => w.id === activeWorkspaceId);
  const isShared = activeWs && !activeWs.isPersonal;

  const { mutate: leaveWorkspace, isPending: isLeaving } = useLeaveWorkspace({
    mutation: {
      onSuccess: async () => {
        setLeaveOpen(false);
        await refreshWorkspaces();
        toast('You left the workspace');
      },
      onError: () => {
        toast.error('Failed to leave workspace');
      },
    },
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-1.5 w-full text-left rounded-md px-2 py-1.5 text-sm font-medium hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
            <span className="flex-1 truncate">{activeWs?.name ?? '…'}</span>
            <ChevronDown size={13} className="shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Workspaces
          </DropdownMenuLabel>

          {workspaces.map((ws) => (
            <DropdownMenuItem
              key={ws.id}
              onClick={() => switchWorkspace(ws.id)}
              className="gap-2"
            >
              <Check
                size={13}
                className={ws.id === activeWorkspaceId ? 'opacity-100' : 'opacity-0'}
              />
              <span className="truncate">{ws.name}</span>
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus size={13} />
            Create workspace
          </DropdownMenuItem>

          {isShared && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setInviteOpen(true)} className="gap-2">
                <UserPlus size={13} />
                Invite members
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setRenameOpen(true)} className="gap-2">
                <Pencil size={13} />
                Rename workspace
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setLeaveOpen(true)}
                className="gap-2 text-destructive focus:text-destructive"
              >
                <DoorOpen size={13} />
                Leave workspace
              </DropdownMenuItem>
            </>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={signOut} className="gap-2 text-muted-foreground">
            <LogOut size={13} />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
      <InviteModal open={inviteOpen} onOpenChange={setInviteOpen} />

      {activeWs && isShared && (
        <>
          <RenameWorkspaceDialog
            open={renameOpen}
            onOpenChange={setRenameOpen}
            workspaceId={activeWs.id}
            currentName={activeWs.name}
          />
          <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Leave "{activeWs.name}"?</AlertDialogTitle>
                <AlertDialogDescription>
                  You'll lose access to all tasks in this workspace. A member can re-invite you later.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isLeaving}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                  disabled={isLeaving}
                  onClick={() => leaveWorkspace({ workspaceId: activeWs.id })}
                >
                  {isLeaving ? 'Leaving…' : 'Leave workspace'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </>
  );
}
