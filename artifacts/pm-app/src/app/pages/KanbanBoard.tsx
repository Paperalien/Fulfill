import { useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Plus, Archive, Settings, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { useTaskContext } from '../contexts/TaskContext';
import { Task, KanbanColumn, SearchState } from '../types/task';
import { filterTasks } from '../utils/searchUtils';
import { getColumnColor, getSubtaskProgress, isDone } from '../utils/taskUtils';
import { SearchBar } from '../components/SearchBar';
import { TagBadge } from '../components/TagInput';
import { InProgressBadge } from '../components/InProgressBadge';

const DEFAULT_SEARCH: SearchState = { field: 'title', value: '', dateOperator: 'eq' };
const SEMANTIC_OPTIONS = [
  { value: 'not-started', label: 'Not Started' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
] as const;
const COLOR_OPTIONS = ['gray', 'blue', 'purple', 'green', 'orange', 'red', 'yellow'];

function KanbanCard({ task, index, allTasks, columns }: { task: Task; index: number; allTasks: Task[]; columns: KanbanColumn[] }) {
  const { done: sub_done, total: sub_total } = getSubtaskProgress(task.id, allTasks, columns);
  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`p-3 mb-2 rounded-lg border border-border bg-card shadow-sm cursor-grab active:cursor-grabbing transition-shadow ${
            snapshot.isDragging ? 'shadow-lg ring-2 ring-primary/30' : 'hover:shadow-md'
          }`}
          data-testid={`kanban-card-${task.id}`}
        >
          <p className="text-sm font-medium leading-tight">{task.title}</p>
          {task.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
          )}
          <div className="flex flex-wrap gap-1.5 mt-2">
            <InProgressBadge task={task} columns={columns} />
            {task.storyPoints !== undefined && (
              <span className="text-xs bg-accent text-accent-foreground px-1.5 py-0.5 rounded-full">
                {task.storyPoints} pts
              </span>
            )}
            {task.dueDate && (
              <span className="text-xs text-muted-foreground">Due {task.dueDate}</span>
            )}
            {sub_total > 0 && (
              <span className="text-xs text-muted-foreground">{sub_done}/{sub_total} subtasks</span>
            )}
          </div>
          {(task.tags ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {(task.tags ?? []).map((tag) => <TagBadge key={tag} tag={tag} />)}
            </div>
          )}
        </div>
      )}
    </Draggable>
  );
}

