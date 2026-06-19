import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockIsAuthenticated, mockReadLastEmail, mockRequestOpen } = vi.hoisted(() => ({
  mockIsAuthenticated: { value: false },
  mockReadLastEmail: vi.fn(),
  mockRequestOpen: vi.fn(),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: mockIsAuthenticated.value }),
}));

vi.mock('../lib/localStore', () => ({
  readLastEmail: mockReadLastEmail,
}));

vi.mock('../contexts/SavePromptContext', () => ({
  useSavePromptOpener: () => ({ openRequest: 0, requestOpenSavePrompt: mockRequestOpen }),
}));

import { SaveDataTrigger } from './SaveDataTrigger';

beforeEach(() => {
  vi.clearAllMocks();
  mockIsAuthenticated.value = false;
  mockReadLastEmail.mockReturnValue(null);
});

describe('SaveDataTrigger', () => {
  it('renders nothing when authenticated', () => {
    mockIsAuthenticated.value = true;
    const { container } = render(<SaveDataTrigger />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows "Save your data" for a new visitor and requests open on click', async () => {
    const user = userEvent.setup();
    render(<SaveDataTrigger />);
    const btn = screen.getByRole('button', { name: /save your data/i });
    await user.click(btn);
    expect(mockRequestOpen).toHaveBeenCalledTimes(1);
  });

  it('shows "Sign in" when an email is remembered', () => {
    mockReadLastEmail.mockReturnValue('user@test.com');
    render(<SaveDataTrigger />);
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });
});
