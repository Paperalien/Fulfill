import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Hoist mock refs ───────────────────────────────────────────────────────────

const {
  mockSwitchWorkspace,
  mockSignOut,
  mockRefreshWorkspaces,
  mockLeaveMutate,
  mockToast,
} = vi.hoisted(() => ({
  mockSwitchWorkspace: vi.fn(),
  mockSignOut: vi.fn(),
  mockRefreshWorkspaces: vi.fn(),
  mockLeaveMutate: vi.fn(),
  mockToast: vi.fn(),
}));

let capturedLeaveOnSuccess: (() => void) | undefined;
let capturedLeaveOnError: (() => void) | undefined;

const PERSONAL_WS = { id: 'ws-personal', name: 'Personal', isPersonal: true };
const SHARED_WS = { id: 'ws-shared', name: 'Acme Team', isPersonal: false };

let mockAuthReturn = {
  workspaces: [PERSONAL_WS],
  activeWorkspaceId: 'ws-personal',
  switchWorkspace: mockSwitchWorkspace,
  signOut: mockSignOut,
  refreshWorkspaces: mockRefreshWorkspaces,
  createWorkspace: vi.fn(),
};

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockAuthReturn,
}));

vi.mock('@workspace/api-client-react', () => ({
  useRenameWorkspace: () => ({ mutate: vi.fn(), isPending: false }),
  useLeaveWorkspace: (opts: any) => {
    capturedLeaveOnSuccess = opts?.mutation?.onSuccess;
    capturedLeaveOnError = opts?.mutation?.onError;
    return { mutate: mockLeaveMutate, isPending: false };
  },
  useCheckWorkspaceName: () => ({ data: undefined }),
  getCheckWorkspaceNameQueryKey: () => [],
  useCreateInvitation: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('sonner', () => ({ toast: { ...vi.fn(), error: vi.fn() }, }));

// Mock InviteModal so it doesn't pull in its own dependency chain
vi.mock('./InviteModal', () => ({
  InviteModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="invite-modal" /> : null,
}));

// ── Import after mocks ────────────────────────────────────────────────────────
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function openDropdown() {
  const user = userEvent.setup();
  const trigger = screen.getByRole('button', { name: /acme team|personal/i });
  await user.click(trigger);
  return user;
}

function renderSwitcher() {
  render(<WorkspaceSwitcher />);
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedLeaveOnSuccess = undefined;
  capturedLeaveOnError = undefined;
  mockRefreshWorkspaces.mockResolvedValue(undefined);
  // Default: personal workspace only
  mockAuthReturn = {
    workspaces: [PERSONAL_WS],
    activeWorkspaceId: 'ws-personal',
    switchWorkspace: mockSwitchWorkspace,
    signOut: mockSignOut,
    refreshWorkspaces: mockRefreshWorkspaces,
    createWorkspace: vi.fn(),
  };
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WorkspaceSwitcher', () => {
  it('displays the active workspace name as the trigger', () => {
    renderSwitcher();
    expect(screen.getByText('Personal')).toBeInTheDocument();
  });

  it('shows all workspaces in the dropdown', async () => {
    mockAuthReturn = {
      ...mockAuthReturn,
      workspaces: [PERSONAL_WS, SHARED_WS],
      activeWorkspaceId: 'ws-personal',
    };
    renderSwitcher();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button'));
    await waitFor(() => screen.getByText('Acme Team'));

    // "Personal" appears in both the trigger and the dropdown list
    expect(screen.getAllByText('Personal').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Acme Team')).toBeInTheDocument();
  });

  it('clicking another workspace calls switchWorkspace', async () => {
    mockAuthReturn = {
      ...mockAuthReturn,
      workspaces: [PERSONAL_WS, SHARED_WS],
      activeWorkspaceId: 'ws-personal',
    };
    renderSwitcher();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button'));
    await waitFor(() => screen.getByText('Acme Team'));
    await user.click(screen.getByText('Acme Team'));

    expect(mockSwitchWorkspace).toHaveBeenCalledWith('ws-shared');
  });

  it('"Create workspace" option is always present', async () => {
    renderSwitcher();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button'));
    await waitFor(() => screen.getByText(/create workspace/i));
    expect(screen.getByText(/create workspace/i)).toBeInTheDocument();
  });

  it('personal workspace: does NOT show invite/rename/leave options', async () => {
    renderSwitcher();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button'));
    await waitFor(() => screen.getByText(/create workspace/i));

    expect(screen.queryByText(/invite members/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/rename workspace/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/leave workspace/i)).not.toBeInTheDocument();
  });

  it('shared workspace: shows invite, rename, and leave options', async () => {
    mockAuthReturn = {
      ...mockAuthReturn,
      workspaces: [PERSONAL_WS, SHARED_WS],
      activeWorkspaceId: 'ws-shared',
    };
    renderSwitcher();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button'));
    await waitFor(() => screen.getByText(/invite members/i));

    expect(screen.getByText(/invite members/i)).toBeInTheDocument();
    expect(screen.getByText(/rename workspace/i)).toBeInTheDocument();
    expect(screen.getByText(/leave workspace/i)).toBeInTheDocument();
  });

  it('"Sign out" calls signOut', async () => {
    renderSwitcher();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button'));
    await waitFor(() => screen.getByText(/sign out/i));
    await user.click(screen.getByText(/sign out/i));

    expect(mockSignOut).toHaveBeenCalledOnce();
  });

  it('Leave workspace confirm button calls leaveWorkspace mutation', async () => {
    mockAuthReturn = {
      ...mockAuthReturn,
      workspaces: [PERSONAL_WS, SHARED_WS],
      activeWorkspaceId: 'ws-shared',
    };
    renderSwitcher();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button'));
    await waitFor(() => screen.getByText(/leave workspace/i));
    await user.click(screen.getByText(/leave workspace/i));

    // AlertDialog confirm button
    await waitFor(() => screen.getByRole('alertdialog'));
    const confirmBtn = screen.getByRole('button', { name: /leave workspace/i });
    await user.click(confirmBtn);

    expect(mockLeaveMutate).toHaveBeenCalledWith({ workspaceId: 'ws-shared' });
  });
});
