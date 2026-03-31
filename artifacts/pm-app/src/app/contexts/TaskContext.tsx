import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Task, Sprint, KanbanColumn, SemanticStatus } from '../types/task';
import {
  getTasks, saveTasks, getSprints, saveSprints,
  getColumns, saveColumns, seedIfNeeded,
} from '../utils/storage';
import { getSemanticStatus, computeNextDueDate } from '../utils/taskUtils';

interface TaskContextValue {
  tasks: Task[];
  sprints: Sprint[];
  columns: KanbanColumn[];
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

export function TaskProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>(() => {
    seedIfNeeded();
    return getTasks();
  });
  const [sprints, setSprints] = useState<Sprint[]>(() => getSprints());
  const [columns, setColumns] = useState<KanbanColumn[]>(() => getColumns());

  useEffect(() => { saveTasks(tasks); }, [tasks]);
  useEffect(() => { saveSprints(sprints); }, [sprints]);
  useEffect(() => { saveColumns(columns); }, [columns]);

  function uid() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function addTask(partial: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'order'>): Task {
    const maxOrder = tasks.length > 0 ? Math.max(...tasks.map((t) => t.order)) : -1;
    const now = new Date().toISOString();
    const newTask: Task = { ...partial, id: `task-${uid()}`, createdAt: now, updatedAt: now, order: maxOrder + 1 };
    setTasks((prev) => [...prev, newTask]);
    return newTask;
  }

  function updateTask(id: string, updates: Partial<Task>) {
    setTasks((prev) => {
      const task = prev.find((t) => t.id === id);
      if (!task) return prev;

      const now = new Date().toISOString();
      const updated: Task = { ...task, ...updates, updatedAt: now };

      // Track inProgressAt when moving into an in-progress column
      if (updates.columnId && updates.columnId !== task.columnId) {
        const newCol = columns.find((c) => c.id === updates.columnId);
        const oldCol = columns.find((c) => c.id === task.columnId);
        if (newCol?.semanticStatus === 'in-progress' && oldCol?.semanticStatus !== 'in-progress') {
          updated.inProgressAt = now;
        } else if (newCol?.semanticStatus !== 'in-progress') {
          updated.inProgressAt = undefined;
        }
      }

      const mapped = prev.map((t) => (t.id === id ? updated : t));

      // Recurrence: spawn next occurrence when a recurring task moves into a done column
      if (
        task.recurrence &&
        updates.columnId &&
        updates.columnId !== task.columnId
      ) {
        const newCol = columns.find((c) => c.id === updates.columnId);
        if (newCol?.semanticStatus === 'done') {
          const notStartedColId =
            columns.find((c) => c.semanticStatus === 'not-started')?.id ??
            columns[0]?.id;
          const nextDue = computeNextDueDate(updated);
          const maxOrder = Math.max(...prev.map((t) => t.order), -1);
          const spawnId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const spawned: Task = {
            ...updated,
            id: spawnId,
            columnId: notStartedColId,
            dueDate: nextDue,
            createdAt: now,
            updatedAt: now,
            order: maxOrder + 1,
            archivedAt: undefined,
            deletedAt: undefined,
            inProgressAt: undefined,
            reminderDismissedAt: undefined,
          };
          return [...mapped, spawned];
        }
      }

      return mapped;
    });
  }

  function deleteTask(id: string) {
    setTasks((prev) =>
      prev.map((t) => t.id === id ? { ...t, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : t)
    );
  }

  function undeleteTask(id: string) {
    setTasks((prev) =>
      prev.map((t) => t.id === id ? { ...t, deletedAt: undefined, updatedAt: new Date().toISOString() } : t)
    );
  }

  function archiveTask(id: string) {
    setTasks((prev) =>
      prev.map((t) => t.id === id ? { ...t, archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : t)
    );
  }

  function unarchiveTask(id: string) {
    setTasks((prev) =>
      prev.map((t) => t.id === id ? { ...t, archivedAt: undefined, updatedAt: new Date().toISOString() } : t)
    );
  }

  function archiveDoneTasks(taskIds?: string[]) {
    const now = new Date().toISOString();
    const doneIds = new Set(doneColumnIds());
    setTasks((prev) =>
      prev.map((t) => {
        const shouldArchive = taskIds
          ? taskIds.includes(t.id)
          : doneIds.has(t.columnId) && !t.archivedAt && !t.deletedAt;
        return shouldArchive ? { ...t, archivedAt: now, updatedAt: now } : t;
      })
    );
  }

  function addSprint(partial: Omit<Sprint, 'id'>): Sprint {
    const s: Sprint = { ...partial, id: `sprint-${uid()}` };
    setSprints((prev) => [...prev, s]);
    return s;
  }

  function updateSprint(id: string, updates: Partial<Sprint>) {
    setSprints((prev) => prev.map((s) => s.id === id ? { ...s, ...updates } : s));
  }

  function deleteSprint(id: string) {
    setSprints((prev) => prev.filter((s) => s.id !== id));
    setTasks((prev) =>
      prev.map((t) => t.sprintId === id ? { ...t, sprintId: undefined, updatedAt: new Date().toISOString() } : t)
    );
  }

  function addColumn(partial: Omit<KanbanColumn, 'id' | 'order'>): KanbanColumn {
    const maxOrder = columns.length > 0 ? Math.max(...columns.map((c) => c.order)) : -1;
    const col: KanbanColumn = { ...partial, id: `col-${uid()}`, order: maxOrder + 1 };
    setColumns((prev) => [...prev, col]);
    return col;
  }

  function updateColumn(id: string, updates: Partial<KanbanColumn>) {
    setColumns((prev) => prev.map((c) => c.id === id ? { ...c, ...updates } : c));
  }

  function deleteColumn(id: string, reassignToId: string) {
    setColumns((prev) => prev.filter((c) => c.id !== id));
    setTasks((prev) =>
      prev.map((t) => t.columnId === id ? { ...t, columnId: reassignToId, updatedAt: new Date().toISOString() } : t)
    );
  }

  function reorderColumns(orderedIds: string[]) {
    setColumns((prev) =>
      prev.map((c) => {
        const idx = orderedIds.indexOf(c.id);
        return idx >= 0 ? { ...c, order: idx } : c;
      })
    );
  }

  function getSemanticStatusForTask(task: Task): SemanticStatus {
    return getSemanticStatus(task, columns);
  }

  function doneColumnIds(): string[] {
    return columns.filter((c) => c.semanticStatus === 'done').map((c) => c.id);
  }

  return (
    <TaskContext.Provider value={{
      tasks, sprints, columns,
      addTask, updateTask, deleteTask, undeleteTask,
      archiveTask, unarchiveTask, archiveDoneTasks,
      addSprint, updateSprint, deleteSprint,
      addColumn, updateColumn, deleteColumn, reorderColumns,
      getSemanticStatusForTask, doneColumnIds,
    }}>
      {children}
    </TaskContext.Provider>
  );
}

export function useTaskContext() {
  const ctx = useContext(TaskContext);
  if (!ctx) throw new Error('useTaskContext must be used within TaskProvider');
  return ctx;
}
