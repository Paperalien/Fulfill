import { createContext, useContext, useEffect, useRef, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetTasks,
  useGetSprints,
  useGetColumns,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  useBulkArchiveTasks,
  useCreateColumn,
  useUpdateColumn,
  useDeleteColumn,
  useReorderColumns,
  useCreateSprint,
  useUpdateSprint,
  useDeleteSprint,
  useUpsertSprintSnapshot,
  getGetTasksQueryKey,
  getGetSprintsQueryKey,
  getGetColumnsQueryKey,
} from '@workspace/api-client-react';
import type {
  Task as ApiTask,
  Column as ApiColumn,
  Sprint as ApiSprint,
} from '@workspace/api-client-react';
import { Task, Sprint, KanbanColumn, SemanticStatus } from '../types/task';
import { getSemanticStatus } from '../utils/taskUtils';
import { useAuth } from './AuthContext';

// ── Type adapters ────────────────────────────────────────────────────────────
// The API types use `null` for absent optional values; the local types use
// `undefined`. These adapters normalise API responses to the local shape so
// that all consumers remain unchanged.

function apiTaskToLocal(t: ApiTask): Task {
  return {
    id: t.id,
    title: t.title,
    notes: t.notes,
    columnId: t.columnId,
    order: t.order,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    sprintId: t.sprintId ?? undefined,
    storyPoints: t.storyPoints ?? undefined,
    dueDate: t.dueDate ?? undefined,
    inProgressAt: t.inProgressAt ?? undefined,
    archivedAt: t.archivedAt ?? undefined,
    deletedAt: t.deletedAt ?? undefined,
    parentId: t.parentId ?? undefined,
    predecessorIds: t.predecessorIds ?? undefined,
    tags: t.tags ?? undefined,
    reminder: t.reminder ?? undefined,
    reminderDismissedAt: t.reminderDismissedAt ?? undefined,
    recurrence: (t.recurrence as Task['recurrence']) ?? undefined,
  };
}

function apiColumnToLocal(c: ApiColumn): KanbanColumn {
  return {
    id: c.id,
    name: c.name,
    order: c.order,
    semanticStatus: c.semanticStatus as SemanticStatus,
    color: c.color ?? undefined,
  };
}

function apiSprintToLocal(s: ApiSprint): Sprint {
  return {
    id: s.id,
    name: s.name,
    startDate: s.startDate,
    endDate: s.endDate,
    isActive: s.isActive,
  };
}

// ── Context interface ────────────────────────────────────────────────────────

interface TaskContextValue {
  tasks: Task[];
  sprints: Sprint[];
  columns: KanbanColumn[];
  loading: boolean;
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'order'>) => Task;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  undeleteTask: (id: string) => void;
  archiveTask: (id: string) => void;
  unarchiveTask: (id: string) => void;
  archiveDoneTasks: (taskIds?: string[]) => void;
  addSprint: (sprint: Omit<Sprint, 'id'>) => Sprint;
  updateSprint: (id: string, updates: Partial<Sprint>) => void;
  deleteSprint: (id: string) => void;
  addColumn: (col: Omit<KanbanColumn, 'id' | 'order'>) => KanbanColumn;
  updateColumn: (id: string, updates: Partial<KanbanColumn>) => void;
  deleteColumn: (id: string, reassignToId: string) => void;
  reorderColumns: (orderedIds: string[]) => void;
  getSemanticStatusForTask: (task: Task) => SemanticStatus;
  doneColumnIds: () => string[];
}

const TaskContext = createContext<TaskContextValue | null>(null);

// ── Provider ─────────────────────────────────────────────────────────────────

