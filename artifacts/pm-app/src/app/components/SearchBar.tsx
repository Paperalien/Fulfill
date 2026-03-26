import { useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { SearchField, DateOperator, SearchState } from '../types/task';
import { useSearchShortcuts } from '../utils/useSearchShortcuts';

const FIELDS: { value: SearchField; label: string }[] = [
  { value: 'title', label: 'Title' },
  { value: 'description', label: 'Description' },
  { value: 'status', label: 'Status' },
  { value: 'storyPoints', label: 'Story Points' },
  { value: 'dueDate', label: 'Due Date' },
  { value: 'inProgressAt', label: 'In Progress Date' },
  { value: 'createdAt', label: 'Created Date' },
];

const DATE_FIELDS: SearchField[] = ['dueDate', 'inProgressAt', 'createdAt'];
const DATE_OPERATORS: { value: DateOperator; label: string }[] = [
  { value: 'eq', label: 'On' },
  { value: 'gt', label: 'After' },
  { value: 'lt', label: 'Before' },
  { value: 'gte', label: 'On or After' },
  { value: 'lte', label: 'On or Before' },
];

const STATUS_OPTIONS = [
  { value: 'todo', label: 'To Do' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
];

const STORY_POINT_OPTIONS = [1, 2, 3, 5, 8, 13, 21];

interface SearchBarProps {
  state: SearchState;
  onChange: (state: SearchState) => void;
}

export default function SearchBar({ state, onChange }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isMac = navigator.platform.toUpperCase().includes('MAC');
  const isDateField = DATE_FIELDS.includes(state.field);

  const handleClear = () => onChange({ ...state, value: '' });

  useSearchShortcuts(inputRef, state.value, handleClear);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.value = state.value;
    }
  }, [state.field]);

  const baseInput =
    'flex-1 px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground';

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        className="px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
        value={state.field}
        onChange={(e) =>
          onChange({ field: e.target.value as SearchField, value: '', dateOperator: 'eq' })
        }
        data-testid="search-field-select"
      >
        {FIELDS.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>

      {isDateField && (
        <select
          className="px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
          value={state.dateOperator}
          onChange={(e) => onChange({ ...state, dateOperator: e.target.value as DateOperator })}
          data-testid="search-date-operator"
        >
          {DATE_OPERATORS.map((op) => (
            <option key={op.value} value={op.value}>
              {op.label}
            </option>
          ))}
        </select>
      )}

      <div className="relative flex-1 min-w-[180px]">
        {state.field === 'status' ? (
          <select
            className={baseInput + ' w-full'}
            value={state.value}
            onChange={(e) => onChange({ ...state, value: e.target.value })}
            data-testid="search-status-select"
          >
            <option value="">Any status</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        ) : state.field === 'storyPoints' ? (
          <select
            className={baseInput + ' w-full'}
            value={state.value}
            onChange={(e) => onChange({ ...state, value: e.target.value })}
            data-testid="search-points-select"
          >
            <option value="">Any points</option>
            {STORY_POINT_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p} pts
              </option>
            ))}
          </select>
        ) : isDateField ? (
          <input
            ref={inputRef}
            type="date"
            className={baseInput + ' w-full'}
            value={state.value}
            onChange={(e) => onChange({ ...state, value: e.target.value })}
            data-testid="search-date-input"
          />
        ) : (
          <input
            ref={inputRef}
            type="text"
            className={baseInput + ' w-full pr-8'}
            placeholder={`Search by ${FIELDS.find((f) => f.value === state.field)?.label.toLowerCase()}… ${isMac ? '⌘F' : 'Ctrl+F'} or /`}
            value={state.value}
            onChange={(e) => onChange({ ...state, value: e.target.value })}
            data-testid="search-text-input"
          />
        )}

        {state.value && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            data-testid="search-clear-btn"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
