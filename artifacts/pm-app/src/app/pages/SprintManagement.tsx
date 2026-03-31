import { useState } from 'react';
import { Plus, Trash2, Play, Square, Archive, ChevronDown, ChevronRight, Bell, RefreshCw, Pencil } from 'lucide-react';
import { useTaskContext } from '../contexts/TaskContext';
import { Task, Sprint, SearchState, SearchField, SortOrder } from '../types/task';
import { filterTasks } from '../utils/searchUtils';
import { sortTasksByField } from '../utils/sortUtils';
import { isReminderActive } from '../utils/taskUtils';
import { SearchBar } from '../components/SearchBar';
import { TagBadge } from '../components/TagInput';
import { InProgressBadge } from '../components/InProgressBadge';
import { TaskEditModal } from '../components/TaskEditModal';

const DEFAULT_SEARCH: SearchState = { field: 'title', value: '', dateOperator: 'eq' };

function TaskCard({ task, sprints }: { task: Task; sprints: Sprint[] }) {
  const { updateTask, columns } = useTaskContext();
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [showEdit, setShowEdit] = useState(false);

  function saveNotes() {
    updateTask(task.id, { notes: notes.trim() || undefined });
  }

  return (
    <>
    {showEdit && <TaskEditModal task={task} onClose={() => setShowEdit(false)} />}
    <div className="border-b border-border" data-testid={`sprint-task-${task.id}`}>
      <div className="flex items-start gap-3 px-4 py-3 hover:bg-accent/20 transition-colors group">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{task.title}</p>
          {task.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{task.description}</p>
          )}
          {!notesOpen && task.notes && (
            <p className="text-xs text-muted-foreground/60 mt-0.5 line-clamp-1 font-mono italic">{task.notes}</p>
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
            {(task.tags ?? []).map((tag) => <TagBadge key={tag} tag={tag} />)}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowEdit(true)}
            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity p-1 rounded hover:bg-accent"
            title="Edit task"
            data-testid={`sprint-edit-${task.id}`}
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={() => { setNotesOpen((v) => !v); setNotes(task.notes ?? ''); }}
            className={`text-xs flex items-center gap-0.5 px-1.5 py-0.5 rounded border transition-colors ${
              notesOpen || task.notes
                ? 'border-border text-foreground bg-accent/40'
                : 'border-transparent text-muted-foreground opacity-0 group-hover:opacity-100 hover:border-border'
            }`}
            title="Toggle notes"
            data-testid={`sprint-notes-toggle-${task.id}`}
          >
            {notesOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Notes
          </button>
          <select
            className="text-xs px-2 py-1 border border-border rounded bg-background focus:outline-none"
            value={task.sprintId ?? ''}
            onChange={(e) => updateTask(task.id, { sprintId: e.target.value || undefined })}
            data-testid={`sprint-assign-${task.id}`}
          >
            <option value="">Backlog</option>
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>
      {notesOpen && (
        <div className="px-4 pb-3 bg-muted/20">
          <textarea
            autoFocus
            className="w-full px-3 py-2 text-xs border border-border rounded bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-y font-mono leading-relaxed min-h-[80px]"
            placeholder="Free-form notes, scratch space, context…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveNotes}
            data-testid={`sprint-notes-input-${task.id}`}
          />
          <p className="text-xs text-muted-foreground mt-1">Saved on blur · close with the Notes button</p>
        </div>
      )}
    </div>
    </>
  );
}

export default function SprintManagement() {
  const { tasks, sprints, columns, addTask, addSprint, updateSprint, deleteSprint, archiveDoneTasks, doneColumnIds } = useTaskContext();
  const [search, setSearch] = useState<SearchState>(DEFAULT_SEARCH);
  const [sortField, setSortField] = useState<SearchField>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const [newSprintName, setNewSprintName] = useState('');
  const [newSprintStart, setNewSprintStart] = useState('');
  const [newSprintEnd, setNewSprintEnd] = useState('');
  const [showSprintForm, setShowSprintForm] = useState(false);
  const [confirmDeleteSprint, setConfirmDeleteSprint] = useState<string | null>(null);

  const [showAddTask, setShowAddTask] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');

  const todoColId = columns.find((c) => c.semanticStatus === 'not-started')?.id ?? columns[0]?.id ?? 'col-todo';
  const activeSprint = sprints.find((s) => s.isActive);
  const activeTasks = tasks.filter((t) => !t.archivedAt && !t.deletedAt && !t.parentId);
  const filtered = filterTasks(activeTasks, columns, search.field, search.value, search.dateOperator);
  const sorted = sortTasksByField(filtered, columns, sortField, sortOrder);

  const doneColIds = new Set(doneColumnIds());
  const sprintTasks = sorted.filter((t) => t.sprintId === activeSprint?.id);
  const backlogTasks = sorted.filter((t) => !t.sprintId);
  const sprintDoneTasks = sprintTasks.filter((t) => doneColIds.has(t.columnId) && !t.archivedAt);

  const sprintStats = activeSprint
    ? {
        total: sprintTasks.length,
        done: sprintTasks.filter((t) => doneColIds.has(t.columnId)).length,
        inProgress: sprintTasks.filter((t) => {
          const col = columns.find((c) => c.id === t.columnId);
          return col?.semanticStatus === 'in-progress';
        }).length,
        points: sprintTasks.reduce((sum, t) => sum + (t.storyPoints ?? 0), 0),
        donePoints: sprintTasks.filter((t) => doneColIds.has(t.columnId)).reduce((sum, t) => sum + (t.storyPoints ?? 0), 0),
      }
    : null;

  const handleCreateSprint = () => {
    if (!newSprintName.trim()) return;
    addSprint({ name: newSprintName, startDate: newSprintStart, endDate: newSprintEnd, isActive: false });
    setNewSprintName(''); setNewSprintStart(''); setNewSprintEnd('');
    setShowSprintForm(false);
  };

  const handleActivate = (sprintId: string) => {
    sprints.forEach((s) => { if (s.isActive && s.id !== sprintId) updateSprint(s.id, { isActive: false }); });
    updateSprint(sprintId, { isActive: true });
  };

  const handleDeactivate = (sprintId: string) => {
    updateSprint(sprintId, { isActive: false });
  };

  const handleAddTask = (sprintId: string | null) => {
    if (!newTaskTitle.trim()) return;
    addTask({ title: newTaskTitle, description: newTaskDesc, columnId: todoColId, sprintId: sprintId ?? undefined });
    setNewTaskTitle(''); setNewTaskDesc('');
    setShowAddTask(null);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Sprint Management</h2>
        <button
          onClick={() => setShowSprintForm((v) => !v)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90"
          data-testid="create-sprint-btn"
        >
          <Plus size={14} />
          New Sprint
        </button>
      </div>

      {showSprintForm && (
        <div className="mb-6 p-4 border border-border rounded-lg bg-card">
          <div className="flex flex-col gap-3">
            <input
              autoFocus
              className="px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Sprint name"
              value={newSprintName}
              onChange={(e) => setNewSprintName(e.target.value)}
              data-testid="sprint-name-input"
            />
            <div className="flex gap-3">
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-xs text-muted-foreground">Start Date</label>
                <input type="date" className="px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none" value={newSprintStart} onChange={(e) => setNewSprintStart(e.target.value)} data-testid="sprint-start-input" />
              </div>
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-xs text-muted-foreground">End Date</label>
                <input type="date" className="px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none" value={newSprintEnd} onChange={(e) => setNewSprintEnd(e.target.value)} data-testid="sprint-end-input" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleCreateSprint} className="px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90" data-testid="sprint-create-submit">Create</button>
              <button onClick={() => setShowSprintForm(false)} className="px-4 py-1.5 text-sm border border-border rounded-md hover:bg-accent">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">All Sprints</h3>
        <div className="flex flex-col gap-2">
          {sprints.length === 0 && <p className="text-sm text-muted-foreground">No sprints yet.</p>}
          {sprints.map((sprint) => {
            const taskCount = tasks.filter((t) => t.sprintId === sprint.id && !t.archivedAt && !t.deletedAt).length;
            return (
              <div key={sprint.id} className="flex items-center gap-3 px-4 py-3 border border-border rounded-lg bg-card" data-testid={`sprint-item-${sprint.id}`}>
                <div className="flex-1">
                  <p className="text-sm font-medium">{sprint.name}</p>
                  <p className="text-xs text-muted-foreground">{sprint.startDate} → {sprint.endDate} · {taskCount} tasks</p>
                </div>
                {sprint.isActive && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Active</span>
                )}
                <div className="flex items-center gap-1">
                  {!sprint.isActive ? (
                    <button onClick={() => handleActivate(sprint.id)} className="flex items-center gap-1 text-xs px-2 py-1 border border-border rounded hover:bg-accent" data-testid={`sprint-activate-${sprint.id}`}><Play size={12} /> Start</button>
                  ) : (
                    <button onClick={() => handleDeactivate(sprint.id)} className="flex items-center gap-1 text-xs px-2 py-1 border border-border rounded hover:bg-accent" data-testid={`sprint-stop-${sprint.id}`}><Square size={12} /> Stop</button>
                  )}
                  <button onClick={() => setConfirmDeleteSprint(sprint.id)} className="p-1 text-muted-foreground hover:text-destructive" data-testid={`sprint-delete-${sprint.id}`}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {confirmDeleteSprint && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-semibold mb-2">Delete Sprint?</h3>
            <p className="text-sm text-muted-foreground mb-4">Tasks in this sprint will move to the backlog.</p>
            <div className="flex gap-2">
              <button onClick={() => { deleteSprint(confirmDeleteSprint); setConfirmDeleteSprint(null); }} className="px-4 py-1.5 text-sm bg-destructive text-destructive-foreground rounded-md hover:opacity-90" data-testid="sprint-delete-confirm">Delete</button>
              <button onClick={() => setConfirmDeleteSprint(null)} className="px-4 py-1.5 text-sm border border-border rounded-md hover:bg-accent">Cancel</button>
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

      {activeSprint ? (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Active: {activeSprint.name}
              </h3>
              {sprintStats && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {sprintStats.done}/{sprintStats.total} done · {sprintStats.inProgress} in progress
                  {sprintStats.points > 0 && ` · ${sprintStats.donePoints}/${sprintStats.points} pts`}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {sprintDoneTasks.length > 0 && (
                <button
                  onClick={() => archiveDoneTasks(sprintDoneTasks.map((t) => t.id))}
                  className="flex items-center gap-1 text-xs px-2 py-1 border border-border rounded hover:bg-accent"
                  data-testid="sprint-archive-done-btn"
                >
                  <Archive size={12} /> Archive {sprintDoneTasks.length} Done
                </button>
              )}
              <button onClick={() => setShowAddTask('active')} className="flex items-center gap-1 text-xs px-2 py-1 bg-primary text-primary-foreground rounded hover:opacity-90" data-testid="sprint-add-task-btn">
                <Plus size={12} /> Add Task
              </button>
            </div>
          </div>
          {showAddTask === 'active' && (
            <div className="mb-3 p-3 border border-border rounded-lg bg-card flex flex-col gap-2">
              <input autoFocus className="px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none" placeholder="Task title" value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} data-testid="sprint-new-task-title" />
              <textarea className="px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none resize-none" placeholder="Description (optional)" rows={1} value={newTaskDesc} onChange={(e) => setNewTaskDesc(e.target.value)} />
              <div className="flex gap-2">
                <button onClick={() => handleAddTask(activeSprint.id)} className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:opacity-90">Add</button>
                <button onClick={() => setShowAddTask(null)} className="px-3 py-1 text-xs border border-border rounded hover:bg-accent">Cancel</button>
              </div>
            </div>
          )}
          <div className="border border-border rounded-lg overflow-hidden bg-card">
            {sprintTasks.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No tasks in this sprint.</p>
            ) : (
              sprintTasks.map((task) => <TaskCard key={task.id} task={task} sprints={sprints} />)
            )}
          </div>
        </div>
      ) : (
        <div className="mb-6 p-4 border border-border rounded-lg bg-muted/30 text-center text-sm text-muted-foreground">
          No active sprint. Start a sprint from the list above.
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Backlog</h3>
          <button onClick={() => setShowAddTask('backlog')} className="flex items-center gap-1 text-xs px-2 py-1 border border-border rounded hover:bg-accent" data-testid="backlog-add-task-btn">
            <Plus size={12} /> Add to Backlog
          </button>
        </div>
        {showAddTask === 'backlog' && (
          <div className="mb-3 p-3 border border-border rounded-lg bg-card flex flex-col gap-2">
            <input autoFocus className="px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none" placeholder="Task title" value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} data-testid="backlog-new-task-title" />
            <textarea className="px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none resize-none" placeholder="Description" rows={1} value={newTaskDesc} onChange={(e) => setNewTaskDesc(e.target.value)} />
            <div className="flex gap-2">
              <button onClick={() => handleAddTask(null)} className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:opacity-90">Add</button>
              <button onClick={() => setShowAddTask(null)} className="px-3 py-1 text-xs border border-border rounded hover:bg-accent">Cancel</button>
            </div>
          </div>
        )}
        <div className="border border-border rounded-lg overflow-hidden bg-card">
          {backlogTasks.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Backlog is empty.</p>
          ) : (
            backlogTasks.map((task) => <TaskCard key={task.id} task={task} sprints={sprints} />)
          )}
        </div>
      </div>
    </div>
  );
}