export function TaskProvider({ children }: { children: ReactNode }) {
  const { workspaceId } = useAuth();
  const queryClient = useQueryClient();

  const enabled = !!workspaceId;
  const wid = workspaceId ?? '';

  // ── Queries ────────────────────────────────────────────────────────────────

  const tasksQuery = useGetTasks(wid, { query: { enabled, queryKey: getGetTasksQueryKey(wid) } });
  const sprintsQuery = useGetSprints(wid, { query: { enabled, queryKey: getGetSprintsQueryKey(wid) } });
  const columnsQuery = useGetColumns(wid, { query: { enabled, queryKey: getGetColumnsQueryKey(wid) } });

  const rawTasks = tasksQuery.data ?? [];
  const rawSprints = sprintsQuery.data ?? [];
  const rawColumns = columnsQuery.data ?? [];

  const tasks: Task[] = rawTasks.map(apiTaskToLocal);
  const sprints: Sprint[] = rawSprints.map(apiSprintToLocal);
  const columns: KanbanColumn[] = rawColumns.map(apiColumnToLocal);

  const loading =
    tasksQuery.isLoading || sprintsQuery.isLoading || columnsQuery.isLoading;

  // ── Helpers ────────────────────────────────────────────────────────────────

  function doneColumnIds(): string[] {
    return columns.filter((c) => c.semanticStatus === 'done').map((c) => c.id);
  }

  function getSemanticStatusForTask(task: Task): SemanticStatus {
    return getSemanticStatus(task, columns);
  }

  // ── Mutation hooks ─────────────────────────────────────────────────────────

  const createTaskMutation = useCreateTask();
  const updateTaskMutation = useUpdateTask();
  const deleteTaskMutation = useDeleteTask();
  const bulkArchiveMutation = useBulkArchiveTasks();

  const createColumnMutation = useCreateColumn();
  const updateColumnMutation = useUpdateColumn();
  const deleteColumnMutation = useDeleteColumn();
  const reorderColumnsMutation = useReorderColumns();

  const createSprintMutation = useCreateSprint();
  const updateSprintMutation = useUpdateSprint();
  const deleteSprintMutation = useDeleteSprint();

  const upsertSnapshotMutation = useUpsertSprintSnapshot();

  // ── Task operations ────────────────────────────────────────────────────────

  function addTask(partial: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'order'>): Task {
    const maxOrder = tasks.length > 0 ? Math.max(...tasks.map((t) => t.order)) : -1;
    const order = maxOrder + 1;

    // Build an optimistic local task so we can return it synchronously
    const now = new Date().toISOString();
    const optimisticId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimisticTask: Task = {
      ...partial,
      id: optimisticId,
      createdAt: now,
      updatedAt: now,
      order,
    };

    const tasksKey = getGetTasksQueryKey(wid);

    // Optimistic update
    queryClient.cancelQueries({ queryKey: tasksKey });
    const previousTasks = queryClient.getQueryData<ApiTask[]>(tasksKey);
    queryClient.setQueryData<ApiTask[]>(tasksKey, (old) => {
      const optimisticApi: ApiTask = {
        id: optimisticId,
        workspaceId: wid,
        title: partial.title,
        notes: partial.notes,
        columnId: partial.columnId,
        sprintId: partial.sprintId ?? null,
        storyPoints: partial.storyPoints ?? null,
        order,
        dueDate: partial.dueDate ?? null,
        inProgressAt: partial.inProgressAt ?? null,
        archivedAt: partial.archivedAt ?? null,
        deletedAt: partial.deletedAt ?? null,
        parentId: partial.parentId ?? null,
        predecessorIds: partial.predecessorIds ?? null,
        tags: partial.tags ?? null,
        reminder: partial.reminder ?? null,
        reminderDismissedAt: partial.reminderDismissedAt ?? null,
        recurrence: partial.recurrence ?? null,
        createdAt: now,
        updatedAt: now,
      };
      return [...(old ?? []), optimisticApi];
    });

    createTaskMutation.mutate(
      {
        workspaceId: wid,
        data: {
          title: partial.title,
          notes: partial.notes,
          columnId: partial.columnId,
          sprintId: partial.sprintId ?? null,
          storyPoints: partial.storyPoints ?? null,
          order,
          dueDate: partial.dueDate ?? null,
          parentId: partial.parentId ?? null,
          predecessorIds: partial.predecessorIds ?? null,
          tags: partial.tags ?? null,
          reminder: partial.reminder ?? null,
          recurrence: (partial.recurrence as ApiTask['recurrence']) ?? null,
        },
      },
      {
        onError: () => {
          queryClient.setQueryData(tasksKey, previousTasks);
        },
        onSettled: () => {
          queryClient.invalidateQueries({ queryKey: tasksKey });
        },
      },
    );

    return optimisticTask;
  }

  function updateTask(id: string, updates: Partial<Task>): void {
    if (!enabled) return;
    const tasksKey = getGetTasksQueryKey(wid);

    queryClient.cancelQueries({ queryKey: tasksKey });
    const previousTasks = queryClient.getQueryData<ApiTask[]>(tasksKey);

    // Compute inProgressAt change client-side for the optimistic update
    const currentTask = (previousTasks ?? []).find((t) => t.id === id);
    const now = new Date().toISOString();

    let inProgressAt = updates.inProgressAt !== undefined
      ? (updates.inProgressAt ?? null)
      : (currentTask?.inProgressAt ?? null);

    if (updates.columnId && updates.columnId !== currentTask?.columnId) {
      const newCol = columns.find((c) => c.id === updates.columnId);
      const oldCol = columns.find((c) => c.id === currentTask?.columnId);
      if (newCol?.semanticStatus === 'in-progress' && oldCol?.semanticStatus !== 'in-progress') {
        inProgressAt = now;
      } else if (newCol?.semanticStatus !== 'in-progress') {
        inProgressAt = null;
      }
    }

    queryClient.setQueryData<ApiTask[]>(tasksKey, (old) =>
      (old ?? []).map((t) =>
        t.id === id
          ? {
              ...t,
              ...Object.fromEntries(
                Object.entries(updates).map(([k, v]) => [k, v ?? null])
              ),
              inProgressAt,
              updatedAt: now,
            }
          : t
      )
    );

    // Build the PATCH payload — only send fields that are present in `updates`
    const patchData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      patchData[key] = value ?? null;
    }
    // Always send the computed inProgressAt when columnId is changing
    if (updates.columnId) {
      patchData.inProgressAt = inProgressAt;
    }

    updateTaskMutation.mutate(
      { workspaceId: wid, taskId: id, data: patchData as Parameters<typeof updateTaskMutation.mutate>[0]['data'] },
      {
        onSuccess: (response: { updated: ApiTask; spawned: ApiTask | null }) => {
          // Handle spawned recurrence task returned by the server
          if (response.spawned) {
            queryClient.setQueryData<ApiTask[]>(tasksKey, (old) => {
              if (!old) return old;
              // Avoid duplicates (server may already have included it on refetch)
              const exists = old.some((t) => t.id === response.spawned!.id);
              return exists ? old : [...old, response.spawned!];
            });
          }
        },
        onError: () => {
          queryClient.setQueryData(tasksKey, previousTasks);
        },
        onSettled: () => {
          queryClient.invalidateQueries({ queryKey: tasksKey });
        },
      },
    );
  }

  function deleteTask(id: string): void {
    if (!enabled) return;
    const tasksKey = getGetTasksQueryKey(wid);

    queryClient.cancelQueries({ queryKey: tasksKey });
    const previousTasks = queryClient.getQueryData<ApiTask[]>(tasksKey);
    const now = new Date().toISOString();

    queryClient.setQueryData<ApiTask[]>(tasksKey, (old) =>
      (old ?? []).map((t) =>
        t.id === id ? { ...t, deletedAt: now, updatedAt: now } : t
      )
    );

    deleteTaskMutation.mutate(
      { workspaceId: wid, taskId: id },
      {
        onError: () => {
          queryClient.setQueryData(tasksKey, previousTasks);
        },
        onSettled: () => {
          queryClient.invalidateQueries({ queryKey: tasksKey });
        },
      },
    );
  }

  function undeleteTask(id: string): void {
    updateTask(id, { deletedAt: undefined });
  }

  function archiveTask(id: string): void {
    updateTask(id, { archivedAt: new Date().toISOString() });
  }

  function unarchiveTask(id: string): void {
    updateTask(id, { archivedAt: undefined });
  }

  function archiveDoneTasks(taskIds?: string[]): void {
    if (!enabled) return;
    const tasksKey = getGetTasksQueryKey(wid);
    const doneIds = new Set(doneColumnIds());
    const now = new Date().toISOString();

    const currentTasks = queryClient.getQueryData<ApiTask[]>(tasksKey) ?? [];
    const toArchive = taskIds
      ? currentTasks.filter((t) => taskIds.includes(t.id))
      : currentTasks.filter(
          (t) => doneIds.has(t.columnId) && !t.archivedAt && !t.deletedAt
        );

    if (toArchive.length === 0) return;

    const previousTasks = currentTasks;
    const archiveSet = new Set(toArchive.map((t) => t.id));

    queryClient.setQueryData<ApiTask[]>(tasksKey, (old) =>
      (old ?? []).map((t) =>
        archiveSet.has(t.id) ? { ...t, archivedAt: now, updatedAt: now } : t
      )
    );

    bulkArchiveMutation.mutate(
      { workspaceId: wid, data: { taskIds: toArchive.map((t) => t.id) } },
      {
        onError: () => {
          queryClient.setQueryData(tasksKey, previousTasks);
        },
        onSettled: () => {
          queryClient.invalidateQueries({ queryKey: tasksKey });
        },
      },
    );
  }

  // ── Sprint operations ──────────────────────────────────────────────────────

  function addSprint(partial: Omit<Sprint, 'id'>): Sprint {
    const optimisticId = `optimistic-sprint-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const optimisticSprint: Sprint = { ...partial, id: optimisticId };

    const sprintsKey = getGetSprintsQueryKey(wid);
    queryClient.cancelQueries({ queryKey: sprintsKey });
    const previousSprints = queryClient.getQueryData<ApiSprint[]>(sprintsKey);

    queryClient.setQueryData<ApiSprint[]>(sprintsKey, (old) => {
      const optimisticApi: ApiSprint = {
        id: optimisticId,
        workspaceId: wid,
        name: partial.name,
        startDate: partial.startDate,
        endDate: partial.endDate,
        isActive: partial.isActive,
        createdAt: now,
        updatedAt: now,
      };
      return [...(old ?? []), optimisticApi];
    });

    createSprintMutation.mutate(
      {
        workspaceId: wid,
        data: {
          name: partial.name,
          startDate: partial.startDate,
          endDate: partial.endDate,
          isActive: partial.isActive,
        },
      },
      {
        onError: () => {
          queryClient.setQueryData(sprintsKey, previousSprints);
        },
        onSettled: () => {
          queryClient.invalidateQueries({ queryKey: sprintsKey });
        },
      },
    );

    return optimisticSprint;
  }

  function updateSprint(id: string, updates: Partial<Sprint>): void {
    if (!enabled) return;
    const sprintsKey = getGetSprintsQueryKey(wid);

    queryClient.cancelQueries({ queryKey: sprintsKey });
    const previousSprints = queryClient.getQueryData<ApiSprint[]>(sprintsKey);

    queryClient.setQueryData<ApiSprint[]>(sprintsKey, (old) =>
      (old ?? []).map((s) =>
        s.id === id ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s
      )
    );

    updateSprintMutation.mutate(
      { workspaceId: wid, sprintId: id, data: updates },
      {
        onError: () => {
          queryClient.setQueryData(sprintsKey, previousSprints);
        },
        onSettled: () => {
          queryClient.invalidateQueries({ queryKey: sprintsKey });
        },
      },
    );
  }

  function deleteSprint(id: string): void {
    if (!enabled) return;
    const sprintsKey = getGetSprintsQueryKey(wid);
    const tasksKey = getGetTasksQueryKey(wid);

    queryClient.cancelQueries({ queryKey: sprintsKey });
    queryClient.cancelQueries({ queryKey: tasksKey });
    const previousSprints = queryClient.getQueryData<ApiSprint[]>(sprintsKey);
    const previousTasks = queryClient.getQueryData<ApiTask[]>(tasksKey);
    const now = new Date().toISOString();

    queryClient.setQueryData<ApiSprint[]>(sprintsKey, (old) =>
      (old ?? []).filter((s) => s.id !== id)
    );
    // Optimistically unassign tasks from the deleted sprint
    queryClient.setQueryData<ApiTask[]>(tasksKey, (old) =>
      (old ?? []).map((t) =>
        t.sprintId === id ? { ...t, sprintId: null, updatedAt: now } : t
      )
    );

    deleteSprintMutation.mutate(
      { workspaceId: wid, sprintId: id },
      {
        onError: () => {
          queryClient.setQueryData(sprintsKey, previousSprints);
          queryClient.setQueryData(tasksKey, previousTasks);
        },
        onSettled: () => {
          queryClient.invalidateQueries({ queryKey: sprintsKey });
          queryClient.invalidateQueries({ queryKey: tasksKey });
        },
      },
    );
  }

  // ── Column operations ──────────────────────────────────────────────────────

  function addColumn(partial: Omit<KanbanColumn, 'id' | 'order'>): KanbanColumn {
    const maxOrder = columns.length > 0 ? Math.max(...columns.map((c) => c.order)) : -1;
    const order = maxOrder + 1;
    const optimisticId = `optimistic-col-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const optimisticCol: KanbanColumn = { ...partial, id: optimisticId, order };

    const columnsKey = getGetColumnsQueryKey(wid);
    queryClient.cancelQueries({ queryKey: columnsKey });
    const previousColumns = queryClient.getQueryData<ApiColumn[]>(columnsKey);

    queryClient.setQueryData<ApiColumn[]>(columnsKey, (old) => {
      const optimisticApi: ApiColumn = {
        id: optimisticId,
        workspaceId: wid,
        name: partial.name,
        order,
        semanticStatus: partial.semanticStatus,
        color: partial.color ?? null,
        createdAt: now,
        updatedAt: now,
      };
      return [...(old ?? []), optimisticApi];
    });

    createColumnMutation.mutate(
      {
        workspaceId: wid,
        data: {
          name: partial.name,
          order,
          semanticStatus: partial.semanticStatus,
          color: partial.color ?? null,
        },
      },
      {
        onError: () => {
          queryClient.setQueryData(columnsKey, previousColumns);
        },
        onSettled: () => {
          queryClient.invalidateQueries({ queryKey: columnsKey });
        },
      },
    );

    return optimisticCol;
  }

  function updateColumn(id: string, updates: Partial<KanbanColumn>): void {
    if (!enabled) return;
    const columnsKey = getGetColumnsQueryKey(wid);

    queryClient.cancelQueries({ queryKey: columnsKey });
    const previousColumns = queryClient.getQueryData<ApiColumn[]>(columnsKey);

    queryClient.setQueryData<ApiColumn[]>(columnsKey, (old) =>
      (old ?? []).map((c) =>
        c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c
      )
    );

    updateColumnMutation.mutate(
      {
        workspaceId: wid,
        columnId: id,
        data: {
          name: updates.name,
          order: updates.order,
          semanticStatus: updates.semanticStatus,
          color: updates.color ?? null,
        },
      },
      {
        onError: () => {
          queryClient.setQueryData(columnsKey, previousColumns);
        },
        onSettled: () => {
          queryClient.invalidateQueries({ queryKey: columnsKey });
        },
      },
    );
  }

  function deleteColumn(id: string, reassignToId: string): void {
    if (!enabled) return;
    const columnsKey = getGetColumnsQueryKey(wid);
    const tasksKey = getGetTasksQueryKey(wid);

    queryClient.cancelQueries({ queryKey: columnsKey });
    queryClient.cancelQueries({ queryKey: tasksKey });
    const previousColumns = queryClient.getQueryData<ApiColumn[]>(columnsKey);
    const previousTasks = queryClient.getQueryData<ApiTask[]>(tasksKey);
    const now = new Date().toISOString();

    queryClient.setQueryData<ApiColumn[]>(columnsKey, (old) =>
      (old ?? []).filter((c) => c.id !== id)
    );
    queryClient.setQueryData<ApiTask[]>(tasksKey, (old) =>
      (old ?? []).map((t) =>
        t.columnId === id ? { ...t, columnId: reassignToId, updatedAt: now } : t
      )
    );

    deleteColumnMutation.mutate(
      { workspaceId: wid, columnId: id, params: { reassignToId } },
      {
        onError: () => {
          queryClient.setQueryData(columnsKey, previousColumns);
          queryClient.setQueryData(tasksKey, previousTasks);
        },
        onSettled: () => {
          queryClient.invalidateQueries({ queryKey: columnsKey });
          queryClient.invalidateQueries({ queryKey: tasksKey });
        },
      },
    );
  }

  function reorderColumns(orderedIds: string[]): void {
    if (!enabled) return;
    const columnsKey = getGetColumnsQueryKey(wid);

    queryClient.cancelQueries({ queryKey: columnsKey });
    const previousColumns = queryClient.getQueryData<ApiColumn[]>(columnsKey);

    queryClient.setQueryData<ApiColumn[]>(columnsKey, (old) =>
      (old ?? []).map((c) => {
        const idx = orderedIds.indexOf(c.id);
        return idx >= 0 ? { ...c, order: idx } : c;
      })
    );

    reorderColumnsMutation.mutate(
      { workspaceId: wid, data: { columnIds: orderedIds } },
      {
        onError: () => {
          queryClient.setQueryData(columnsKey, previousColumns);
        },
        onSettled: () => {
          queryClient.invalidateQueries({ queryKey: columnsKey });
        },
      },
    );
  }

  // ── Daily snapshot recording ───────────────────────────────────────────────
  // Run once on mount (after data has loaded) to record today's sprint snapshots
  // via the API. Uses a ref to ensure it runs only once per provider mount.

  const snapshotRecordedRef = useRef(false);

  useEffect(() => {
    // Wait until all data is available and we haven't recorded yet this mount
    if (snapshotRecordedRef.current) return;
    if (!enabled || loading) return;
    if (sprints.length === 0) return;

    snapshotRecordedRef.current = true;

    const today = new Date().toISOString().slice(0, 10);
    const doneIds = new Set(doneColumnIds());

    for (const sprint of sprints) {
      const sprintTasks = tasks.filter(
        (t) => t.sprintId === sprint.id && !t.deletedAt
      );
      const total = sprintTasks.reduce((s, t) => s + (t.storyPoints ?? 0), 0);
      const done = sprintTasks
        .filter((t) => doneIds.has(t.columnId) || !!t.archivedAt)
        .reduce((s, t) => s + (t.storyPoints ?? 0), 0);

      upsertSnapshotMutation.mutate({
        workspaceId: wid,
        data: { sprintId: sprint.id, date: today, total, done },
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, loading]);

  // ── Context value ──────────────────────────────────────────────────────────

  return (
    <TaskContext.Provider
      value={{
        tasks,
        sprints,
        columns,
        loading,
        addTask,
        updateTask,
        deleteTask,
        undeleteTask,
        archiveTask,
        unarchiveTask,
        archiveDoneTasks,
        addSprint,
        updateSprint,
        deleteSprint,
        addColumn,
        updateColumn,
        deleteColumn,
        reorderColumns,
        getSemanticStatusForTask,
        doneColumnIds,
      }}
    >
      {children}
    </TaskContext.Provider>
  );
}

export function useTaskContext() {
  const ctx = useContext(TaskContext);
  if (!ctx) throw new Error('useTaskContext must be used within TaskProvider');
  return ctx;
}
