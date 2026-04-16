import { useRef, useEffect } from 'react';
import { SearchState, SearchField, DateOperator, SortOrder } from '../types/task';
import { SORT_FIELD_LABELS, getSortLabel } from '../utils/sortUtils';

interface Props {
  search: SearchState;
  onSearchChange: (s: SearchState) => void;
  sortField: SearchField;
  sortOrder: SortOrder;
  onSortChange: (field: SearchField, order: SortOrder) => void;
  showSort?: boolean;
}

const DATE_FIELDS: SearchField[] = ['dueDate', 'inProgressAt', 'createdAt'];
const DATE_OPERATORS: { value: DateOperator; label: string }[] = [
  { value: 'eq', label: '= on' },
  { value: 'gt', label: '> after' },
  { value: 'lt', label: '< before' },
  { value: 'gte', label: '≥ on/after' },
  { value: 'lte', label: '≤ on/before' },
];

const FIELD_OPTIONS: { value: SearchField; label: string }[] = [
  { value: 'title', label: 'Title' },
  { value: 'notes', label: 'Notes' },
  { value: 'status', label: 'Status' },
  { value: 'tags', label: 'Tags' },
  { value: 'storyPoints', label: 'Story Points' },
  { value: 'dueDate', label: 'Due Date' },
  { value: 'inProgressAt', label: 'In Progress Since' },
  { value: 'createdAt', label: 'Created Date' },
];

export function SearchBar({ search, onSearchChange, sortField, sortOrder, onSortChange, showSort = true }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isDate = DATE_FIELDS.includes(search.field);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (
        (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key === 'f')) &&
        !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === 'Escape') {
        inputRef.current?.blur();
        onSearchChange({ ...search, value: '' });
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [search, onSearchChange]);

  function cycleSortOrder() {
    if (sortField !== search.field) {
      onSortChange(search.field, 'asc');
    } else {
      onSortChange(sortField, sortOrder === 'asc' ? 'desc' : 'asc');
    }
  }

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {/* Field selector */}
      <select
        value={search.field}
        onChange={(e) => onSearchChange({ ...search, field: e.target.value as SearchField, value: '' })}
        className="h-9 rounded-md border border-border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {FIELD_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      {/* Date operator */}
      {isDate && (
        <select
          value={search.dateOperator}
          onChange={(e) => onSearchChange({ ...search, dateOperator: e.target.value as DateOperator })}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {DATE_OPERATORS.map((op) => (
            <option key={op.value} value={op.value}>{op.label}</option>
          ))}
        </select>
      )}

      {/* Search input */}
      <div className="relative flex-1 min-w-48">
        <input
          ref={inputRef}
          type={isDate ? 'date' : search.field === 'storyPoints' ? 'number' : 'text'}
          value={search.value}
          onChange={(e) => onSearchChange({ ...search, value: e.target.value })}
          placeholder={
            search.field === 'status'
              ? 'not-started, in-progress, done, or column name…'
              : search.field === 'tags'
              ? 'Filter by tag…'
              : `Search by ${SORT_FIELD_LABELS[search.field].toLowerCase()}… (/ or ⌘F)`
          }
          className="h-9 w-full rounded-md border border-border bg-background px-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {search.value && (
          <button
            onClick={() => onSearchChange({ ...search, value: '' })}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-lg leading-none"
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {/* Sort */}
      {showSort && (
        <button
          onClick={cycleSortOrder}
          className="h-9 px-3 rounded-md border border-border bg-background text-sm hover:bg-muted transition-colors flex items-center gap-1"
          title="Toggle sort"
        >
          <span className="text-muted-foreground">Sort:</span>
          <span className="font-medium">{SORT_FIELD_LABELS[sortField]}</span>
          <span className="text-muted-foreground text-xs">{getSortLabel(sortField, sortOrder)}</span>
          <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
        </button>
      )}
    </div>
  );
}
