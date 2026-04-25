import { useState } from 'react';
import { Plus, Trash2, Archive, ChevronRight, ChevronDown, Bell, RefreshCw } from 'lucide-react';
import { useTaskContext } from '../contexts/TaskContext';
import { Task, SearchState, SortOrder, SearchField } from '../types/task';
import { filterTasks } from '../utils/searchUtils';
import { sortTasksByField } from '../utils/sortUtils';
import { getSubtasks, getSubtaskProgress, isDone, isReminderActive } from '../utils/taskUtils';
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
    <div className="flex items-center gap-2 pl-8 pr-4 py-2 border-b border-border/50 bg-muted/20 hover:bg-accent/10 transition-colors group">
      <input
        type="checkbox"
        checked={isTaskDone}
        onChange={() => updateTask(task.id, { columnId: isTaskDone ? todoColId : doneColId })}
        className="h-3.5 w-3.5 rounded border-border cursor-pointer shrink-0"
      />
      <p className={`text-sm flex-1 ${isTaskDone ? 'line-through text-muted-foreground' : ''}`}>
        {task.title}
      </p>
      <InProgressBadge task={task} columns={columns} />
      {(task.tags ?? []).map((tag) => <TagBadge key={tag} tag={tag} />)}
      <button
        onClick={() => deleteTask(task.id)}
        aria-label="Delete subtask"
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
  const [expanded, setExpanded] = useState(false);
  const [showSubtaskInput, setShowSubtaskInput] = useState(false);
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
    setShowSubtaskInput(false);
    setExpanded(true);
  };

  return (
    <>
      <div
        id={`task-${task.id}`}
        className="flex items-start gap-3 px-4 py-3 border-b border-border hover:bg-accent/20 transition-colors group"
        data-testid={`task-row-${task.id}`}
      >
        {/* Expand toggle */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className={`mt-1 shrink-0 text-muted-foreground transition-colors ${subtasksTotal > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <input
          type="checkbox"
          checked={isTaskDone}
          onChange={handleCheck}
          className="mt-1 h-4 w-4 rounded border-border cursor-pointer shrink-0"
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
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
                <textarea
                  className="w-full px-2 py-1 text-sm border border-border rounded bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                  rows={3}
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
              <div className="flex gap-2">
                <button onClick={handleSave} className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:opacity-90" data-testid="edit-save-btn">Save</button>
                <button onClick={() => setEditing(false)} className="px-3 py-1 text-xs border border-border rounded hover:bg-accent" data-testid="edit-cancel-btn">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="cursor-pointer" onClick={() => setEditing(true)} data-testid={`task-title-${task.id}`}>
              <p className={`text-sm font-medium ${isTaskDone ? 'line-through text-muted-foreground' : ''}`}>
                {task.title}
              </p>
              {task.notes && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{task.notes}</p>
              )}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <InProgressBadge task={task} columns={columns} />
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
                    {subtasksDone}/{subtasksTotal} subtasks
                  </span>
                )}
                {(task.tags ?? []).map((tag) => <TagBadge key={tag} tag={tag} />)}
              </div>
            </div>
          )}
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

      {/* Subtasks */}
      {expanded && (
        <>
          {subtasks.map((sub) => <SubtaskRow key={sub.id} task={sub} />)}
          {showSubtaskInput ? (
            <div className="flex items-center gap-2 pl-8 pr-4 py-2 border-b border-border/50 bg-muted/20">
              <input
                autoFocus
                value={subtaskTitle}
                onChange={(e) => setSubtaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddSubtask();
                  if (e.key === 'Escape') setShowSubtaskInput(false);
                }}
                placeholder="Subtask title… (Enter to add)"
                className="flex-1 text-sm px-2 py-1 border border-border rounded bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button onClick={handleAddSubtask} className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded hover:opacity-90">Add</button>
              <button onClick={() => setShowSubtaskInput(false)} className="text-xs px-2 py-1 border border-border rounded hover:bg-accent">×</button>
            </div>
          ) : (
            <button
              onClick={() => setShowSubtaskInput(true)}
              className="flex items-center gap-1 pl-8 pr-4 py-1.5 w-full border-b border-border/50 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors"
            >
              <Plus size={11} /> Add subtask
            </button>
          )}
        </>
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
  const [showAddForm, setShowAddForm] = useState(false);

  const todoColId = columns.find((c) => c.semanticStatus === 'not-started')?.id ?? columns[0]?.id ?? 'col-todo';

  // Root tasks only (no parentId), active, not archived/deleted
  const activeTasks = tasks.filter((t) => !t.archivedAt && !t.deletedAt && !t.parentId);
  const filtered = filterTasks(activeTasks, columns, search.field, search.value, search.dateOperator);
  const sorted = sortTasksByField(filtered, columns, sortField, sortOrder);

  const doneColIds = new Set(doneColumnIds());
  const doneActive = activeTasks.filter((t) => doneColIds.has(t.columnId));

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    addTask({ title: newTitle, notes: newNotes, columnId: todoColId, storyPoints: newPoints, dueDate: newDue || undefined, tags: newTags });
    setNewTitle(''); setNewNotes(''); setNewPoints(undefined); setNewDue(''); setNewTags([]);
    setShowAddForm(false);
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
            <div className="flex gap-2">
              <button onClick={handleAdd} className="px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90" data-testid="add-task-submit-btn">Add</button>
              <button onClick={() => setShowAddForm(false)} className="px-4 py-1.5 text-sm border border-border rounded-md hover:bg-accent">Cancel</button>
            </div>
          </div>
        </div>
      )}

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
        {sorted.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <p>No tasks found.</p>
            <p className="text-sm mt-1">Add a task above or clear the search filter.</p>
          </div>
        ) : (
          sorted.map((task) => <TaskRow key={task.id} task={task} allTasks={tasks} />)
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {sorted.length} task{sorted.length !== 1 ? 's' : ''} shown
      </p>
    </div>
  );
}
