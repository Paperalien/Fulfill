import { Task, KanbanColumn, SearchField, DateOperator } from '../types/task';
import { getSemanticStatus } from './taskUtils';

function extractDate(value: string | undefined): string {
  if (!value) return '';
  return value.slice(0, 10);
}

function compareDates(taskDate: string, filterDate: string, operator: DateOperator): boolean {
  if (!taskDate || !filterDate) return false;
  const t = taskDate.slice(0, 10);
  const f = filterDate.slice(0, 10);
  switch (operator) {
    case 'eq': return t === f;
    case 'gt': return t > f;
    case 'lt': return t < f;
    case 'gte': return t >= f;
    case 'lte': return t <= f;
    default: return false;
  }
}

export function filterTasks(
  tasks: Task[],
  columns: KanbanColumn[],
  field: SearchField,
  value: string,
  dateOperator: DateOperator
): Task[] {
  if (!value.trim()) return tasks;

  return tasks.filter((task) => {
    switch (field) {
      case 'title':
        return task.title.toLowerCase().includes(value.toLowerCase());
      case 'description':
        return task.description.toLowerCase().includes(value.toLowerCase());
      case 'status': {
        const sem = getSemanticStatus(task, columns);
        // Allow matching semantic status or column name
        const col = columns.find((c) => c.id === task.columnId);
        return sem === value || col?.name.toLowerCase().includes(value.toLowerCase());
      }
      case 'storyPoints':
        return task.storyPoints !== undefined && task.storyPoints === Number(value);
      case 'dueDate':
        return compareDates(task.dueDate ?? '', value, dateOperator);
      case 'inProgressAt':
        return compareDates(extractDate(task.inProgressAt), value, dateOperator);
      case 'createdAt':
        return compareDates(extractDate(task.createdAt), value, dateOperator);
      case 'tags':
        return (task.tags ?? []).some((tag) => tag.toLowerCase().includes(value.toLowerCase()));
      default:
        return true;
    }
  });
}
