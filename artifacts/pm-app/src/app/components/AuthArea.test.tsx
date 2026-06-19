import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// ── Hoist mock refs ───────────────────────────────────────────────────────────

const { mockIsAuthenticated, mockReadLastEmail, mockOpener, mockIsMobile } =
  vi.hoisted(() => ({
    mockIsAuthenticated: { value: false },
    mockReadLastEmail: vi.fn(),
    mockOpener: { openRequest: 0 },
    mockIsMobile: { value: false },
  }));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: mockIsAuthenticated.value }),
}));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => mockIsMobile.value,
}));

vi.mock('../lib/localStore', () => ({
  readLastEmail: mockReadLastEmail,
}));

vi.mock('../contexts/SavePromptContext', () => ({
  useSavePromptOpener: () => ({
    openRequest: mockOpener.openRequest,
    requestOpenSavePrompt: vi.fn(),
  }),
}));

// Stub SavePrompt so we observe just the props AuthArea drives.
vi.mock('./SavePrompt', () => ({
  SavePrompt: ({ open, variant }: { open: boolean; variant: string }) => (
    <div data-testid="save-prompt" data-variant={variant}>
      {open ? 'OPEN' : 'CLOSED'}
    </div>
  ),
}));

// ── Import after mocks ────────────────────────────────────────────────────────
import { AuthArea } from './AuthArea';

beforeEach(() => {
  vi.clearAllMocks();
  mockIsAuthenticated.value = false;
  mockReadLastEmail.mockReturnValue(null);
  mockOpener.openRequest = 0;
  mockIsMobile.value = false; // desktop by default
});

describe('AuthArea', () => {
  it('renders nothing for the inactive (non-matching) placement', () => {
    // Desktop viewport, but this is the mobile-placed instance → inactive.
    const { container } = render(<AuthArea placement="mobile" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('uses the popover variant on desktop and the dialog variant on mobile', () => {
    const { unmount } = render(<AuthArea placement="desktop" />);
    expect(screen.getByTestId('save-prompt')).toHaveAttribute('data-variant', 'popover');
    unmount();

    mockIsMobile.value = true;
    render(<AuthArea placement="mobile" />);
    expect(screen.getByTestId('save-prompt')).toHaveAttribute('data-variant', 'dialog');
  });

  it('does not auto-open for a brand-new visitor (no remembered email)', () => {
    render(<AuthArea placement="desktop" />);
    expect(screen.getByTestId('save-prompt')).toHaveTextContent('CLOSED');
  });

  it('auto-opens the "Welcome back" prompt when a remembered email exists', () => {
    mockReadLastEmail.mockReturnValue('user@test.com');
    render(<AuthArea placement="desktop" />);
    expect(screen.getByTestId('save-prompt')).toHaveTextContent('OPEN');
  });

  it('opens when another component requests it via the save-prompt opener', () => {
    const { rerender } = render(<AuthArea placement="desktop" />);
    expect(screen.getByTestId('save-prompt')).toHaveTextContent('CLOSED');
    mockOpener.openRequest = 1; // simulate requestOpenSavePrompt()
    rerender(<AuthArea placement="desktop" />);
    return waitFor(() =>
      expect(screen.getByTestId('save-prompt')).toHaveTextContent('OPEN'),
    );
  });

  it('renders nothing when authenticated', () => {
    mockIsAuthenticated.value = true;
    const { container } = render(<AuthArea placement="desktop" />);
    expect(container).toBeEmptyDOMElement();
  });
});
