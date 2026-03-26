import { useState } from 'react';
import { ArchiveX, Trash2 } from 'lucide-react';
import { useTaskContext } from '../contexts/TaskContext';
import { SearchState } from '../types/task';
import { filterTasks } from '../utils/searchUtils';
import SearchBar from '../components/SearchBar';

const DEFAULT_SEARCH: SearchState = { field: 'title', value: '', dateOperator: 'eq' };

export default function DoneFolder() {
  const { tasks, sprints, unarchiveTask, deleteTask } = useTaskContext();
  const [search, setSearch] = useState<SearchState>(DEFAULT_SEARCH);

  const archivedTasks = tasks
    .filter((t) => t.archivedAt && !t.deletedAt)
    .sort((a, b) => (b.archivedAt! > a.archivedAt! ? 1 : -1));

  const filtered = filterTasks(archivedTasks, search.field, search.value, search.dateOperator);

  const getSprintName = (sprintId?: string) =>
    sprintId ? (sprints.find((s) => s.id === sprintId)?.name ?? 'Unknown sprint') : null;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Done Folder</h2>
        <span className="text-sm text-muted-foreground">{archivedTasks.length} archived task{archivedTasks.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="mb-4">
        <SearchBar state={search} onChange={setSearch} />
      </div>

      <div className="border border-border rounded-lg overflow-hidden bg-card">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <ArchiveX size={40} className="mx-auto mb-3 opacity-20" />
            <p className="text-base">No archived tasks</p>
            <p className="text-sm mt-1">Archive completed tasks from any view to see them here.</p>
          </div>
        ) : (
          filtered.map((task) => {
            const sprintName = getSprintName(task.sprintId);
            return (
              <div
                key={task.id}
                className="flex items-start gap-3 px-4 py-3 border-b border-border hover:bg-accent/20 transition-colors group"
                data-testid={`done-task-${task.id}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium line-through text-muted-foreground">{task.title}</p>
                  {task.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{task.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {sprintName && (
                      <span className="text-xs bg-accent text-accent-foreground px-2 py-0.5 rounded-full">
                        {sprintName}
                      </span>
                    )}
                    {task.storyPoints && (
                      <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                        {task.storyPoints} pts
                      </span>
                    )}
                    {task.archivedAt && (
                      <span className="text-xs text-muted-foreground">
                        Archived {task.archivedAt.slice(0, 10)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => unarchiveTask(task.id)}
                    className="text-xs px-2 py-1 border border-border rounded hover:bg-accent transition-colors"
                    data-testid={`done-unarchive-${task.id}`}
                  >
                    Unarchive
                  </button>
                  <button
                    onClick={() => deleteTask(task.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-opacity"
                    data-testid={`done-delete-${task.id}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
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
