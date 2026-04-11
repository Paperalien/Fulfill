import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_COLUMNS } from '../types/task';
import {
  readTasks,
  writeTasks,
  readSprints,
  writeSprints,
  readColumns,
  writeColumns,
  hasLocalData,
  clearLocalData,
  hasSeenFirstRun,
  markFirstRunSeen,
} from './localStore';
import type { Task, Sprint, KanbanColumn } from '../types/task';

const TASK: Task = {
  id: 't1',
  title: 'Test task',
  notes: '',
  columnId: 'col-todo',
  order: 0,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const SPRINT: Sprint = {
  id: 's1',
  name: 'Sprint 1',
  startDate: '2024-01-01',
  endDate: '2024-01-14',
  isActive: true,
};

const CUSTOM_COLUMN: KanbanColumn = {
  id: 'col-custom',
  name: 'Custom',
  order: 4,
  semanticStatus: 'not-started',
};

beforeEach(() => {
  localStorage.clear();
});

// ── readTasks ────────────────────────────────────────────────────────────────

describe('readTasks', () => {
  it('returns [] when nothing stored', () => {
    expect(readTasks()).toEqual([]);
  });

  it('roundtrips via writeTasks', () => {
    writeTasks([TASK]);
    expect(readTasks()).toEqual([TASK]);
  });

  it('preserves all fields', () => {
    const full: Task = {
      ...TASK,
      storyPoints: 5,
      sprintId: 's1',
      dueDate: '2024-02-01',
      inProgressAt: '2024-01-15T00:00:00.000Z',
      tags: ['backend'],
      reminder: 'day-before',
      recurrence: 'weekly',
    };
    writeTasks([full]);
    expect(readTasks()[0]).toEqual(full);
  });
});

// ── readSprints ──────────────────────────────────────────────────────────────

describe('readSprints / writeSprints', () => {
  it('returns [] when nothing stored', () => {
    expect(readSprints()).toEqual([]);
  });

  it('roundtrips', () => {
    writeSprints([SPRINT]);
    expect(readSprints()).toEqual([SPRINT]);
  });
});

// ── readColumns ──────────────────────────────────────────────────────────────

describe('readColumns', () => {
  it('seeds DEFAULT_COLUMNS when localStorage is empty', () => {
    expect(readColumns()).toEqual(DEFAULT_COLUMNS);
  });

  it('returns stored columns when they exist (no re-seed)', () => {
    const custom: KanbanColumn[] = [CUSTOM_COLUMN];
    writeColumns(custom);
    expect(readColumns()).toEqual(custom);
  });

  it('does not overwrite existing columns with defaults', () => {
    const custom: KanbanColumn[] = [CUSTOM_COLUMN];
    writeColumns(custom);
    readColumns(); // second call should still return custom
    expect(readColumns()).toEqual(custom);
  });
});

// ── hasLocalData ─────────────────────────────────────────────────────────────

describe('hasLocalData', () => {
  it('returns false when only default columns present (after readColumns seed)', () => {
    readColumns(); // seed defaults
    expect(hasLocalData()).toBe(false);
  });

  it('returns true when tasks exist', () => {
    writeTasks([TASK]);
    expect(hasLocalData()).toBe(true);
  });

  it('returns true when sprints exist', () => {
    writeSprints([SPRINT]);
    expect(hasLocalData()).toBe(true);
  });

  it('returns true when a non-default column exists', () => {
    writeColumns([...DEFAULT_COLUMNS, CUSTOM_COLUMN]);
    expect(hasLocalData()).toBe(true);
  });

  it('returns false when storage is completely empty', () => {
    expect(hasLocalData()).toBe(false);
  });
});

// ── clearLocalData ───────────────────────────────────────────────────────────

describe('clearLocalData', () => {
  it('removes tasks, sprints, and columns keys', () => {
    writeTasks([TASK]);
    writeSprints([SPRINT]);
    writeColumns([CUSTOM_COLUMN]);
    clearLocalData();
    expect(localStorage.getItem('fulfill:tasks')).toBeNull();
    expect(localStorage.getItem('fulfill:sprints')).toBeNull();
    expect(localStorage.getItem('fulfill:columns')).toBeNull();
  });

  it('does not remove the first-run-seen key', () => {
    markFirstRunSeen();
    clearLocalData();
    expect(localStorage.getItem('fulfill:first-run-seen')).toBe('true');
  });
});

// ── first-run flag ───────────────────────────────────────────────────────────

describe('hasSeenFirstRun / markFirstRunSeen', () => {
  it('returns false initially', () => {
    expect(hasSeenFirstRun()).toBe(false);
  });

  it('returns true after markFirstRunSeen', () => {
    markFirstRunSeen();
    expect(hasSeenFirstRun()).toBe(true);
  });
});

// ── safeRead ─────────────────────────────────────────────────────────────────

describe('safeRead (malformed JSON)', () => {
  it('returns fallback on malformed JSON without throwing', () => {
    localStorage.setItem('fulfill:tasks', '{invalid json}');
    expect(() => readTasks()).not.toThrow();
    expect(readTasks()).toEqual([]);
  });
});
