import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

// ── Hoist mock refs ───────────────────────────────────────────────────────────

const {
  mockGetSession,
  mockOnAuthStateChange,
  mockVerifyOtp,
  mockSignInWithOtp,
  mockEnsurePersonal,
  mockListWorkspaces,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockOnAuthStateChange: vi.fn(),
  mockVerifyOtp: vi.fn(),
  mockSignInWithOtp: vi.fn(),
  mockEnsurePersonal: vi.fn(),
  mockListWorkspaces: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
      verifyOtp: mockVerifyOtp,
      signInWithOtp: mockSignInWithOtp,
      signOut: vi.fn(),
    },
  },
}));

vi.mock('@workspace/api-client-react', () => ({
  setAuthTokenGetter: vi.fn(),
  ensurePersonalWorkspace: mockEnsurePersonal,
  listWorkspaces: mockListWorkspaces,
  createWorkspace: vi.fn(),
}));

import { AuthProvider, useAuth } from './AuthContext';

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

beforeEach(() => {
  vi.clearAllMocks();
  // No initial session → loading resolves with an unauthenticated state.
  mockGetSession.mockResolvedValue({ data: { session: null } });
  mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  mockVerifyOtp.mockResolvedValue({ error: null });
});

describe('AuthContext.verifyOtp', () => {
  it('calls supabase.auth.verifyOtp with the email-OTP shape', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current).toBeTruthy());

    await act(async () => {
      await result.current.verifyOtp('user@test.com', '123456');
    });

    expect(mockVerifyOtp).toHaveBeenCalledWith({
      email: 'user@test.com',
      token: '123456',
      type: 'email',
    });
  });

  it('throws when Supabase returns an error', async () => {
    mockVerifyOtp.mockResolvedValue({ error: new Error('Token has expired or is invalid') });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current).toBeTruthy());

    await expect(result.current.verifyOtp('user@test.com', '000000')).rejects.toThrow(/expired or is invalid/);
  });
});
