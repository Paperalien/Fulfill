import { Task, KanbanColumn } from '../types/task';
import { getSemanticStatus, getColumnName, formatInProgressSince } from '../utils/taskUtils';

interface Props {
  task: Task;
  columns: KanbanColumn[];
  className?: string;
  onClick?: () => void;
}

export function InProgressBadge({ task, columns, className = '', onClick }: Props) {
  const sem = getSemanticStatus(task, columns);

  const handleClick = onClick
    ? (e: React.MouseEvent) => { e.stopPropagation(); onClick(); }
    : undefined;

  if (onClick && sem === 'not-started') {
    return (
      <button
        onClick={handleClick}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-muted-foreground border border-border/60 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
        title="Mark in progress"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
        not started
      </button>
    );
  }

  if (sem !== 'in-progress') return null;

  const colName = getColumnName(task, columns);
  const since = formatInProgressSince(task.inProgressAt);

  const inner = (
    <>
      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
      {colName}
      {since && <span className="opacity-70">· {since}</span>}
    </>
  );

  if (onClick) {
    return (
      <button
        onClick={handleClick}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200 hover:bg-blue-200 transition-colors ${className}`}
        title={task.inProgressAt ? `In progress since ${new Date(task.inProgressAt).toLocaleString()} · click to revert` : 'Click to revert'}
      >
        {inner}
      </button>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200 ${className}`}
      title={task.inProgressAt ? `In progress since ${new Date(task.inProgressAt).toLocaleString()}` : undefined}
    >
      {inner}
    </span>
  );
}
