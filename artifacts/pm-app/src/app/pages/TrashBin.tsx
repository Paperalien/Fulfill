import { useState } from 'react';
import { Trash2, RefreshCw, AlertTriangle } from 'lucide-react';
import { useTaskContext } from '../contexts/TaskContext';
import { SearchState } from '../types/task';
import { filterTasks } from '../utils/searchUtils';
import SearchBar from '../components/SearchBar';

const DEFAULT_SEARCH: SearchState = { field: 'title', value: '', dateOperator: 'eq' };
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export default function TrashBin() {
  const { tasks, undeleteTask } = useTaskContext();
  const [search, setSearch] = useState<SearchState>(DEFAULT_SEARCH);

  const now = Date.now();
  const trashedTasks = tasks
    .filter((t) => {
      if (!t.deletedAt) return false;
      const age = now - new Date(t.deletedAt).getTime();
      return age < THIRTY_DAYS_MS;
    })
    .sort((a, b) => (b.deletedAt! > a.deletedAt! ? 1 : -1));

  const filtered = filterTasks(trashedTasks, search.field, search.value, search.dateOperator);

  const daysRemaining = (deletedAt: string) => {
    const ms = THIRTY_DAYS_MS - (now - new Date(deletedAt).getTime());
    return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Trash Bin</h2>
        <span className="text-sm text-muted-foreground">{trashedTasks.length} deleted task{trashedTasks.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="flex items-center gap-3 px-4 py-3 mb-4 border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 rounded-lg">
        <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
        <p className="text-sm text-amber-700 dark:text-amber-300">
          Deleted tasks are retained for 30 days, then permanently removed. Restore a task to save it.
        </p>
      </div>

      <div className="mb-4">
        <SearchBar state={search} onChange={setSearch} />
      </div>

      <div className="border border-border rounded-lg overflow-hidden bg-card">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <Trash2 size={40} className="mx-auto mb-3 opacity-20" />
            <p className="text-base">Trash is empty</p>
            <p className="text-sm mt-1">Deleted tasks will appear here for 30 days.</p>
          </div>
        ) : (
          filtered.map((task) => {
            const days = daysRemaining(task.deletedAt!);
            const isExpiringSoon = days <= 3;
            return (
              <div
                key={task.id}
                className="flex items-start gap-3 px-4 py-3 border-b border-border hover:bg-accent/20 transition-colors"
                data-testid={`trash-task-${task.id}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-muted-foreground line-through">{task.title}</p>
                  {task.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{task.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {task.storyPoints && (
                      <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                        {task.storyPoints} pts
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      isExpiringSoon
                        ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 font-medium'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {days} day{days !== 1 ? 's' : ''} remaining
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Deleted {task.deletedAt!.slice(0, 10)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => undeleteTask(task.id)}
                  className="flex items-center gap-1 text-xs px-2 py-1 border border-border rounded hover:bg-accent transition-colors shrink-0"
                  data-testid={`trash-restore-${task.id}`}
                >
                  <RefreshCw size={12} />
                  Restore
                </button>
              </div>
            );
          })
        )}
      </div>
      {filtered.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">{filtered.length} task{filtered.length !== 1 ? 's' : ''} shown</p>
      )}
    </div>
  );
}
