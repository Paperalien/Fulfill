import { useState } from 'react';
import { Plus, Trash2, Archive, Bell, RefreshCw } from 'lucide-react';
import { useTaskContext } from '../contexts/TaskContext';
import { Task, SearchState, SortOrder, SearchField } from '../types/task';
import { filterTasks } from '../utils/searchUtils';
import { sortTasksByField } from '../utils/sortUtils';
import { getSubtasks, getSubtaskProgress, isReminderActive } from '../utils/taskUtils';
import { SearchBar } from '../components/SearchBar';
import { TagBadge, TagInput } from '../components/TagInput';
import { InProgressBadge } from '../components/InProgressBadge';
import TaskFields from '../components/TaskFields';
import ReminderRecurrenceFields from '../components/ReminderRecurrenceFields';

const DEFAULT_SEARCH: SearchState = { field: 'title', value: '', dateOperator: 'eq' };

function SubtaskRow({ task }: { task: Task }) {
  const { updateTask, deleteTask, columns } = useTaskContext();
  const doneCols = new Set(columns.filter((c) => c.semanticStatus === 'done').map((c) => c.id));
  const todoColId = columns.find((c) => c.semanticStatus === 'not-started')?.id ?? columns[0]?.id;
  const doneColId = columns.find((c) => c.semanticStatus === 'done')?.id ?? columns[columns.length - 1]?.id;
  const isTaskDone = doneCols.has(task.columnId);

  return (
    <div className="flex items-center gap-2 py-1.5 group">
      <input
        type="checkbox"
        checked={isTaskDone}
        onChange={() => updateTask(task.id, { columnId: isTaskDone ? todoColId : doneColId })}
        className="h-3.5 w-3.5 rounded border-border cursor-pointer shrink-0"
      />
      <p className={`text-sm flex-1 ${isTaskDone ? 'line-through text-muted-foreground' : ''}`}>
        {task.title}
      </p>
      {(task.tags ?? []).map((tag) => <TagBadge key={tag} tag={tag} />)}
      <button
        onClick={() => deleteTask(task.id)}
        aria-label="Delete step"
        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function TaskRow({ task, allTasks }: { task: Task; allTasks: Task[] }) {
  const { updateTask, deleteTask, addTask, columns, doneColumnIds } = useTaskContext();
  const [editing, setEditing] = useState(false);
  const [subtaskTitle, setSubtaskTitle] = useState('');

  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [storyPoints, setStoryPoints] = useState(task.storyPoints);
  const [dueDate, setDueDate] = useState(task.dueDate ?? '');
  const [tags, setTags] = useState(task.tags ?? []);
  const [reminder, setReminder] = useState(task.reminder);
  const [recurrence, setRecurrence] = useState(task.recurrence);

  const doneCols = new Set(doneColumnIds());
  const todoColId = columns.find((c) => c.semanticStatus === 'not-started')?.id ?? columns[0]?.id;
  const doneColId = columns.find((c) => c.semanticStatus === 'done')?.id ?? columns[columns.length - 1]?.id;
  const inProgressColId = columns.find((c) => c.semanticStatus === 'in-progress')?.id;
  const isTaskDone = doneCols.has(task.columnId);

  const subtasks = getSubtasks(task.id, allTasks);
  const { done: subtasksDone, total: subtasksTotal } = getSubtaskProgress(task.id, allTasks, columns);

  const handleCheck = () => {
    updateTask(task.id, { columnId: isTaskDone ? todoColId : doneColId });
  };

  const handleSave = () => {
    updateTask(task.id, { title, notes, storyPoints, dueDate: dueDate || undefined, tags, reminder, recurrence });
    setEditing(false);
  };

  const handleToggleInProgress = () => {
    const col = columns.find((c) => c.id === task.columnId);
    if (col?.semanticStatus === 'in-progress') {
      updateTask(task.id, { columnId: todoColId });
    } else if (col?.semanticStatus === 'not-started' && inProgressColId) {
      updateTask(task.id, { columnId: inProgressColId });
    }
  };

  const handleAddSubtask = () => {
    if (!subtaskTitle.trim()) return;
    addTask({
      title: subtaskTitle,
      notes: '',
      columnId: todoColId ?? 'col-todo',
      parentId: task.id,
      tags: [],
    });
    setSubtaskTitle('');
  };

  const handleOpen = () => {
    setTitle(task.title);
    setNotes(task.notes);
    setStoryPoints(task.storyPoints);
    setDueDate(task.dueDate ?? '');
    setTags(task.tags ?? []);
    setReminder(task.reminder);
    setRecurrence(task.recurrence);
    setEditing(true);
  };

  return (
    <>
      {/* Compact row */}
      <div
        id={`task-${task.id}`}
        className="flex items-start gap-3 px-4 py-3 border-b border-border hover:bg-accent/20 transition-colors group"
        data-testid={`task-row-${task.id}`}
      >
        <input
          type="checkbox"
          checked={isTaskDone}
          onChange={handleCheck}
          className="mt-1 h-4 w-4 rounded border-border cursor-pointer shrink-0"
          data-testid={`checkbox-${task.id}`}
        />

        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={handleOpen}
          data-testid={`task-title-${task.id}`}
        >
          <p className={`text-sm font-medium ${isTaskDone ? 'line-through text-muted-foreground' : ''}`}>
            {task.title}
          </p>
          {task.notes && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{task.notes}</p>
          )}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <InProgressBadge task={task} columns={columns} onClick={handleToggleInProgress} />
            {task.storyPoints && (
              <span className="text-xs bg-accent text-accent-foreground px-2 py-0.5 rounded-full">
                {task.storyPoints} pts
              </span>
            )}
            {task.dueDate && (
              <span className="text-xs text-muted-foreground">Due {task.dueDate}</span>
            )}
            {task.recurrence && (
              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                <RefreshCw size={10} /> {task.recurrence}
              </span>
            )}
            {task.reminder && (
              <span className={`text-xs flex items-center gap-0.5 ${isReminderActive(task) ? 'text-amber-600 font-medium' : 'text-muted-foreground'}`}>
                <Bell size={10} />
                {isReminderActive(task) ? 'reminder due' : task.reminder === 'day-before' ? 'day before' : task.reminder === 'on-due-date' ? 'on due date' : task.reminder}
              </span>
            )}
            {subtasksTotal > 0 && (
              <span className="text-xs text-muted-foreground">
                {subtasksDone}/{subtasksTotal} steps
              </span>
            )}
            {(task.tags ?? []).map((tag) => <TagBadge key={tag} tag={tag} />)}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          <button
            onClick={() => deleteTask(task.id)}
            aria-label="Delete task"
            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
            data-testid={`delete-task-${task.id}`}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Accordion — edit fields + steps */}
      {editing && (
        <div className="border-b border-border bg-muted/20 px-4 py-4 flex flex-col gap-3">
          <input
            autoFocus
            className="w-full px-2 py-1 text-sm border border-border rounded bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            data-testid="edit-title-input"
          />
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
            <textarea
              className="w-full px-2 py-1 text-sm border border-border rounded bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              rows={2}
              placeholder="Notes, context, details…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              data-testid="edit-description-input"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Tags</label>
            <TagInput tags={tags} onChange={setTags} />
          </div>
          <TaskFields
            storyPoints={storyPoints}
            dueDate={dueDate}
            onStoryPointsChange={setStoryPoints}
            onDueDateChange={setDueDate}
          />
          <ReminderRecurrenceFields
            reminder={reminder}
            recurrence={recurrence}
            onReminderChange={setReminder}
            onRecurrenceChange={setRecurrence}
          />

          {/* Steps section */}
          <div className="border-t border-border/40 pt-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Steps</p>
            {subtasks.length > 0 && (
              <div className="mb-2 flex flex-col gap-0.5">
                {subtasks.map((sub) => <SubtaskRow key={sub.id} task={sub} />)}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Plus size={13} className="text-muted-foreground shrink-0" />
              <input
                value={subtaskTitle}
                onChange={(e) => setSubtaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddSubtask();
                }}
                placeholder="Add a step…"
                className="flex-1 text-sm py-1 bg-transparent border-b border-border/60 focus:border-primary focus:outline-none placeholder:text-muted-foreground/60"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={handleSave} className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:opacity-90" data-testid="edit-save-btn">Save</button>
            <button onClick={() => setEditing(false)} className="px-3 py-1 text-xs border border-border rounded hover:bg-accent" data-testid="edit-cancel-btn">Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}

export default function TodoList() {
  const { tasks, columns, addTask, archiveDoneTasks, doneColumnIds } = useTaskContext();
  const [search, setSearch] = useState<SearchState>(DEFAULT_SEARCH);
  const [sortField, setSortField] = useState<SearchField>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const [newTitle, setNewTitle] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newPoints, setNewPoints] = useState<number | undefined>();
  const [newDue, setNewDue] = useState('');
  const [newTags, setNewTags] = useState<string[]>([]);
  const [newReminder, setNewReminder] = useState<Task['reminder']>(undefined);
  const [newRecurrence, setNewRecurrence] = useState<Task['recurrence']>(undefined);
  const [showInlineAdd, setShowInlineAdd] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const todoColId = columns.find((c) => c.semanticStatus === 'not-started')?.id ?? columns[0]?.id ?? 'col-todo';

  const activeTasks = tasks.filter((t) => !t.archivedAt && !t.deletedAt && !t.parentId);
  const filtered = filterTasks(activeTasks, columns, search.field, search.value, search.dateOperator);
  const sorted = sortTasksByField(filtered, columns, sortField, sortOrder);

  const doneColIds = new Set(doneColumnIds());
  const doneActive = activeTasks.filter((t) => doneColIds.has(t.columnId));

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    addTask({ title: newTitle, notes: newNotes, columnId: todoColId, storyPoints: newPoints, dueDate: newDue || undefined, tags: newTags, reminder: newReminder, recurrence: newRecurrence });
    setNewTitle('');
    setNewNotes('');
    setNewPoints(undefined);
    setNewDue('');
    setNewTags([]);
    setNewReminder(undefined);
    setNewRecurrence(undefined);
    setShowDetails(false);
  };

  const handleCloseInlineAdd = () => {
    setShowInlineAdd(false);
    setShowDetails(false);
    setNewTitle('');
    setNewNotes('');
    setNewPoints(undefined);
    setNewDue('');
    setNewTags([]);
    setNewReminder(undefined);
    setNewRecurrence(undefined);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">To-Do List</h2>
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
      </div>

      <div className="mb-3">
        <SearchBar
          search={search}
          onSearchChange={setSearch}
          sortField={sortField}
          sortOrder={sortOrder}
          onSortChange={(f, o) => { setSortField(f); setSortOrder(o); }}
        />
      </div>

      <div className="border border-border rounded-lg overflow-hidden bg-card">
        {sorted.length === 0 && !showInlineAdd ? (
          <div className="py-12 text-center text-muted-foreground">
            <p>No tasks found.</p>
            <p className="text-sm mt-1">Add a task below or clear the search filter.</p>
          </div>
        ) : (
          sorted.map((task) => <TaskRow key={task.id} task={task} allTasks={tasks} />)
        )}

        {/* Inline add form */}
        {showInlineAdd ? (
          <div className="px-4 py-3 border-t border-border bg-card">
            <input
              autoFocus
              className="w-full px-2 py-1.5 text-sm border border-border rounded bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Task title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd();
                if (e.key === 'Escape') handleCloseInlineAdd();
              }}
              data-testid="new-task-title"
            />
            {showDetails && (
              <div className="mt-3 flex flex-col gap-3">
                <textarea
                  className="w-full px-2 py-1.5 text-sm border border-border rounded bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  placeholder="Notes (optional)"
                  rows={2}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  data-testid="new-task-description"
                />
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Tags</label>
                  <TagInput tags={newTags} onChange={setNewTags} />
                </div>
                <TaskFields storyPoints={newPoints} dueDate={newDue} onStoryPointsChange={setNewPoints} onDueDateChange={setNewDue} />
                <ReminderRecurrenceFields reminder={newReminder} recurrence={newRecurrence} onReminderChange={setNewReminder} onRecurrenceChange={setNewRecurrence} />
              </div>
            )}
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => setShowDetails((v) => !v)}
                className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors"
              >
                Details {showDetails ? '▲' : '▼'}
              </button>
              <div className="flex-1" />
              <button
                onClick={handleAdd}
                className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:opacity-90"
                data-testid="add-task-submit-btn"
              >
                Add
              </button>
              <button
                onClick={handleCloseInlineAdd}
                className="px-3 py-1 text-xs border border-border rounded hover:bg-accent"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowInlineAdd(true)}
            className="flex items-center gap-2 w-full px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/20 transition-colors border-t border-border/50"
            data-testid="add-task-btn"
          >
            <Plus size={14} />
            Add a task…
          </button>
        )}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {sorted.length} task{sorted.length !== 1 ? 's' : ''} shown
      </p>
    </div>
  );
}
