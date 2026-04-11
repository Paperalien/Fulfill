import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ── Hoist mock refs (required because vi.mock is hoisted before imports) ──────

const {
  mockGetSession,
  mockUseAuth,
  mockHasLocalData,
  mockClearLocalData,
  mockReadColumns,
  mockReadSprints,
  mockReadTasks,
  mockInvalidateQueries,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockUseAuth: vi.fn(),
  mockHasLocalData: vi.fn(),
  mockClearLocalData: vi.fn(),
  mockReadColumns: vi.fn(),
  mockReadSprints: vi.fn(),
  mockReadTasks: vi.fn(),
  mockInvalidateQueries: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: mockGetSession } },
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: mockUseAuth,
}));

vi.mock('../lib/localStore', () => ({
  hasLocalData: mockHasLocalData,
  clearLocalData: mockClearLocalData,
  readColumns: mockReadColumns,
  readSprints: mockReadSprints,
  readTasks: mockReadTasks,
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

// ── Import after mocks ────────────────────────────────────────────────────────
import { useMigration } from './useMigration';

// ── Helpers ───────────────────────────────────────────────────────────────────

function authOk() {
  mockUseAuth.mockReturnValue({ isAuthenticated: true, workspaceId: 'ws1' });
  mockGetSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
}

function localDataPresent() {
  mockHasLocalData.mockReturnValue(true);
  mockReadColumns.mockReturnValue([]);
  mockReadSprints.mockReturnValue([]);
  mockReadTasks.mockReturnValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  mockHasLocalData.mockReturnValue(false);
  mockUseAuth.mockReturnValue({ isAuthenticated: false, workspaceId: null });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useMigration', () => {
  it('stays idle when not authenticated', () => {
    const { result } = renderHook(() => useMigration());
    expect(result.current.status).toBe('idle');
  });

  it('stays idle when hasLocalData is false', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, workspaceId: 'ws1' });
    mockHasLocalData.mockReturnValue(false);
    const { result } = renderHook(() => useMigration());
    expect(result.current.status).toBe('idle');
  });

  it('transitions idle → migrating → idle on successful fetch (200)', async () => {
    authOk();
    localDataPresent();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const { result } = renderHook(() => useMigration());

    await waitFor(() => expect(result.current.status).toBe('idle'));
    expect(mockClearLocalData).toHaveBeenCalledOnce();
    expect(mockInvalidateQueries).toHaveBeenCalledOnce();
  });

  it('dispatches fulfill:flush-edits before fetch', async () => {
    authOk();
    localDataPresent();
    const events: string[] = [];
    const handler = () => events.push('flush');
    window.addEventListener('fulfill:flush-edits', handler);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    renderHook(() => useMigration());

    await waitFor(() => expect(mockClearLocalData).toHaveBeenCalled());
    expect(events).toContain('flush');
    window.removeEventListener('fulfill:flush-edits', handler);
  });

  it('sets status to error on fetch rejection', async () => {
    authOk();
    localDataPresent();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));

    const { result } = renderHook(() => useMigration());

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(mockClearLocalData).not.toHaveBeenCalled();
  });

  it('sets status to error on non-200 response', async () => {
    authOk();
    localDataPresent();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const { result } = renderHook(() => useMigration());

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(mockClearLocalData).not.toHaveBeenCalled();
  });

  it('retry() re-runs migration after error', async () => {
    authOk();
    localDataPresent();
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('first fail'))
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMigration());
    await waitFor(() => expect(result.current.status).toBe('error'));

    act(() => { result.current.retry(); });
    await waitFor(() => expect(result.current.status).toBe('idle'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mockClearLocalData).toHaveBeenCalledOnce();
  });

  it('migration only runs once per mount even if dependencies change', async () => {
    authOk();
    localDataPresent();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(() => useMigration());
    await waitFor(() => expect(result.current.status).toBe('idle'));

    rerender();
    rerender();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
