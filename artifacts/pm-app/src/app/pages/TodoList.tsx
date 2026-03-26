import { useState } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, Archive } from 'lucide-react';
import { useTaskContext } from '../contexts/TaskContext';
import { Task, SearchState, SortOrder, SearchField } from '../types/task';
import { filterTasks } from '../utils/searchUtils';
import { sortTasksByField, getSortLabel, SORT_FIELD_LABELS } from '../utils/sortUtils';
import SearchBar from '../components/SearchBar';
import TaskFields from '../components/TaskFields';

const DEFAULT_SEARCH: SearchState = { field: 'title', value: '', dateOperator: 'eq' };

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    todo: 'bg-muted text-muted-foreground',
    'in-progress': 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    done: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  };
  const labels: Record<string, string> = { todo: 'To Do', 'in-progress': 'In Progress', done: 'Done' };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status]}`}>
      {labels[status]}
    </span>
  );
}

function TaskRow({ task }: { task: Task }) {
  const { updateTask, deleteTask } = useTaskContext();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [storyPoints, setStoryPoints] = useState(task.storyPoints);
  const [dueDate, setDueDate] = useState(task.dueDate ?? '');

  const isDone = task.status === 'done';

  const handleCheck = () => {
    updateTask(task.id, { status: isDone ? 'todo' : 'done' });
  };

  const handleSave = () => {
    updateTask(task.id, {
      title,
      description,
      storyPoints,
      dueDate: dueDate || undefined,
    });
    setEditing(false);
  };

  return (
    <div
      className="flex items-start gap-3 px-4 py-3 border-b border-border hover:bg-accent/20 transition-colors group"
      data-testid={`task-row-${task.id}`}
    >
      <input
        type="checkbox"
        checked={isDone}
        onChange={handleCheck}
        className="mt-1 h-4 w-4 rounded border-border cursor-pointer"
        data-testid={`checkbox-${task.id}`}
      />
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex flex-col gap-2">
            <input
              className="w-full px-2 py-1 text-sm border border-border rounded bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="edit-title-input"
            />
            <textarea
              className="w-full px-2 py-1 text-sm border border-border rounded bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              data-testid="edit-description-input"
            />
            <TaskFields
              storyPoints={storyPoints}
              dueDate={dueDate}
              onStoryPointsChange={setStoryPoints}
              onDueDateChange={setDueDate}
            />
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:opacity-90"
                data-testid="edit-save-btn"
              >
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                className="px-3 py-1 text-xs border border-border rounded hover:bg-accent"
                data-testid="edit-cancel-btn"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div
            className="cursor-pointer"
            onClick={() => setEditing(true)}
            data-testid={`task-title-${task.id}`}
          >
            <p className={`text-sm font-medium ${isDone ? 'line-through text-muted-foreground' : ''}`}>
              {task.title}
            </p>
            {task.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{task.description}</p>
            )}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <StatusBadge status={task.status} />
              {task.storyPoints && (
                <span className="text-xs bg-accent text-accent-foreground px-2 py-0.5 rounded-full">
                  {task.storyPoints} pts
                </span>
              )}
              {task.dueDate && (
                <span className="text-xs text-muted-foreground">Due {task.dueDate}</span>
              )}
            </div>
          </div>
        )}
      </div>
      <button
        onClick={() => deleteTask(task.id)}
        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0 mt-0.5"
        data-testid={`delete-task-${task.id}`}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export default function TodoList() {
  const { tasks, addTask, archiveDoneTasks } = useTaskContext();
  const [search, setSearch] = useState<SearchState>(DEFAULT_SEARCH);
  const [sortField, setSortField] = useState<SearchField>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPoints, setNewPoints] = useState<number | undefined>();
  const [newDue, setNewDue] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  const activeTasks = tasks.filter((t) => !t.archivedAt && !t.deletedAt);
  const filtered = filterTasks(activeTasks, search.field, search.value, search.dateOperator);
  const sorted = sortTasksByField(filtered, sortField, sortOrder);
  const doneActive = activeTasks.filter((t) => t.status === 'done');

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    addTask({
      title: newTitle,
      description: newDesc,
      status: 'todo',
      storyPoints: newPoints,
      dueDate: newDue || undefined,
    });
    setNewTitle('');
    setNewDesc('');
    setNewPoints(undefined);
    setNewDue('');
    setShowAddForm(false);
  };

  const toggleSort = (field: SearchField) => {
    if (sortField === field) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">To-Do List</h2>
        <div className="flex gap-2">
          {doneActive.length > 0 && (
            <button
              onClick={() => archiveDoneTasks()}
              className="flex items-center gap-2 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-accent"
              data-testid="archive-done-btn"
            >
              <Archive size={14} />
              Archive {doneActive.length} Done
            </button>
          )}
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90"
            data-testid="add-task-btn"
          >
            <Plus size={14} />
            Add Task
          </button>
        </div>
      </div>

      {showAddForm && (
        <div className="mb-4 p-4 border border-border rounded-lg bg-card">
          <div className="flex flex-col gap-3">
            <input
              className="px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Task title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              autoFocus
              data-testid="new-task-title"
            />
            <textarea
              className="px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              placeholder="Description (optional)"
              rows={2}
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              data-testid="new-task-description"
            />
            <TaskFields
              storyPoints={newPoints}
              dueDate={newDue}
              onStoryPointsChange={setNewPoints}
              onDueDateChange={setNewDue}
            />
            <div className="flex gap-2">
              <button
                onClick={handleAdd}
                className="px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90"
                data-testid="add-task-submit-btn"
              >
                Add
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="px-4 py-1.5 text-sm border border-border rounded-md hover:bg-accent"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-3 flex flex-col gap-2">
        <SearchBar state={search} onChange={setSearch} />
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Sort by:</span>
          {(['title', 'status', 'storyPoints', 'dueDate', 'createdAt'] as SearchField[]).map((f) => (
            <button
              key={f}
              onClick={() => toggleSort(f)}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors ${
                sortField === f
                  ? 'bg-primary/10 border-primary text-primary'
                  : 'border-border hover:bg-accent'
              }`}
              data-testid={`sort-${f}`}
            >
              {SORT_FIELD_LABELS[f]}
              {sortField === f &&
                (sortOrder === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
            </button>
          ))}
          {sortField && (
            <span className="text-xs text-muted-foreground">
              ({getSortLabel(sortField, sortOrder)})
            </span>
          )}
        </div>
      </div>

      <div className="border border-border rounded-lg overflow-hidden bg-card">
        {sorted.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <p>No tasks found.</p>
            <p className="text-sm mt-1">Add a task above or clear the search filter.</p>
          </div>
        ) : (
          sorted.map((task) => <TaskRow key={task.id} task={task} />)
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {sorted.length} task{sorted.length !== 1 ? 's' : ''} shown
      </p>
    </div>
  );
}
