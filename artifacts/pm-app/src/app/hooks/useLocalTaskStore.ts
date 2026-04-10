import { useState } from 'react';
import { Task, Sprint, KanbanColumn, SemanticStatus } from '../types/task';
import {
  readTasks, writeTasks,
  readSprints, writeSprints,
  readColumns, writeColumns,
} from '../lib/localStore';
import { getSemanticStatus } from '../utils/taskUtils';
import type { TaskContextValue } from '../contexts/TaskContext';

export function useLocalTaskStore(): TaskContextValue {
  const [tasks, setTasks] = useState<Task[]>(() => readTasks());
  const [sprints, setSprints] = useState<Sprint[]>(() => readSprints());
  const [columns, setColumns] = useState<KanbanColumn[]>(() => readColumns());

  // ── Helpers ────────────────────────────────────────────────────────────────

  function doneColumnIds(): string[] {
    return columns.filter((c) => c.semanticStatus === 'done').map((c) => c.id);
  }

  function getSemanticStatusForTask(task: Task): SemanticStatus {
    return getSemanticStatus(task, columns);
  }

  // ── Task operations ────────────────────────────────────────────────────────

  function addTask(partial: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'order'>): Task {
    const current = readTasks();
    const maxOrder = current.length > 0 ? Math.max(...current.map((t) => t.order)) : -1;
    const now = new Date().toISOString();
    const newTask: Task = {
      ...partial,
      id: crypto.randomUUID(),
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    };
    const next = [...current, newTask];
    writeTasks(next);
    setTasks(next);
    return newTask;
  }

  function updateTask(id: string, updates: Partial<Task>): void {
    setTasks((prev) => {
      const now = new Date().toISOString();
      const next = prev.map((t) => {
        if (t.id !== id) return t;

        let inProgressAt = updates.inProgressAt !== undefined
          ? updates.inProgressAt
          : t.inProgressAt;

        if (updates.columnId && updates.columnId !== t.columnId) {
          const newCol = columns.find((c) => c.id === updates.columnId);
          const oldCol = columns.find((c) => c.id === t.columnId);
          if (newCol?.semanticStatus === 'in-progress' && oldCol?.semanticStatus !== 'in-progress') {
            inProgressAt = now;
          } else if (newCol?.semanticStatus !== 'in-progress') {
            inProgressAt = undefined;
          }
        }

        return { ...t, ...updates, inProgressAt, updatedAt: now };
      });
      writeTasks(next);
      return next;
    });
  }

  function deleteTask(id: string): void {
    updateTask(id, { deletedAt: new Date().toISOString() });
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
    const now = new Date().toISOString();
    const doneIds = new Set(doneColumnIds());
    setTasks((prev) => {
      const next = prev.map((t) => {
        const shouldArchive = taskIds
          ? taskIds.includes(t.id)
          : doneIds.has(t.columnId) && !t.archivedAt && !t.deletedAt;
        return shouldArchive ? { ...t, archivedAt: now, updatedAt: now } : t;
      });
      writeTasks(next);
      return next;
    });
  }

  // ── Sprint operations ──────────────────────────────────────────────────────

  function addSprint(partial: Omit<Sprint, 'id'>): Sprint {
    const newSprint: Sprint = { ...partial, id: crypto.randomUUID() };
    setSprints((prev) => {
      const next = [...prev, newSprint];
      writeSprints(next);
      return next;
    });
    return newSprint;
  }

  function updateSprint(id: string, updates: Partial<Sprint>): void {
    setSprints((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, ...updates } : s));
      writeSprints(next);
      return next;
    });
  }

  function deleteSprint(id: string): void {
    setSprints((prev) => {
      const next = prev.filter((s) => s.id !== id);
      writeSprints(next);
      return next;
    });
    // Unassign tasks from deleted sprint
    setTasks((prev) => {
      const now = new Date().toISOString();
      const next = prev.map((t) =>
        t.sprintId === id ? { ...t, sprintId: undefined, updatedAt: now } : t
      );
      writeTasks(next);
      return next;
    });
  }

  // ── Column operations ──────────────────────────────────────────────────────

  function addColumn(partial: Omit<KanbanColumn, 'id' | 'order'>): KanbanColumn {
    const current = readColumns();
    const maxOrder = current.length > 0 ? Math.max(...current.map((c) => c.order)) : -1;
    const newCol: KanbanColumn = { ...partial, id: crypto.randomUUID(), order: maxOrder + 1 };
    setColumns((prev) => {
      const next = [...prev, newCol];
      writeColumns(next);
      return next;
    });
    return newCol;
  }

  function updateColumn(id: string, updates: Partial<KanbanColumn>): void {
    setColumns((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, ...updates } : c));
      writeColumns(next);
      return next;
    });
  }

  function deleteColumn(id: string, reassignToId: string): void {
    const now = new Date().toISOString();
    setColumns((prev) => {
      const next = prev.filter((c) => c.id !== id);
      writeColumns(next);
      return next;
    });
    setTasks((prev) => {
      const next = prev.map((t) =>
        t.columnId === id ? { ...t, columnId: reassignToId, updatedAt: now } : t
      );
      writeTasks(next);
      return next;
    });
  }

  function reorderColumns(orderedIds: string[]): void {
    setColumns((prev) => {
      const next = prev.map((c) => {
        const idx = orderedIds.indexOf(c.id);
        return idx >= 0 ? { ...c, order: idx } : c;
      });
      writeColumns(next);
      return next;
    });
  }

  return {
    tasks,
    sprints,
    columns,
    loading: false,
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
  };
}
