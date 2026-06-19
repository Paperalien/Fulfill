import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// ── Hoisted mock refs ─────────────────────────────────────────────────────────

const { mockUseAuth, mockUseLocalTaskStore } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockUseLocalTaskStore: vi.fn(),
}));

vi.mock('./AuthContext', () => ({ useAuth: mockUseAuth }));
vi.mock('../hooks/useLocalTaskStore', () => ({ useLocalTaskStore: mockUseLocalTaskStore }));

// Stub the generated API client: the only render-time behaviour we care about is
// what the task query returns. Everything else is a no-op hook so useApiTaskStore
// can render without a live backend. The factory is hoisted, so everything it
// references must be defined inside it.
vi.mock('@workspace/api-client-react', () => {
  const SERVER_TASK = {
    id: 'server-1',
    workspaceId: 'w1',
    title: 'Server task',
    notes: '',
    columnId: 'c1',
    sprintId: null,
    storyPoints: null,
    order: 0,
    dueDate: null,
    inProgressAt: null,
    archivedAt: null,
    deletedAt: null,
    parentId: null,
    predecessorIds: null,
    tags: null,
    reminder: null,
    reminderDismissedAt: null,
    recurrence: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const noopMutation = () => ({ mutate: () => {} });
  return {
    useGetTasks: (_wid: string, opts: { query: { enabled: boolean } }) => ({
      data: opts.query.enabled ? [SERVER_TASK] : [],
      isLoading: false,
    }),
    useGetSprints: () => ({ data: [], isLoading: false }),
    useGetColumns: () => ({ data: [], isLoading: false }),
    useCreateTask: noopMutation,
    useUpdateTask: noopMutation,
    useDeleteTask: noopMutation,
    useDeleteTaskPermanent: noopMutation,
    useBulkArchiveTasks: noopMutation,
    useCreateColumn: noopMutation,
    useUpdateColumn: noopMutation,
    useDeleteColumn: noopMutation,
    useReorderColumns: noopMutation,
    useCreateSprint: noopMutation,
    useUpdateSprint: noopMutation,
    useDeleteSprint: noopMutation,
    useUpsertSprintSnapshot: noopMutation,
    getGetTasksQueryKey: (wid: string) => ['tasks', wid],
    getGetSprintsQueryKey: (wid: string) => ['sprints', wid],
    getGetColumnsQueryKey: (wid: string) => ['columns', wid],
  };
});

import { TaskProvider, useTaskContext } from './TaskContext';

// ── Harness ───────────────────────────────────────────────────────────────────

function Consumer() {
  const { tasks, loading } = useTaskContext();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="task-ids">{tasks.map((t) => t.id).join(',')}</span>
    </div>
  );
}

function renderProvider() {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <TaskProvider>
        <Consumer />
      </TaskProvider>
    </QueryClientProvider>,
  );
}

const LOCAL_STORE = {
  tasks: [{ id: 'local-1' }],
  sprints: [],
  columns: [],
  loading: false,
} as unknown as ReturnType<typeof mockUseLocalTaskStore>;

beforeEach(() => {
  vi.clearAllMocks();
  mockUseLocalTaskStore.mockReturnValue(LOCAL_STORE);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TaskProvider store selection', () => {
  it('anonymous (no session): exposes the local store', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, activeWorkspaceId: null, session: null });
    renderProvider();
    expect(screen.getByTestId('task-ids').textContent).toBe('local-1');
    expect(screen.getByTestId('loading').textContent).toBe('false');
  });

  it('post sign-in, workspace still resolving: shows loading, NOT the empty/local board', () => {
    // session present, activeWorkspaceId not yet resolved → isAuthenticated false.
    // Regression guard for issue 2: without the resolvingWorkspace guard this would
    // fall through to the local store and the user's server tasks would appear gone.
    mockUseAuth.mockReturnValue({ isAuthenticated: false, activeWorkspaceId: null, session: { user: {} } });
    renderProvider();
    expect(screen.getByTestId('loading').textContent).toBe('true');
    expect(screen.getByTestId('task-ids').textContent).toBe('');
  });

  it('authenticated with a resolved workspace: exposes the server tasks', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, activeWorkspaceId: 'w1', session: { user: {} } });
    renderProvider();
    expect(screen.getByTestId('task-ids').textContent).toBe('server-1');
    expect(screen.getByTestId('loading').textContent).toBe('false');
  });
});