function ColumnManagerModal({ onClose }: { onClose: () => void }) {
  const { columns, addColumn, updateColumn, deleteColumn, reorderColumns } = useTaskContext();
  const sorted = [...columns].sort((a, b) => a.order - b.order);

  const [newName, setNewName] = useState('');
  const [newSemantic, setNewSemantic] = useState<KanbanColumn['semanticStatus']>('not-started');
  const [newColor, setNewColor] = useState('gray');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editSemantic, setEditSemantic] = useState<KanbanColumn['semanticStatus']>('not-started');
  const [editColor, setEditColor] = useState('gray');

  const fallbackCol = sorted[0];

  const handleAdd = () => {
    if (!newName.trim()) return;
    addColumn({ name: newName, semanticStatus: newSemantic, color: newColor });
    setNewName('');
  };

  const handleMove = (id: string, dir: 'up' | 'down') => {
    const ids = sorted.map((c) => c.id);
    const idx = ids.indexOf(id);
    if (dir === 'up' && idx > 0) { [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]]; }
    if (dir === 'down' && idx < ids.length - 1) { [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]]; }
    reorderColumns(ids);
  };

  const startEdit = (col: KanbanColumn) => {
    setEditingId(col.id);
    setEditName(col.name);
    setEditSemantic(col.semanticStatus);
    setEditColor(col.color ?? 'gray');
  };

  const saveEdit = () => {
    if (!editingId) return;
    updateColumn(editingId, { name: editName, semanticStatus: editSemantic, color: editColor });
    setEditingId(null);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">Manage Columns</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 mb-4">
          {sorted.map((col, idx) => (
            <div key={col.id} className="border border-border rounded-lg overflow-hidden">
              {editingId === col.id ? (
                <div className="p-3 flex flex-col gap-2 bg-accent/30">
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} className="px-2 py-1 text-sm border border-border rounded bg-background focus:outline-none" />
                  <div className="flex gap-2">
                    <select value={editSemantic} onChange={(e) => setEditSemantic(e.target.value as KanbanColumn['semanticStatus'])} className="flex-1 px-2 py-1 text-xs border border-border rounded bg-background focus:outline-none">
                      {SEMANTIC_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <select value={editColor} onChange={(e) => setEditColor(e.target.value)} className="flex-1 px-2 py-1 text-xs border border-border rounded bg-background focus:outline-none">
                      {COLOR_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveEdit} className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:opacity-90">Save</button>
                    <button onClick={() => setEditingId(null)} className="px-3 py-1 text-xs border border-border rounded hover:bg-accent">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{col.name}</p>
                    <p className="text-xs text-muted-foreground">{col.semanticStatus} · {col.color ?? 'gray'}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => handleMove(col.id, 'up')} disabled={idx === 0} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp size={14} /></button>
                    <button onClick={() => handleMove(col.id, 'down')} disabled={idx === sorted.length - 1} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown size={14} /></button>
                    <button onClick={() => startEdit(col)} className="p-1 text-muted-foreground hover:text-foreground text-xs">Edit</button>
                    {sorted.length > 1 && (
                      <button
                        onClick={() => setDeleteConfirm(col.id)}
                        className="p-1 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">Add Column</p>
          <div className="flex gap-2 flex-wrap">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="Column name"
              className="flex-1 min-w-32 px-2 py-1.5 text-sm border border-border rounded bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <select value={newSemantic} onChange={(e) => setNewSemantic(e.target.value as KanbanColumn['semanticStatus'])} className="px-2 py-1.5 text-xs border border-border rounded bg-background focus:outline-none">
              {SEMANTIC_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={newColor} onChange={(e) => setNewColor(e.target.value)} className="px-2 py-1.5 text-xs border border-border rounded bg-background focus:outline-none">
              {COLOR_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={handleAdd} className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:opacity-90">Add</button>
          </div>
        </div>

        {deleteConfirm && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-60">
            <div className="bg-card border border-border rounded-xl p-5 max-w-sm w-full shadow-xl">
              <p className="font-semibold mb-1">Delete column?</p>
              <p className="text-sm text-muted-foreground mb-4">
                Tasks in this column will move to "{sorted.find((c) => c.id !== deleteConfirm)?.name ?? fallbackCol?.name}".
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const fallback = sorted.find((c) => c.id !== deleteConfirm)?.id ?? '';
                    deleteColumn(deleteConfirm, fallback);
                    setDeleteConfirm(null);
                  }}
                  className="px-4 py-1.5 text-sm bg-destructive text-destructive-foreground rounded hover:opacity-90"
                >
                  Delete
                </button>
                <button onClick={() => setDeleteConfirm(null)} className="px-4 py-1.5 text-sm border border-border rounded hover:bg-accent">Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function KanbanBoard() {
  const { tasks, columns, addTask, updateTask, archiveDoneTasks, doneColumnIds } = useTaskContext();
  const [search, setSearch] = useState<SearchState>(DEFAULT_SEARCH);
  const [sortField] = useState<'title'>('title');
  const [sortOrder] = useState<'asc'>('asc');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const [addDesc, setAddDesc] = useState('');
  const [addColumnId, setAddColumnId] = useState('');
  const [showColumnManager, setShowColumnManager] = useState(false);

  const sortedColumns = [...columns].sort((a, b) => a.order - b.order);

  // Only show root tasks (no parentId) that are active
  const activeTasks = tasks.filter((t) => !t.archivedAt && !t.deletedAt && !t.parentId);
  const filtered = filterTasks(activeTasks, columns, 'title', search.value, search.dateOperator);

  const doneColIds = new Set(doneColumnIds());
  const doneCount = activeTasks.filter((t) => doneColIds.has(t.columnId)).length;

  const columnTasks: Record<string, Task[]> = {};
  for (const col of sortedColumns) {
    columnTasks[col.id] = filtered
      .filter((t) => t.columnId === col.id)
      .sort((a, b) => a.order - b.order);
  }

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    updateTask(draggableId, { columnId: destination.droppableId, order: destination.index });
  };

  const handleAdd = () => {
    if (!addTitle.trim()) return;
    const targetColId = addColumnId || sortedColumns[0]?.id || 'col-todo';
    addTask({ title: addTitle, description: addDesc, columnId: targetColId });
    setAddTitle(''); setAddDesc(''); setAddColumnId('');
    setShowAddDialog(false);
  };

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Kanban Board</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowColumnManager(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-accent"
            data-testid="manage-columns-btn"
          >
            <Settings size={14} />
            Columns
          </button>
          {doneCount > 0 && (
            <button
              onClick={() => archiveDoneTasks()}
              className="flex items-center gap-2 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-accent"
              data-testid="kanban-archive-btn"
            >
              <Archive size={14} />
              Archive {doneCount} Done
            </button>
          )}
          <button
            onClick={() => setShowAddDialog(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90"
            data-testid="kanban-add-btn"
          >
            <Plus size={14} />
            Add Task
          </button>
        </div>
      </div>

      <div className="mb-4">
        <SearchBar
          search={search}
          onSearchChange={setSearch}
          sortField={sortField}
          sortOrder={sortOrder}
          onSortChange={() => {}}
        />
      </div>

      {showColumnManager && <ColumnManagerModal onClose={() => setShowColumnManager(false)} />}

      {showAddDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-base font-semibold mb-4">Add Task</h3>
            <div className="flex flex-col gap-3">
              <input
                autoFocus
                className="px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Task title"
                value={addTitle}
                onChange={(e) => setAddTitle(e.target.value)}
                data-testid="kanban-add-title"
              />
              <textarea
                className="px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                placeholder="Description (optional)"
                rows={2}
                value={addDesc}
                onChange={(e) => setAddDesc(e.target.value)}
                data-testid="kanban-add-description"
              />
              <select
                className="px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                value={addColumnId}
                onChange={(e) => setAddColumnId(e.target.value)}
                data-testid="kanban-add-column"
              >
                {sortedColumns.map((col) => (
                  <option key={col.id} value={col.id}>{col.name}</option>
                ))}
              </select>
              <div className="flex gap-2 mt-1">
                <button onClick={handleAdd} className="px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90" data-testid="kanban-add-submit">Add</button>
                <button onClick={() => setShowAddDialog(false)} className="px-4 py-1.5 text-sm border border-border rounded-md hover:bg-accent">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 flex-1 min-h-0 overflow-x-auto pb-2">
          {sortedColumns.map((col) => (
            <div key={col.id} className="flex flex-col flex-1 min-w-[220px] max-w-[320px]">
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getColumnColor(col)}`}>
                  {col.name}
                </span>
                <span className="text-xs text-muted-foreground">{columnTasks[col.id]?.length ?? 0}</span>
              </div>
              <Droppable droppableId={col.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex-1 p-2 rounded-xl transition-colors ${
                      snapshot.isDraggingOver ? 'bg-primary/5 ring-2 ring-primary/20' : 'bg-muted/30'
                    }`}
                    data-testid={`kanban-column-${col.id}`}
                  >
                    {(columnTasks[col.id] ?? []).map((task, index) => (
                      <KanbanCard key={task.id} task={task} index={index} allTasks={tasks} columns={columns} />
                    ))}
                    {provided.placeholder}
                    {(columnTasks[col.id] ?? []).length === 0 && (
                      <div className="text-center text-xs text-muted-foreground py-6">
                        Drop tasks here
                      </div>
                    )}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}
