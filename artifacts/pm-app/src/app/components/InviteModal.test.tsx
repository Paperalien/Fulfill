import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Hoist mock refs ───────────────────────────────────────────────────────────

const { mockMutate } = vi.hoisted(() => ({
  mockMutate: vi.fn(),
}));

let capturedOnSuccess: (() => void) | undefined;
let capturedOnError: (() => void) | undefined;

vi.mock('@workspace/api-client-react', () => ({
  useCreateInvitation: (opts: any) => {
    capturedOnSuccess = opts?.mutation?.onSuccess;
    capturedOnError = opts?.mutation?.onError;
    return { mutate: mockMutate, isPending: false };
  },
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    activeWorkspaceId: 'ws-shared',
    workspaces: [{ id: 'ws-shared', name: 'Acme Team', isPersonal: false }],
  }),
}));

// ── Import after mocks ────────────────────────────────────────────────────────
import { InviteModal } from './InviteModal';

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderModal(open = true, onOpenChange = vi.fn()) {
  render(<InviteModal open={open} onOpenChange={onOpenChange} />);
  return { onOpenChange };
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedOnSuccess = undefined;
  capturedOnError = undefined;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('InviteModal', () => {
  it('renders email form when open', () => {
    renderModal();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send invite/i })).toBeInTheDocument();
  });

  it('shows workspace name in title', () => {
    renderModal();
    expect(screen.getByText(/invite to acme team/i)).toBeInTheDocument();
  });

  it('submitting calls sendInvite with workspaceId and trimmed email', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.type(screen.getByLabelText(/email address/i), '  alice@example.com  ');
    await user.click(screen.getByRole('button', { name: /send invite/i }));

    expect(mockMutate).toHaveBeenCalledWith({
      workspaceId: 'ws-shared',
      data: { email: 'alice@example.com' },
    });
  });

  it('shows success state after invitation sent', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.type(screen.getByLabelText(/email address/i), 'bob@example.com');
    await user.click(screen.getByRole('button', { name: /send invite/i }));
    capturedOnSuccess!();

    await waitFor(() =>
      expect(screen.getByText(/invitation sent to/i)).toBeInTheDocument()
    );
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
  });

  it('"Invite another" in success state resets form to email input', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.type(screen.getByLabelText(/email address/i), 'carol@example.com');
    await user.click(screen.getByRole('button', { name: /send invite/i }));
    capturedOnSuccess!();
    await waitFor(() => screen.getByText(/invitation sent to/i));

    await user.click(screen.getByRole('button', { name: /invite another/i }));

    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect((screen.getByLabelText(/email address/i) as HTMLInputElement).value).toBe('');
  });

  it('shows error message on failure', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.type(screen.getByLabelText(/email address/i), 'dave@example.com');
    await user.click(screen.getByRole('button', { name: /send invite/i }));
    capturedOnError!();

    await waitFor(() =>
      expect(screen.getByText(/failed to send invitation/i)).toBeInTheDocument()
    );
  });

  it('Send invite button is disabled when email is empty', () => {
    renderModal();
    expect(screen.getByRole('button', { name: /send invite/i })).toBeDisabled();
  });

  it('Cancel calls onOpenChange(false)', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderModal();

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
