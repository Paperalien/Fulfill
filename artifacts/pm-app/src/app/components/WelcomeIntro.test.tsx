import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Hoist mock refs ───────────────────────────────────────────────────────────

const {
  mockIsAuthenticated,
  mockHasSeenFirstRun,
  mockHasLocalData,
  mockReadLastEmail,
  mockMarkFirstRunSeen,
  mockRequestOpenSavePrompt,
} = vi.hoisted(() => ({
  mockIsAuthenticated: { value: false },
  mockHasSeenFirstRun: vi.fn(),
  mockHasLocalData: vi.fn(),
  mockReadLastEmail: vi.fn(),
  mockMarkFirstRunSeen: vi.fn(),
  mockRequestOpenSavePrompt: vi.fn(),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: mockIsAuthenticated.value }),
}));

vi.mock('../lib/localStore', () => ({
  hasSeenFirstRun: mockHasSeenFirstRun,
  hasLocalData: mockHasLocalData,
  readLastEmail: mockReadLastEmail,
  markFirstRunSeen: mockMarkFirstRunSeen,
}));

vi.mock('../contexts/SavePromptContext', () => ({
  useSavePromptOpener: () => ({
    openRequest: 0,
    requestOpenSavePrompt: mockRequestOpenSavePrompt,
  }),
}));

// ── Import after mocks ────────────────────────────────────────────────────────
import { WelcomeIntro } from './WelcomeIntro';

beforeEach(() => {
  vi.clearAllMocks();
  // Default: a brand-new visitor on an empty, non-private device.
  mockIsAuthenticated.value = false;
  mockHasSeenFirstRun.mockReturnValue(false);
  mockHasLocalData.mockReturnValue(false);
  mockReadLastEmail.mockReturnValue(null);
});

describe('WelcomeIntro', () => {
  it('shows the intro, persistence caveat and the three feature points to a new visitor', () => {
    render(<WelcomeIntro detectPrivate={async () => false} />);
    expect(screen.getByText(/welcome to fulfill/i)).toBeInTheDocument();
    expect(screen.getByText(/clear your\s+cookies or site data/i)).toBeInTheDocument();
    expect(screen.getByText(/keep\s+your tasks and open them on any device/i)).toBeInTheDocument();
    expect(screen.getByText(/let you scale effortlessly/i)).toBeInTheDocument();
    expect(screen.getByText(/collaboration a breeze/i)).toBeInTheDocument();
  });

  it('does not render when the intro was already seen', () => {
    mockHasSeenFirstRun.mockReturnValue(true);
    const { container } = render(<WelcomeIntro detectPrivate={async () => false} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/welcome to fulfill/i)).not.toBeInTheDocument();
  });

  it('does not render when there is local data to protect', () => {
    mockHasLocalData.mockReturnValue(true);
    render(<WelcomeIntro detectPrivate={async () => false} />);
    expect(screen.queryByText(/welcome to fulfill/i)).not.toBeInTheDocument();
  });

  it('does not render for a returning user (remembered email)', () => {
    mockReadLastEmail.mockReturnValue('user@test.com');
    render(<WelcomeIntro detectPrivate={async () => false} />);
    expect(screen.queryByText(/welcome to fulfill/i)).not.toBeInTheDocument();
  });

  it('does not render when authenticated', () => {
    mockIsAuthenticated.value = true;
    render(<WelcomeIntro detectPrivate={async () => false} />);
    expect(screen.queryByText(/welcome to fulfill/i)).not.toBeInTheDocument();
  });

  it('shows the private-window warning only when private mode is detected', async () => {
    const { unmount } = render(<WelcomeIntro detectPrivate={async () => false} />);
    await waitFor(() =>
      expect(screen.queryByText(/private\/incognito window/i)).not.toBeInTheDocument(),
    );
    unmount();

    render(<WelcomeIntro detectPrivate={async () => true} />);
    expect(await screen.findByText(/private\/incognito window/i)).toBeInTheDocument();
  });

  it('"Jump in" marks first-run seen and closes', async () => {
    const user = userEvent.setup();
    render(<WelcomeIntro detectPrivate={async () => false} />);
    await user.click(screen.getByRole('button', { name: /jump in/i }));
    expect(mockMarkFirstRunSeen).toHaveBeenCalledTimes(1);
    expect(mockRequestOpenSavePrompt).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByText(/welcome to fulfill/i)).not.toBeInTheDocument(),
    );
  });

  it('"Save your data" marks first-run seen, closes, then asks to open the save prompt', async () => {
    const user = userEvent.setup();
    render(<WelcomeIntro detectPrivate={async () => false} />);
    await user.click(screen.getByRole('button', { name: /save your data/i }));
    // Closes + marks seen synchronously; the save prompt opens only after the
    // dialog's close animation, so the two panels never visually stack.
    expect(mockMarkFirstRunSeen).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByText(/welcome to fulfill/i)).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(mockRequestOpenSavePrompt).toHaveBeenCalledTimes(1));
  });
});
