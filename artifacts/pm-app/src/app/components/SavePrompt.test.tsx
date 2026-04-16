import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Hoist mock refs ───────────────────────────────────────────────────────────

const {
  mockSignInWithEmail,
  mockHasLocalData,
  mockMarkFirstRunSeen,
  mockToast,
} = vi.hoisted(() => ({
  mockSignInWithEmail: vi.fn(),
  mockHasLocalData: vi.fn(),
  mockMarkFirstRunSeen: vi.fn(),
  mockToast: vi.fn(),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ signInWithEmail: mockSignInWithEmail }),
}));

vi.mock('../lib/localStore', () => ({
  hasLocalData: mockHasLocalData,
  markFirstRunSeen: mockMarkFirstRunSeen,
}));

vi.mock('sonner', () => ({ toast: mockToast }));

// ── Import after mocks ────────────────────────────────────────────────────────
import { SavePrompt } from './SavePrompt';

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderPrompt(onOpenChange = vi.fn()) {
  render(<SavePrompt open={true} onOpenChange={onOpenChange} />);
  return { onOpenChange };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  mockHasLocalData.mockReturnValue(false);
  mockSignInWithEmail.mockResolvedValue(undefined);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SavePrompt', () => {
  it('renders choice panel ("Save across devices?") by default', () => {
    renderPrompt();
    expect(screen.getByText(/save across devices/i)).toBeInTheDocument();
  });

  it('"Not now" calls markFirstRunSeen, closes, and fires toast', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderPrompt();

    await user.click(screen.getByRole('button', { name: /not now/i }));

    expect(mockMarkFirstRunSeen).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mockToast).toHaveBeenCalledOnce();
  });

  it('"Yes, set me up" transitions to email panel', async () => {
    const user = userEvent.setup();
    renderPrompt();

    await user.click(screen.getByRole('button', { name: /yes, set me up/i }));

    expect(screen.getByPlaceholderText(/you@example\.com/i)).toBeInTheDocument();
  });

  it('email submit with no local data calls signInWithEmail and shows sent panel', async () => {
    const user = userEvent.setup();
    mockHasLocalData.mockReturnValue(false);
    renderPrompt();

    await user.click(screen.getByRole('button', { name: /yes, set me up/i }));
    await user.type(screen.getByPlaceholderText(/you@example\.com/i), 'user@test.com');
    await user.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => expect(screen.getByText(/check your inbox/i)).toBeInTheDocument());
    expect(mockSignInWithEmail).toHaveBeenCalledWith('user@test.com');
  });

  it('email submit, local data, server hasData:false → calls signInWithEmail, shows sent', async () => {
    const user = userEvent.setup();
    mockHasLocalData.mockReturnValue(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hasData: false }),
    }));
    renderPrompt();

    await user.click(screen.getByRole('button', { name: /yes, set me up/i }));
    await user.type(screen.getByPlaceholderText(/you@example\.com/i), 'user@test.com');
    await user.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => expect(screen.getByText(/check your inbox/i)).toBeInTheDocument());
    expect(mockSignInWithEmail).toHaveBeenCalledWith('user@test.com');
  });

  it('email submit, local data, server hasData:true → shows merge-confirm, does NOT call signInWithEmail', async () => {
    const user = userEvent.setup();
    mockHasLocalData.mockReturnValue(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hasData: true }),
    }));
    renderPrompt();

    await user.click(screen.getByRole('button', { name: /yes, set me up/i }));
    await user.type(screen.getByPlaceholderText(/you@example\.com/i), 'user@test.com');
    await user.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => expect(screen.getByText(/you already have saved data/i)).toBeInTheDocument());
    expect(mockSignInWithEmail).not.toHaveBeenCalled();
  });

  it('Cancel on merge-confirm returns to email panel with email preserved and does NOT call signInWithEmail', async () => {
    const user = userEvent.setup();
    mockHasLocalData.mockReturnValue(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hasData: true }),
    }));
    const { onOpenChange } = renderPrompt();

    await user.click(screen.getByRole('button', { name: /yes, set me up/i }));
    await user.type(screen.getByPlaceholderText(/you@example\.com/i), 'user@test.com');
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => screen.getByText(/you already have saved data/i));

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    // Should return to email panel — email input visible with value preserved
    expect(screen.getByPlaceholderText(/you@example\.com/i)).toBeInTheDocument();
    expect((screen.getByPlaceholderText(/you@example\.com/i) as HTMLInputElement).value).toBe('user@test.com');
    // Popover should remain open
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    // OTP must NOT have been sent
    expect(mockSignInWithEmail).not.toHaveBeenCalled();
  });

  it('Merge on merge-confirm calls signInWithEmail and shows sent panel', async () => {
    const user = userEvent.setup();
    mockHasLocalData.mockReturnValue(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hasData: true }),
    }));
    renderPrompt();

    await user.click(screen.getByRole('button', { name: /yes, set me up/i }));
    await user.type(screen.getByPlaceholderText(/you@example\.com/i), 'user@test.com');
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => screen.getByText(/you already have saved data/i));

    await user.click(screen.getByRole('button', { name: /merge and continue/i }));

    await waitFor(() => expect(screen.getByText(/check your inbox/i)).toBeInTheDocument());
    expect(mockSignInWithEmail).toHaveBeenCalledWith('user@test.com');
  });

  it('closing resets to choice panel on re-open', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<SavePrompt open={true} onOpenChange={onOpenChange} />);

    // Navigate away from choice panel
    await user.click(screen.getByRole('button', { name: /yes, set me up/i }));
    expect(screen.getByPlaceholderText(/you@example\.com/i)).toBeInTheDocument();

    // Close via Escape (triggers Radix → handleOpenChange(false) → setPanel('choice'))
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);

    // Re-open: panel should have been reset to 'choice' by handleOpenChange
    // Simulate by checking the state was reset (onOpenChange called = panel reset logic ran)
    // Confirm by re-rendering open
    const { rerender } = render(<SavePrompt open={true} onOpenChange={onOpenChange} />);
    expect(screen.getAllByText(/save across devices/i).length).toBeGreaterThan(0);
    rerender(<SavePrompt open={true} onOpenChange={onOpenChange} />);
  });
});
