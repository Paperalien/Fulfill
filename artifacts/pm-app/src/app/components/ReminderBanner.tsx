import { X, Bell } from 'lucide-react';
import { useTaskContext } from '../contexts/TaskContext';
import { isReminderActive, computeReminderDate, todayStr } from '../utils/taskUtils';

export function ReminderBanner() {
  const { tasks, updateTask } = useTaskContext();

  const today = todayStr();
  const dueReminders = tasks.filter(
    (t) => !t.archivedAt && !t.deletedAt && isReminderActive(t)
  );

  if (dueReminders.length === 0) return null;

  function dismiss(taskId: string) {
    updateTask(taskId, { reminderDismissedAt: today });
  }

  function dismissAll() {
    dueReminders.forEach((t) => updateTask(t.id, { reminderDismissedAt: today }));
  }

  function daysDiff(dateStr: string): number {
    const target = new Date(dateStr);
    const now = new Date(today);
    return Math.round((now.getTime() - target.getTime()) / 86400000);
  }

  return (
    <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 px-4 py-2.5" data-testid="reminder-banner">
      <div className="flex items-start gap-2">
        <Bell size={14} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-amber-800 dark:text-amber-300 mb-1">
            {dueReminders.length} reminder{dueReminders.length > 1 ? 's' : ''} due
          </p>
          <ul className="flex flex-col gap-0.5">
            {dueReminders.map((task) => {
              const rd = computeReminderDate(task)!;
              const diff = daysDiff(rd);
              const label = diff === 0 ? 'today' : diff === 1 ? '1 day overdue' : `${diff} days overdue`;
              return (
                <li key={task.id} className="flex items-center gap-2">
                  <span className="text-xs text-amber-700 dark:text-amber-400 flex-1 min-w-0 truncate">
                    {task.title}
                    <span className="text-amber-500 dark:text-amber-500 ml-1">— {label}</span>
                  </span>
                  <button
                    onClick={() => dismiss(task.id)}
                    className="shrink-0 text-amber-500 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
                    title="Dismiss for today"
                    data-testid={`reminder-dismiss-${task.id}`}
                  >
                    <X size={12} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        {dueReminders.length > 1 && (
          <button
            onClick={dismissAll}
            className="shrink-0 text-xs text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200 underline"
            data-testid="reminder-dismiss-all"
          >
            Dismiss all
          </button>
        )}
      </div>
    </div>
  );
}
