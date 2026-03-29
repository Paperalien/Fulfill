import { Task, KanbanColumn } from '../types/task';
import { getSemanticStatus, getColumnName, formatInProgressSince } from '../utils/taskUtils';

interface Props {
  task: Task;
  columns: KanbanColumn[];
  className?: string;
}

export function InProgressBadge({ task, columns, className = '' }: Props) {
  const sem = getSemanticStatus(task, columns);
  if (sem !== 'in-progress') return null;

  const colName = getColumnName(task, columns);
  const since = formatInProgressSince(task.inProgressAt);

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200 ${className}`}
      title={task.inProgressAt ? `In progress since ${new Date(task.inProgressAt).toLocaleString()}` : undefined}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
      {colName}
      {since && <span className="opacity-70">· {since}</span>}
    </span>
  );
}
