import { Task, Sprint, KanbanColumn } from '../types/task';
import { SEED_TASKS, SEED_SPRINTS, SEED_COLUMNS, SEED_VERSION } from './seedData';

const TASKS_KEY = 'pm-tasks';
const SPRINTS_KEY = 'pm-sprints';
const COLUMNS_KEY = 'pm-columns';
const SEED_VERSION_KEY = 'pm-seed-version';

export function seedIfNeeded(): void {
  const storedVersion = localStorage.getItem(SEED_VERSION_KEY);
  if (storedVersion !== SEED_VERSION) {
    localStorage.setItem(TASKS_KEY, JSON.stringify(SEED_TASKS));
    localStorage.setItem(SPRINTS_KEY, JSON.stringify(SEED_SPRINTS));
    localStorage.setItem(COLUMNS_KEY, JSON.stringify(SEED_COLUMNS));
    localStorage.setItem(SEED_VERSION_KEY, SEED_VERSION);
  }
}

export function resetToSeed(): void {
  localStorage.setItem(TASKS_KEY, JSON.stringify(SEED_TASKS));
  localStorage.setItem(SPRINTS_KEY, JSON.stringify(SEED_SPRINTS));
  localStorage.setItem(COLUMNS_KEY, JSON.stringify(SEED_COLUMNS));
  localStorage.setItem(SEED_VERSION_KEY, SEED_VERSION);
}

export function getTasks(): Task[] {
  try {
    const raw = localStorage.getItem(TASKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Record<string, unknown>[];
    // Backwards-compat migration: rename stored `description` → `notes`
    return parsed.map((t) => {
      if ('description' in t && !('notes' in t)) {
        const { description, ...rest } = t;
        return { ...rest, notes: description ?? '' } as Task;
      }
      return t as unknown as Task;
    });
  } catch {
    return [];
  }
}

export function saveTasks(tasks: Task[]): void {
  localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
}

export function getSprints(): Sprint[] {
  try {
    const raw = localStorage.getItem(SPRINTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveSprints(sprints: Sprint[]): void {
  localStorage.setItem(SPRINTS_KEY, JSON.stringify(sprints));
}

export function getColumns(): KanbanColumn[] {
  try {
    const raw = localStorage.getItem(COLUMNS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveColumns(columns: KanbanColumn[]): void {
  localStorage.setItem(COLUMNS_KEY, JSON.stringify(columns));
}

// ── Daily sprint snapshots ──────────────────────────────────────────────────
// Keyed by date (YYYY-MM-DD) → map of sprintId → { total, done }
export interface SprintSnapshot {
  total: number;
  done: number;
}

export type SnapshotsByDate = Record<string, Record<string, SprintSnapshot>>;

const SNAPSHOTS_KEY = 'pm-sprint-snapshots';

export function getSprintSnapshots(): SnapshotsByDate {
  try {
    const raw = localStorage.getItem(SNAPSHOTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveSprintSnapshots(snapshots: SnapshotsByDate): void {
  localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(snapshots));
}

export function recordDailySnapshots(
  sprints: Sprint[],
  tasks: Task[],
  doneColumnIds: string[]
): void {
  const today = new Date().toISOString().slice(0, 10);
  const snapshots = getSprintSnapshots();

  if (!snapshots[today]) {
    snapshots[today] = {};
  }

  const doneSet = new Set(doneColumnIds);
  let changed = false;

  for (const sprint of sprints) {
    // Only write once per day per sprint
    if (snapshots[today][sprint.id]) continue;
    const sprintTasks = tasks.filter(
      (t) => t.sprintId === sprint.id && !t.deletedAt
    );
    const total = sprintTasks.reduce((s, t) => s + (t.storyPoints ?? 0), 0);
    const done = sprintTasks
      .filter((t) => doneSet.has(t.columnId) || !!t.archivedAt)
      .reduce((s, t) => s + (t.storyPoints ?? 0), 0);
    snapshots[today][sprint.id] = { total, done };
    changed = true;
  }

  if (changed) {
    saveSprintSnapshots(snapshots);
  }
}
