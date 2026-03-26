import { Task, SearchField, SortOrder } from '../types/task';

export function sortTasksByField(tasks: Task[], field: SearchField, order: SortOrder): Task[] {
  return [...tasks].sort((a, b) => {
    let aVal: string | number = '';
    let bVal: string | number = '';

    switch (field) {
      case 'title':
        aVal = a.title.toLowerCase();
        bVal = b.title.toLowerCase();
        break;
      case 'description':
        aVal = a.description.toLowerCase();
        bVal = b.description.toLowerCase();
        break;
      case 'status': {
        const order_ = ['todo', 'in-progress', 'done'];
        aVal = order_.indexOf(a.status);
        bVal = order_.indexOf(b.status);
        break;
      }
      case 'storyPoints':
        aVal = a.storyPoints ?? -1;
        bVal = b.storyPoints ?? -1;
        break;
      case 'dueDate':
        aVal = a.dueDate ?? '';
        bVal = b.dueDate ?? '';
        break;
      case 'inProgressAt':
        aVal = a.inProgressAt?.slice(0, 10) ?? '';
        bVal = b.inProgressAt?.slice(0, 10) ?? '';
        break;
      case 'createdAt':
        aVal = a.createdAt?.slice(0, 10) ?? '';
        bVal = b.createdAt?.slice(0, 10) ?? '';
        break;
      default:
        aVal = a.order;
        bVal = b.order;
    }

    if (aVal < bVal) return order === 'asc' ? -1 : 1;
    if (aVal > bVal) return order === 'asc' ? 1 : -1;
    return 0;
  });
}

export function getSortLabel(field: SearchField, order: SortOrder): string {
  switch (field) {
    case 'title':
    case 'description':
      return order === 'asc' ? 'A→Z' : 'Z→A';
    case 'status':
      return order === 'asc' ? 'To Do→Done' : 'Done→To Do';
    case 'storyPoints':
      return order === 'asc' ? 'Low→High' : 'High→Low';
    case 'dueDate':
    case 'inProgressAt':
    case 'createdAt':
      return order === 'asc' ? 'Oldest→Newest' : 'Newest→Oldest';
    default:
      return order === 'asc' ? 'Asc' : 'Desc';
  }
}

export const SORT_FIELD_LABELS: Record<SearchField, string> = {
  title: 'Title',
  description: 'Description',
  status: 'Status',
  storyPoints: 'Story Points',
  dueDate: 'Due Date',
  inProgressAt: 'In Progress Date',
  createdAt: 'Created Date',
};
