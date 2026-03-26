import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Task, Sprint, TaskStatus } from '../types/task';
import { getTasks, saveTasks, getSprints, saveSprints, seedIfNeeded } from '../utils/storage';

interface TaskContextValue {
  tasks: Task[];
  sprints: Sprint[];
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
}

const TaskContext = createContext<TaskContextValue | null>(null);

export function TaskProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>(() => {
    seedIfNeeded();
    return getTasks();
  });
  const [sprints, setSprints] = useState<Sprint[]>(() => getSprints());

  useEffect(() => {
    saveTasks(tasks);
  }, [tasks]);

  useEffect(() => {
    saveSprints(sprints);
  }, [sprints]);

  function generateId() {
    return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function addTask(partial: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'order'>): Task {
    const maxOrder = tasks.length > 0 ? Math.max(...tasks.map((t) => t.order)) : -1;
    const now = new Date().toISOString();
    const newTask: Task = {
      ...partial,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      order: maxOrder + 1,
    };
    setTasks((prev) => [...prev, newTask]);
    return newTask;
  }

  function updateTask(id: string, updates: Partial<Task>) {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const updated = { ...t, ...updates, updatedAt: new Date().toISOString() };
        if (updates.status === 'in-progress' && t.status !== 'in-progress') {
          updated.inProgressAt = new Date().toISOString();
        }
        return updated;
      })
    );
  }

  function deleteTask(id: string) {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : t
      )
    );
  }

  function undeleteTask(id: string) {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, deletedAt: undefined, updatedAt: new Date().toISOString() }
          : t
      )
    );
  }

  function archiveTask(id: string) {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
          : t
      )
    );
  }

  function unarchiveTask(id: string) {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, archivedAt: undefined, updatedAt: new Date().toISOString() }
          : t
      )
    );
  }

  function archiveDoneTasks(taskIds?: string[]) {
    const now = new Date().toISOString();
    setTasks((prev) =>
      prev.map((t) => {
        const shouldArchive = taskIds
          ? taskIds.includes(t.id)
          : t.status === 'done' && !t.archivedAt && !t.deletedAt;
        if (shouldArchive) {
          return { ...t, archivedAt: now, updatedAt: now };
        }
        return t;
      })
    );
  }

  function addSprint(partial: Omit<Sprint, 'id'>): Sprint {
    const newSprint: Sprint = {
      ...partial,
      id: `sprint-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
    setSprints((prev) => [...prev, newSprint]);
    return newSprint;
  }

  function updateSprint(id: string, updates: Partial<Sprint>) {
    setSprints((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  }

  function deleteSprint(id: string) {
    setSprints((prev) => prev.filter((s) => s.id !== id));
    setTasks((prev) =>
      prev.map((t) =>
        t.sprintId === id ? { ...t, sprintId: undefined, updatedAt: new Date().toISOString() } : t
      )
    );
  }

  return (
    <TaskContext.Provider
      value={{
        tasks,
        sprints,
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

export type { TaskStatus };
