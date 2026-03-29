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
    return raw ? JSON.parse(raw) : [];
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
