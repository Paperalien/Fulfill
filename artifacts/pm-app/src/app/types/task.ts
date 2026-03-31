export type SemanticStatus = 'not-started' | 'in-progress' | 'done';

export interface KanbanColumn {
  id: string;
  name: string;
  order: number;
  semanticStatus: SemanticStatus;
  color?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  columnId: string;           // Which kanban column this task is in
  storyPoints?: number;       // Fibonacci: 1, 2, 3, 5, 8, 13, 21
  createdAt: string;          // ISO timestamp
  updatedAt: string;          // ISO timestamp
  sprintId?: string;
  order: number;
  archivedAt?: string;        // Set when moved to Done folder
  deletedAt?: string;         // Set when soft-deleted to Trash
  dueDate?: string;           // YYYY-MM-DD
  inProgressAt?: string;      // Set when moved to an in-progress column
  parentId?: string;          // Single parent task (subtask tree)
  predecessorIds?: string[];  // Tasks that must complete before this one
  tags?: string[];            // Many-to-many labels
  notes?: string;             // Unstructured free text, unversioned
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
  | 'createdAt'
  | 'tags';

export type DateOperator = 'eq' | 'gt' | 'lt' | 'gte' | 'lte';

export interface SearchState {
  field: SearchField;
  value: string;
  dateOperator: DateOperator;
}

export type SortOrder = 'asc' | 'desc';

// Default columns (used for initial seed)
export const DEFAULT_COLUMNS: KanbanColumn[] = [
  { id: 'col-todo', name: 'To Do', order: 0, semanticStatus: 'not-started', color: 'gray' },
  { id: 'col-in-progress', name: 'In Progress', order: 1, semanticStatus: 'in-progress', color: 'blue' },
  { id: 'col-in-review', name: 'In Review', order: 2, semanticStatus: 'in-progress', color: 'purple' },
  { id: 'col-done', name: 'Done', order: 3, semanticStatus: 'done', color: 'green' },
];
