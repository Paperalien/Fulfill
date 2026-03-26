export type TaskStatus = 'todo' | 'in-progress' | 'done';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  storyPoints?: number;
  createdAt: string;
  updatedAt: string;
  sprintId?: string;
  order: number;
  archivedAt?: string;
  deletedAt?: string;
  dueDate?: string;
  inProgressAt?: string;
}

export interface Sprint {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export type SearchField =
  | 'title'
  | 'description'
  | 'status'
  | 'storyPoints'
  | 'dueDate'
  | 'inProgressAt'
  | 'createdAt';

export type DateOperator = 'eq' | 'gt' | 'lt' | 'gte' | 'lte';

export interface SearchState {
  field: SearchField;
  value: string;
  dateOperator: DateOperator;
}

export type SortOrder = 'asc' | 'desc';
