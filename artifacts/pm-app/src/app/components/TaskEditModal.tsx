import { useState } from 'react';
import { X } from 'lucide-react';
import { Task } from '../types/task';
import { useTaskContext } from '../contexts/TaskContext';
import { TagInput } from './TagInput';
import TaskFields from './TaskFields';
import ReminderRecurrenceFields from './ReminderRecurrenceFields';

interface Props {
  task: Task;
  onClose: () => void;
}

export function TaskEditModal({ task, onClose }: Props) {
  const { updateTask, columns } = useTaskContext();
  const sortedColumns = [...columns].sort((a, b) => a.order - b.order);

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [columnId, setColumnId] = useState(task.columnId);
  const [storyPoints, setStoryPoints] = useState(task.storyPoints);
  const [dueDate, setDueDate] = useState(task.dueDate ?? '');
  const [tags, setTags] = useState(task.tags ?? []);
  const [reminder, setReminder] = useState(task.reminder);
  const [recurrence, setRecurrence] = useState(task.recurrence);

  function handleSave() {
    updateTask(task.id, {
      title,
      description,
      columnId,
      storyPoints,
      dueDate: dueDate || undefined,
      tags,
      reminder,
      recurrence,
    });
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave();
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-base font-semibold">Edit Task</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {/* Title */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Title</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="Notes, context, details…"
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            />
          </div>

          {/* Column */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Column</label>
            <select
              value={columnId}
              onChange={(e) => setColumnId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {sortedColumns.map((col) => (
                <option key={col.id} value={col.id}>{col.name}</option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Tags</label>
            <TagInput tags={tags} onChange={setTags} />
          </div>

          {/* Story points + due date */}
          <TaskFields
            storyPoints={storyPoints}
            dueDate={dueDate}
            onStoryPointsChange={setStoryPoints}
            onDueDateChange={setDueDate}
          />

          {/* Reminder + recurrence */}
          <ReminderRecurrenceFields
            reminder={reminder}
            recurrence={recurrence}
            onReminderChange={setReminder}
            onRecurrenceChange={setRecurrence}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <p className="text-xs text-muted-foreground">⌘↵ to save · Esc to close</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-accent">
              Cancel
            </button>
            <button onClick={handleSave} className="px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90">
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
