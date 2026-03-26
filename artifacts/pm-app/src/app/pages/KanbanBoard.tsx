import { useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Plus, Archive } from 'lucide-react';
import { useTaskContext } from '../contexts/TaskContext';
import { Task, TaskStatus, SearchState, SortOrder, SearchField } from '../types/task';
import { filterTasks } from '../utils/searchUtils';
import SearchBar from '../components/SearchBar';

const DEFAULT_SEARCH: SearchState = { field: 'title', value: '', dateOperator: 'eq' };

const COLUMNS: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'todo', label: 'To Do', color: 'bg-muted text-muted-foreground' },
  { id: 'in-progress', label: 'In Progress', color: 'bg-blue-100 text-blue-700' },
  { id: 'done', label: 'Done', color: 'bg-green-100 text-green-700' },
];

function KanbanCard({ task, index }: { task: Task; index: number }) {
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
            {task.storyPoints !== undefined && (
              <span className="text-xs bg-accent text-accent-foreground px-1.5 py-0.5 rounded-full">
                {task.storyPoints} pts
              </span>
            )}
            {task.dueDate && (
              <span className="text-xs text-muted-foreground">Due {task.dueDate}</span>
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
}

export default function KanbanBoard() {
  const { tasks, addTask, updateTask, archiveDoneTasks } = useTaskContext();
  const [search, setSearch] = useState<SearchState>(DEFAULT_SEARCH);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const [addDesc, setAddDesc] = useState('');
  const [addStatus, setAddStatus] = useState<TaskStatus>('todo');

  const activeTasks = tasks.filter((t) => !t.archivedAt && !t.deletedAt);
  const filtered = filterTasks(activeTasks, search.field, search.value, search.dateOperator);

  const doneCount = activeTasks.filter((t) => t.status === 'done').length;

  const columns = COLUMNS.reduce<Record<TaskStatus, Task[]>>(
    (acc, col) => {
      acc[col.id] = filtered
        .filter((t) => t.status === col.id)
        .sort((a, b) => a.order - b.order);
      return acc;
    },
    { todo: [], 'in-progress': [], done: [] }
  );

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const newStatus = destination.droppableId as TaskStatus;
    updateTask(draggableId, { status: newStatus, order: destination.index });
  };

  const handleAdd = () => {
    if (!addTitle.trim()) return;
    addTask({ title: addTitle, description: addDesc, status: addStatus });
    setAddTitle('');
    setAddDesc('');
    setAddStatus('todo');
    setShowAddDialog(false);
  };

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Kanban Board</h2>
        <div className="flex gap-2">
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
        <SearchBar state={search} onChange={setSearch} />
      </div>

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
                value={addStatus}
                onChange={(e) => setAddStatus(e.target.value as TaskStatus)}
                data-testid="kanban-add-status"
              >
                <option value="todo">To Do</option>
                <option value="in-progress">In Progress</option>
                <option value="done">Done</option>
              </select>
              <div className="flex gap-2 mt-1">
                <button
                  onClick={handleAdd}
                  className="px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90"
                  data-testid="kanban-add-submit"
                >
                  Add
                </button>
                <button
                  onClick={() => setShowAddDialog(false)}
                  className="px-4 py-1.5 text-sm border border-border rounded-md hover:bg-accent"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 flex-1 min-h-0 overflow-x-auto">
          {COLUMNS.map((col) => (
            <div key={col.id} className="flex flex-col flex-1 min-w-[240px]">
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${col.color}`}>
                  {col.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {columns[col.id].length}
                </span>
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
                    {columns[col.id].map((task, index) => (
                      <KanbanCard key={task.id} task={task} index={index} />
                    ))}
                    {provided.placeholder}
                    {columns[col.id].length === 0 && (
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
