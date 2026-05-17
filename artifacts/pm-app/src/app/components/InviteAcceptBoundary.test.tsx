import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Hoist mock refs ───────────────────────────────────────────────────────────

const {
  mockMutate,
  mockRefreshWorkspaces,
  mockSwitchWorkspace,
  mockToast,
} = vi.hoisted(() => ({
  mockMutate: vi.fn(),
  mockRefreshWorkspaces: vi.fn(),
  mockSwitchWorkspace: vi.fn(),
  mockToast: vi.fn(),
}));

// Callbacks captured when hook renders — lets tests trigger success/error
let capturedOnSuccess: ((data: any) => void) | undefined;
let capturedOnError: ((err: any) => void) | undefined;

vi.mock('@workspace/api-client-react', () => ({
  useAcceptInvitation: (opts: any) => {
    capturedOnSuccess = opts?.mutation?.onSuccess;
    capturedOnError = opts?.mutation?.onError;
    return { mutate: mockMutate, isPending: false };
  },
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    refreshWorkspaces: mockRefreshWorkspaces,
    switchWorkspace: mockSwitchWorkspace,
  }),
}));

vi.mock('sonner', () => ({ toast: mockToast }));

// ── Import after mocks ────────────────────────────────────────────────────────
import { InviteAcceptBoundary } from './InviteAcceptBoundary';

// ── Helpers ───────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'fulfill:pendingInvite';

function renderBoundary() {
  render(<InviteAcceptBoundary />);
}

function useAuth() {
  return {
    isAuthenticated: true,
    refreshWorkspaces: mockRefreshWorkspaces,
    switchWorkspace: mockSwitchWorkspace,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedOnSuccess = undefined;
  capturedOnError = undefined;
  localStorage.clear();
  // Reset URL to clean state
  window.history.replaceState(null, '', '/');
  mockRefreshWorkspaces.mockResolvedValue(undefined);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('InviteAcceptBoundary', () => {
  it('does not show dialog when no token in localStorage', () => {
    renderBoundary();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows dialog when token is present in localStorage and user is authenticated', () => {
    localStorage.setItem(STORAGE_KEY, 'test-token-abc');
    renderBoundary();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/workspace invitation/i)).toBeInTheDocument();
  });

  it('reads token from URL, saves to localStorage, and strips it from the URL', () => {
    window.history.replaceState(null, '', '/?invite=url-token-123&other=keep');
    renderBoundary();

    expect(localStorage.getItem(STORAGE_KEY)).toBe('url-token-123');
    expect(window.location.search).not.toContain('invite=');
    expect(window.location.search).toContain('other=keep');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('Accept button calls mutate with the pending token', async () => {
    const user = userEvent.setup();
    localStorage.setItem(STORAGE_KEY, 'tok-xyz');
    renderBoundary();

    await user.click(screen.getByRole('button', { name: /accept invitation/i }));

    expect(mockMutate).toHaveBeenCalledWith({ token: 'tok-xyz' });
  });

  it('on success: clears localStorage, refreshes workspaces, switches, shows toast', async () => {
    const user = userEvent.setup();
    localStorage.setItem(STORAGE_KEY, 'tok-xyz');
    renderBoundary();

    await user.click(screen.getByRole('button', { name: /accept invitation/i }));
    await capturedOnSuccess!({ workspaceId: 'ws-new' });

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(mockRefreshWorkspaces).toHaveBeenCalledOnce();
    expect(mockSwitchWorkspace).toHaveBeenCalledWith('ws-new');
    expect(mockToast).toHaveBeenCalledWith(expect.stringMatching(/accepted/i));
  });

  it('on 410 error: shows API error message', async () => {
    const user = userEvent.setup();
    localStorage.setItem(STORAGE_KEY, 'tok-expired');
    renderBoundary();

    await user.click(screen.getByRole('button', { name: /accept invitation/i }));
    capturedOnError!({ status: 410, data: { error: 'This invite has expired.' } });

    await waitFor(() =>
      expect(screen.getByText('This invite has expired.')).toBeInTheDocument()
    );
    expect(localStorage.getItem(STORAGE_KEY)).toBe('tok-expired'); // not cleared on error
  });

  it('on 404 error: shows not-found message', async () => {
    const user = userEvent.setup();
    localStorage.setItem(STORAGE_KEY, 'tok-missing');
    renderBoundary();

    await user.click(screen.getByRole('button', { name: /accept invitation/i }));
    capturedOnError!({ status: 404 });

    await waitFor(() =>
      expect(screen.getByText(/invitation not found/i)).toBeInTheDocument()
    );
  });

  it('on generic error: shows fallback message', async () => {
    const user = userEvent.setup();
    localStorage.setItem(STORAGE_KEY, 'tok-x');
    renderBoundary();

    await user.click(screen.getByRole('button', { name: /accept invitation/i }));
    capturedOnError!({ status: 500 });

    await waitFor(() =>
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
    );
  });

  it('Decline clears localStorage and closes dialog', async () => {
    const user = userEvent.setup();
    localStorage.setItem(STORAGE_KEY, 'tok-decline');
    renderBoundary();

    await user.click(screen.getByRole('button', { name: /decline/i }));

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
