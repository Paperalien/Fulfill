import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Hoist mock refs ───────────────────────────────────────────────────────────

const {
  mockSignInWithEmail,
  mockVerifyOtp,
  mockHasLocalData,
  mockMarkFirstRunSeen,
  mockWriteLastEmail,
  mockClearLastEmail,
  mockToast,
} = vi.hoisted(() => ({
  mockSignInWithEmail: vi.fn(),
  mockVerifyOtp: vi.fn(),
  mockHasLocalData: vi.fn(),
  mockMarkFirstRunSeen: vi.fn(),
  mockWriteLastEmail: vi.fn(),
  mockClearLastEmail: vi.fn(),
  mockToast: vi.fn(),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ signInWithEmail: mockSignInWithEmail, verifyOtp: mockVerifyOtp }),
}));

vi.mock('../lib/localStore', () => ({
  hasLocalData: mockHasLocalData,
  markFirstRunSeen: mockMarkFirstRunSeen,
  writeLastEmail: mockWriteLastEmail,
  clearLastEmail: mockClearLastEmail,
}));

vi.mock('sonner', () => ({ toast: mockToast }));

// ── Import after mocks ────────────────────────────────────────────────────────
import { SavePrompt } from './SavePrompt';

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderPrompt(onOpenChange = vi.fn()) {
  render(<SavePrompt open={true} onOpenChange={onOpenChange} />);
  return { onOpenChange };
}

