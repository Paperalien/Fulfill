import { Task, KanbanColumn, SemanticStatus } from '../types/task';

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Resolves the effective reminder date (YYYY-MM-DD) from a task's reminder + dueDate fields. */
export function computeReminderDate(task: Task): string | undefined {
  if (!task.reminder) return undefined;
  if (task.reminder === 'day-before') {
    if (!task.dueDate) return undefined;
    const d = new Date(task.dueDate);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  if (task.reminder === 'on-due-date') {
    return task.dueDate;
  }
  // Specific date string (YYYY-MM-DD)
  return task.reminder;
}

/**
 * Returns true if the reminder for this task is currently active (due and not already dismissed
 * for this reminder date or later). Dismissal persists until the effective reminder date changes.
 */
export function isReminderActive(task: Task): boolean {
  const rd = computeReminderDate(task);
  if (!rd) return false;
  const today = todayStr();
  if (rd > today) return false;
  // Dismissed as long as reminderDismissedAt is on or after the effective reminder date
  if (task.reminderDismissedAt && task.reminderDismissedAt >= rd) return false;
  return true;
}

/** Computes the next due date for a recurring task (YYYY-MM-DD), or undefined. */
export function computeNextDueDate(task: Task): string | undefined {
  if (!task.recurrence) return task.dueDate;
  const base = task.dueDate ? new Date(task.dueDate) : new Date();
  const next = new Date(base);
  if (task.recurrence === 'daily') next.setDate(next.getDate() + 1);
  if (task.recurrence === 'weekly') next.setDate(next.getDate() + 7);
  if (task.recurrence === 'monthly') next.setMonth(next.getMonth() + 1);
  return next.toISOString().slice(0, 10);
}

export function getSemanticStatus(task: Task, columns: KanbanColumn[]): SemanticStatus {
  const col = columns.find((c) => c.id === task.columnId);
  return col?.semanticStatus ?? 'not-started';
}

export function getColumnName(task: Task, columns: KanbanColumn[]): string {
  const col = columns.find((c) => c.id === task.columnId);
  return col?.name ?? 'Unknown';
}

export function isActive(task: Task, columns: KanbanColumn[]): boolean {
  return !task.archivedAt && !task.deletedAt;
}

export function isInProgress(task: Task, columns: KanbanColumn[]): boolean {
  return getSemanticStatus(task, columns) === 'in-progress';
}

export function isDone(task: Task, columns: KanbanColumn[]): boolean {
  return getSemanticStatus(task, columns) === 'done';
}

export function getSubtasks(taskId: string, allTasks: Task[]): Task[] {
  return allTasks.filter((t) => t.parentId === taskId && !t.deletedAt);
}

export function getSubtaskProgress(taskId: string, allTasks: Task[], columns: KanbanColumn[]): { done: number; total: number } {
  const subtasks = getSubtasks(taskId, allTasks);
  const done = subtasks.filter((t) => isDone(t, columns)).length;
  return { done, total: subtasks.length };
}

export function formatInProgressSince(isoString: string | undefined): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffMins = Math.floor(diffMs / 60000);

  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMins > 0) return `${diffMins}m ago`;
  return 'just now';
}

export function getColumnColor(column: KanbanColumn | undefined): string {
  const colorMap: Record<string, string> = {
    gray: 'bg-muted text-muted-foreground',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    green: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    red: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    yellow: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  };
  return colorMap[column?.color ?? 'gray'] ?? colorMap.gray;
}
