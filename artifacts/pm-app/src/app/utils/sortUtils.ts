import { Task, KanbanColumn, SearchField, SortOrder } from '../types/task';
import { getSemanticStatus } from './taskUtils';

export function sortTasksByField(
  tasks: Task[],
  columns: KanbanColumn[],
  field: SearchField,
  order: SortOrder
): Task[] {
  return [...tasks].sort((a, b) => {
    let aVal: string | number = '';
    let bVal: string | number = '';

    switch (field) {
      case 'title':
        aVal = a.title.toLowerCase();
        bVal = b.title.toLowerCase();
        break;
      case 'notes':
        aVal = a.notes.toLowerCase();
        bVal = b.notes.toLowerCase();
        break;
      case 'status': {
        const semOrder = ['not-started', 'in-progress', 'done'];
        aVal = semOrder.indexOf(getSemanticStatus(a, columns));
        bVal = semOrder.indexOf(getSemanticStatus(b, columns));
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
      case 'tags':
        aVal = (a.tags ?? []).join(',').toLowerCase();
        bVal = (b.tags ?? []).join(',').toLowerCase();
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
    case 'notes':
      return order === 'asc' ? 'A→Z' : 'Z→A';
    case 'status':
      return order === 'asc' ? 'Not Started→Done' : 'Done→Not Started';
    case 'storyPoints':
      return order === 'asc' ? 'Low→High' : 'High→Low';
    case 'tags':
      return order === 'asc' ? 'A→Z' : 'Z→A';
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
  notes: 'Notes',
  status: 'Status',
  storyPoints: 'Story Points',
  dueDate: 'Due Date',
  inProgressAt: 'In Progress Date',
  createdAt: 'Created Date',
  tags: 'Tags',
};