// Drive a fresh prompt all the way to the code panel (no local data path).
async function reachCodePanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /yes, set me up/i }));
  await user.type(screen.getByPlaceholderText(/you@example\.com/i), 'user@test.com');
  await user.click(screen.getByRole('button', { name: /continue/i }));
  await waitFor(() => expect(screen.getByText(/check your email/i)).toBeInTheDocument());
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  mockHasLocalData.mockReturnValue(false);
  mockSignInWithEmail.mockResolvedValue(undefined);
  mockVerifyOtp.mockResolvedValue(undefined);
  // Default: the entered email has no server account. submitEmail now always
  // calls check-email, so stub it here; tests exercising the existing-account
  // paths override this with their own fetch stub returning hasData: true.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ hasData: false }),
  }));
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

  it('email submit with no local data sends a code and shows the code panel', async () => {
    const user = userEvent.setup();
    mockHasLocalData.mockReturnValue(false);
    renderPrompt();

    await reachCodePanel(user);

    expect(mockSignInWithEmail).toHaveBeenCalledWith('user@test.com');
    // Email is remembered once a code is sent.
    expect(mockWriteLastEmail).toHaveBeenCalledWith('user@test.com');
    expect(screen.getByPlaceholderText(/123456/)).toBeInTheDocument();
  });

  it('email submit, local data, server hasData:false → sends code, shows code panel', async () => {
    const user = userEvent.setup();
    mockHasLocalData.mockReturnValue(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hasData: false }),
    }));
    renderPrompt();

    await reachCodePanel(user);

    expect(mockSignInWithEmail).toHaveBeenCalledWith('user@test.com');
  });

  it('email submit, local data, server hasData:true → shows merge-confirm, does NOT send code', async () => {
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

  it('Cancel on merge-confirm returns to email panel with email preserved and does NOT send code', async () => {
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

    expect(screen.getByPlaceholderText(/you@example\.com/i)).toBeInTheDocument();
    expect((screen.getByPlaceholderText(/you@example\.com/i) as HTMLInputElement).value).toBe('user@test.com');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(mockSignInWithEmail).not.toHaveBeenCalled();
  });

  it('Merge on merge-confirm sends a code and shows the code panel', async () => {
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

    await waitFor(() => expect(screen.getByText(/check your email/i)).toBeInTheDocument());
    expect(mockSignInWithEmail).toHaveBeenCalledWith('user@test.com');
  });

  // ── Existing account, no local data (returning user on a new device) ───────

  it('email submit, no local data, server hasData:true → shows account-exists, does NOT send code', async () => {
    const user = userEvent.setup();
    mockHasLocalData.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hasData: true }),
    }));
    renderPrompt();

    await user.click(screen.getByRole('button', { name: /yes, set me up/i }));
    await user.type(screen.getByPlaceholderText(/you@example\.com/i), 'returning@test.com');
    await user.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => expect(screen.getByText(/welcome back/i)).toBeInTheDocument());
    expect(screen.getByText(/already has an account/i)).toBeInTheDocument();
    expect(mockSignInWithEmail).not.toHaveBeenCalled();
  });

  it('account-exists: "Email me a code" sends the code and shows the code panel', async () => {
    const user = userEvent.setup();
    mockHasLocalData.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hasData: true }),
    }));
    renderPrompt();

    await user.click(screen.getByRole('button', { name: /yes, set me up/i }));
    await user.type(screen.getByPlaceholderText(/you@example\.com/i), 'returning@test.com');
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => screen.getByText(/already has an account/i));

    await user.click(screen.getByRole('button', { name: /email me a code/i }));

    await waitFor(() => expect(screen.getByText(/check your email/i)).toBeInTheDocument());
    expect(mockSignInWithEmail).toHaveBeenCalledWith('returning@test.com');
  });

  it('account-exists: "Use a different email" returns to the email panel', async () => {
    const user = userEvent.setup();
    mockHasLocalData.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hasData: true }),
    }));
    renderPrompt();

    await user.click(screen.getByRole('button', { name: /yes, set me up/i }));
    await user.type(screen.getByPlaceholderText(/you@example\.com/i), 'returning@test.com');
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => screen.getByText(/already has an account/i));

    await user.click(screen.getByRole('button', { name: /use a different email/i }));

    expect(screen.getByPlaceholderText(/you@example\.com/i)).toBeInTheDocument();
    expect(mockSignInWithEmail).not.toHaveBeenCalled();
  });

  it('Welcome back panel: existing account with no local data sends the code directly (no second acknowledgment)', async () => {
    const user = userEvent.setup();
    mockHasLocalData.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hasData: true }),
    }));
    render(<SavePrompt open={true} onOpenChange={vi.fn()} rememberedEmail="returning@test.com" />);

    await user.click(screen.getByRole('button', { name: /email me a code/i }));

    await waitFor(() => expect(screen.getByText(/check your email/i)).toBeInTheDocument());
    expect(mockSignInWithEmail).toHaveBeenCalledWith('returning@test.com');
  });

  // ── Code panel (OTP verification) ──────────────────────────────────────────

  it('code panel: a valid code calls verifyOtp and closes the popover', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderPrompt();

    await reachCodePanel(user);
    await user.type(screen.getByPlaceholderText(/123456/), '123456');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => expect(mockVerifyOtp).toHaveBeenCalledWith('user@test.com', '123456'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('code panel: an invalid code shows an inline error and stays on the code panel', async () => {
    const user = userEvent.setup();
    mockVerifyOtp.mockRejectedValueOnce(new Error('invalid'));
    renderPrompt();

    await reachCodePanel(user);
    await user.type(screen.getByPlaceholderText(/123456/), '000000');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => expect(screen.getByText(/didn.t work/i)).toBeInTheDocument());
    expect(screen.getByPlaceholderText(/123456/)).toBeInTheDocument();
  });

  it('code panel: input strips non-digits and caps at 6 characters', async () => {
    const user = userEvent.setup();
    renderPrompt();

    await reachCodePanel(user);
    const input = screen.getByPlaceholderText(/123456/) as HTMLInputElement;
    await user.type(input, 'a1b2c3d4e5f6g7');

    expect(input.value).toBe('123456');
  });

  // ── Returning-user "Welcome back" framing ──────────────────────────────────

  it('opens on the Welcome back panel when a remembered email is provided', () => {
    render(<SavePrompt open={true} onOpenChange={vi.fn()} rememberedEmail="returning@test.com" />);
    expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
    expect(screen.getByText('returning@test.com')).toBeInTheDocument();
  });

  it('"Email me a code" on the Welcome back panel sends a code to the remembered email', async () => {
    const user = userEvent.setup();
    mockHasLocalData.mockReturnValue(false);
    render(<SavePrompt open={true} onOpenChange={vi.fn()} rememberedEmail="returning@test.com" />);

    await user.click(screen.getByRole('button', { name: /email me a code/i }));

    await waitFor(() => expect(screen.getByText(/check your email/i)).toBeInTheDocument());
    expect(mockSignInWithEmail).toHaveBeenCalledWith('returning@test.com');
  });

  it('"Use a different email" clears the remembered email and shows the email panel', async () => {
    const user = userEvent.setup();
    render(<SavePrompt open={true} onOpenChange={vi.fn()} rememberedEmail="returning@test.com" />);

    await user.click(screen.getByRole('button', { name: /use a different email/i }));

    expect(mockClearLastEmail).toHaveBeenCalledOnce();
    expect(screen.getByPlaceholderText(/you@example\.com/i)).toBeInTheDocument();
  });

  // ── Send failure + resend ──────────────────────────────────────────────────

  it('send failure: shows an error and stays on the email panel (no code panel)', async () => {
    const user = userEvent.setup();
    mockHasLocalData.mockReturnValue(false);
    mockSignInWithEmail.mockRejectedValueOnce(new Error('rate limited'));
    renderPrompt();

    await user.click(screen.getByRole('button', { name: /yes, set me up/i }));
    await user.type(screen.getByPlaceholderText(/you@example\.com/i), 'user@test.com');
    await user.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() =>
      expect(screen.getByText(/couldn.t send the code/i)).toBeInTheDocument()
    );
    expect(screen.queryByText(/check your email/i)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/you@example\.com/i)).toBeInTheDocument();
  });

  it('code panel: Resend starts disabled with a countdown', async () => {
    const user = userEvent.setup();
    mockHasLocalData.mockReturnValue(false);
    renderPrompt();

    await reachCodePanel(user);
    expect(screen.getByRole('button', { name: /resend in \d+s/i })).toBeDisabled();
  });

  it('code panel: once cooldown elapses, Resend re-sends the code', async () => {
    const user = userEvent.setup();
    mockHasLocalData.mockReturnValue(false);
    render(<SavePrompt open={true} onOpenChange={vi.fn()} resendCooldownSeconds={0} />);

    await user.click(screen.getByRole('button', { name: /yes, set me up/i }));
    await user.type(screen.getByPlaceholderText(/you@example\.com/i), 'user@test.com');
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => expect(screen.getByText(/check your email/i)).toBeInTheDocument());

    const resend = screen.getByRole('button', { name: /^resend code$/i });
    expect(resend).toBeEnabled();

    mockSignInWithEmail.mockClear();
    await user.click(resend);

    await waitFor(() => expect(mockSignInWithEmail).toHaveBeenCalledWith('user@test.com'));
    expect(mockToast).toHaveBeenCalledWith('Code resent');
  });

  it('dialog variant: renders the flow inside a centered modal and works', async () => {
    const user = userEvent.setup();
    mockHasLocalData.mockReturnValue(false);
    render(<SavePrompt open={true} onOpenChange={vi.fn()} variant="dialog" />);

    // Content is inside a dialog (modal), not an anchored popover.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/save across devices\?/i)).toBeInTheDocument();

    // The flow still advances to the code panel.
    await user.click(screen.getByRole('button', { name: /yes, set me up/i }));
    await user.type(screen.getByPlaceholderText(/you@example\.com/i), 'user@test.com');
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => expect(screen.getByText(/check your email/i)).toBeInTheDocument());
    expect(mockSignInWithEmail).toHaveBeenCalledWith('user@test.com');
  });
});
