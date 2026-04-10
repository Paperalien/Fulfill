import type { Task, Sprint, KanbanColumn } from '../types/task';
import { DEFAULT_COLUMNS } from '../types/task';

const KEYS = {
  tasks: 'fulfill:tasks',
  sprints: 'fulfill:sprints',
  columns: 'fulfill:columns',
  firstRunSeen: 'fulfill:first-run-seen',
} as const;

function safeRead<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or private browsing — silently ignore
  }
}

// ── Tasks ────────────────────────────────────────────────────────────────────

export function readTasks(): Task[] {
  return safeRead<Task[]>(KEYS.tasks, []);
}

export function writeTasks(tasks: Task[]): void {
  safeWrite(KEYS.tasks, tasks);
}

// ── Sprints ──────────────────────────────────────────────────────────────────

export function readSprints(): Sprint[] {
  return safeRead<Sprint[]>(KEYS.sprints, []);
}

export function writeSprints(sprints: Sprint[]): void {
  safeWrite(KEYS.sprints, sprints);
}

// ── Columns ──────────────────────────────────────────────────────────────────
// Seeds default columns on first empty read so the app is usable immediately.

export function readColumns(): KanbanColumn[] {
  const stored = safeRead<KanbanColumn[] | null>(KEYS.columns, null);
  if (stored !== null && stored.length > 0) return stored;
  // First run: seed defaults
  safeWrite(KEYS.columns, DEFAULT_COLUMNS);
  return DEFAULT_COLUMNS;
}

export function writeColumns(columns: KanbanColumn[]): void {
  safeWrite(KEYS.columns, columns);
}

// ── Lifecycle helpers ────────────────────────────────────────────────────────

export function hasLocalData(): boolean {
  return (
    readTasks().length > 0 ||
    readSprints().length > 0 ||
    // Only count columns as "data" if they differ from the default seed
    (() => {
      const raw = localStorage.getItem(KEYS.columns);
      if (!raw) return false;
      try {
        const cols = JSON.parse(raw) as KanbanColumn[];
        const defaultIds = new Set(DEFAULT_COLUMNS.map((c) => c.id));
        return cols.some((c) => !defaultIds.has(c.id));
      } catch {
        return false;
      }
    })()
  );
}

export function clearLocalData(): void {
  try {
    localStorage.removeItem(KEYS.tasks);
    localStorage.removeItem(KEYS.sprints);
    localStorage.removeItem(KEYS.columns);
  } catch {
    // Ignore
  }
}

// ── First-run flag ───────────────────────────────────────────────────────────

export function hasSeenFirstRun(): boolean {
  return localStorage.getItem(KEYS.firstRunSeen) === 'true';
}

export function markFirstRunSeen(): void {
  try {
    localStorage.setItem(KEYS.firstRunSeen, 'true');
  } catch {
    // Ignore
  }
}
