import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLocalTaskStore } from './useLocalTaskStore';
import { readTasks, readSprints, readColumns } from '../lib/localStore';
import { DEFAULT_COLUMNS } from '../types/task';
import type { Task } from '../types/task';

// ── Column fixtures ──────────────────────────────────────────────────────────
const TODO_COL = DEFAULT_COLUMNS[0];        // col-todo, not-started
const IN_PROG_COL = DEFAULT_COLUMNS[1];     // col-in-progress, in-progress
const DONE_COL = DEFAULT_COLUMNS[3];        // col-done, done

function makeTask(overrides: Partial<Task> = {}): Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'order'> {
  return {
    title: 'Test task',
    notes: '',
    columnId: TODO_COL.id,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

// ── addTask ──────────────────────────────────────────────────────────────────

describe('addTask', () => {
  it('adds task with UUID id', () => {
    const { result } = renderHook(() => useLocalTaskStore());
    let task: Task;
    act(() => { task = result.current.addTask(makeTask()); });
    expect(task!.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('assigns correct order (0 for first task)', () => {
    const { result } = renderHook(() => useLocalTaskStore());
    let task: Task;
    act(() => { task = result.current.addTask(makeTask()); });
    expect(task!.order).toBe(0);
  });

  it('increments order for subsequent tasks', () => {
    const { result } = renderHook(() => useLocalTaskStore());
    let t1: Task, t2: Task;
    act(() => { t1 = result.current.addTask(makeTask()); });
    act(() => { t2 = result.current.addTask(makeTask()); });
    expect(t2!.order).toBe(t1!.order + 1);
  });

  it('writes to localStorage', () => {
    const { result } = renderHook(() => useLocalTaskStore());
    act(() => { result.current.addTask(makeTask()); });
    expect(readTasks()).toHaveLength(1);
  });
});

// ── updateTask ───────────────────────────────────────────────────────────────

describe('updateTask', () => {
  it('merges fields and updates updatedAt', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useLocalTaskStore());
    let task: Task;
    act(() => { task = result.current.addTask(makeTask()); });
    const before = task!.updatedAt;
    vi.advanceTimersByTime(100);
    act(() => { result.current.updateTask(task.id, { title: 'Updated' }); });
    const updated = result.current.tasks.find((t) => t.id === task.id)!;
    expect(updated.title).toBe('Updated');
    expect(updated.updatedAt).not.toBe(before);
    vi.useRealTimers();
  });

  it('sets inProgressAt when moving TO an in-progress column', () => {
    const { result } = renderHook(() => useLocalTaskStore());
    let task: Task;
    act(() => { task = result.current.addTask(makeTask({ columnId: TODO_COL.id })); });
    act(() => { result.current.updateTask(task.id, { columnId: IN_PROG_COL.id }); });
    const updated = result.current.tasks.find((t) => t.id === task.id)!;
    expect(updated.inProgressAt).toBeTruthy();
  });

  it('clears inProgressAt when moving OUT of in-progress column', () => {
    const { result } = renderHook(() => useLocalTaskStore());
    let task: Task;
    act(() => { task = result.current.addTask(makeTask({ columnId: TODO_COL.id })); });
    act(() => { result.current.updateTask(task.id, { columnId: IN_PROG_COL.id }); });
    act(() => { result.current.updateTask(task.id, { columnId: DONE_COL.id }); });
    const updated = result.current.tasks.find((t) => t.id === task.id)!;
    expect(updated.inProgressAt).toBeUndefined();
  });

  it('persists changes to localStorage', () => {
    const { result } = renderHook(() => useLocalTaskStore());
    let task: Task;
    act(() => { task = result.current.addTask(makeTask()); });
    act(() => { result.current.updateTask(task.id, { title: 'Persisted' }); });
    expect(readTasks().find((t) => t.id === task.id)?.title).toBe('Persisted');
  });
});

// ── deleteTask / undeleteTask ─────────────────────────────────────────────────

describe('deleteTask / undeleteTask', () => {
  it('deleteTask sets deletedAt', () => {
    const { result } = renderHook(() => useLocalTaskStore());
    let task: Task;
    act(() => { task = result.current.addTask(makeTask()); });
    act(() => { result.current.deleteTask(task.id); });
    const found = result.current.tasks.find((t) => t.id === task.id)!;
    expect(found.deletedAt).toBeTruthy();
  });

  it('undeleteTask clears deletedAt', () => {
    const { result } = renderHook(() => useLocalTaskStore());
    let task: Task;
    act(() => { task = result.current.addTask(makeTask()); });
    act(() => { result.current.deleteTask(task.id); });
    act(() => { result.current.undeleteTask(task.id); });
    const found = result.current.tasks.find((t) => t.id === task.id)!;
    expect(found.deletedAt).toBeUndefined();
  });
});

// ── archiveTask / unarchiveTask ───────────────────────────────────────────────

describe('archiveTask / unarchiveTask', () => {
  it('archiveTask sets archivedAt', () => {
    const { result } = renderHook(() => useLocalTaskStore());
    let task: Task;
    act(() => { task = result.current.addTask(makeTask()); });
    act(() => { result.current.archiveTask(task.id); });
    const found = result.current.tasks.find((t) => t.id === task.id)!;
    expect(found.archivedAt).toBeTruthy();
  });

  it('unarchiveTask clears archivedAt', () => {
    const { result } = renderHook(() => useLocalTaskStore());
    let task: Task;
    act(() => { task = result.current.addTask(makeTask()); });
    act(() => { result.current.archiveTask(task.id); });
    act(() => { result.current.unarchiveTask(task.id); });
    const found = result.current.tasks.find((t) => t.id === task.id)!;
    expect(found.archivedAt).toBeUndefined();
  });
});

// ── archiveDoneTasks ─────────────────────────────────────────────────────────

describe('archiveDoneTasks', () => {
  it('archives tasks in done columns', () => {
    const { result } = renderHook(() => useLocalTaskStore());
    let doneTask: Task;
    let todoTask: Task;
    act(() => { doneTask = result.current.addTask(makeTask({ columnId: DONE_COL.id })); });
    act(() => { todoTask = result.current.addTask(makeTask({ columnId: TODO_COL.id })); });
    act(() => { result.current.archiveDoneTasks(); });
    expect(result.current.tasks.find((t) => t.id === doneTask.id)?.archivedAt).toBeTruthy();
    expect(result.current.tasks.find((t) => t.id === todoTask.id)?.archivedAt).toBeUndefined();
  });
});

// ── deleteSprint ─────────────────────────────────────────────────────────────

describe('deleteSprint', () => {
  it('removes sprint and unassigns its tasks', () => {
    const { result } = renderHook(() => useLocalTaskStore());
    let sprint: ReturnType<typeof result.current.addSprint>;
    let task: Task;
    act(() => {
      sprint = result.current.addSprint({ name: 'S1', startDate: '2024-01-01', endDate: '2024-01-14', isActive: true });
    });
    act(() => { task = result.current.addTask(makeTask({ sprintId: sprint.id })); });
    act(() => { result.current.deleteSprint(sprint.id); });
    expect(result.current.sprints).toHaveLength(0);
    expect(result.current.tasks.find((t) => t.id === task.id)?.sprintId).toBeUndefined();
    expect(readSprints()).toHaveLength(0);
  });
});

// ── deleteColumn ─────────────────────────────────────────────────────────────

describe('deleteColumn', () => {
  it('removes column and reassigns its tasks to fallback', () => {
    const { result } = renderHook(() => useLocalTaskStore());
    let task: Task;
    // Add task in IN_PROG_COL, then delete IN_PROG_COL and reassign to TODO_COL
    act(() => { task = result.current.addTask(makeTask({ columnId: IN_PROG_COL.id })); });
    act(() => { result.current.deleteColumn(IN_PROG_COL.id, TODO_COL.id); });
    expect(result.current.columns.find((c) => c.id === IN_PROG_COL.id)).toBeUndefined();
    expect(result.current.tasks.find((t) => t.id === task.id)?.columnId).toBe(TODO_COL.id);
  });
});

// ── reorderColumns ───────────────────────────────────────────────────────────

describe('reorderColumns', () => {
  it('updates order values to match the given array', () => {
    const { result } = renderHook(() => useLocalTaskStore());
    const ids = result.current.columns.map((c) => c.id);
    const reversed = [...ids].reverse();
    act(() => { result.current.reorderColumns(reversed); });
    const cols = result.current.columns;
    reversed.forEach((id, idx) => {
      expect(cols.find((c) => c.id === id)?.order).toBe(idx);
    });
    expect(readColumns().find((c) => c.id === reversed[0])?.order).toBe(0);
  });
});
