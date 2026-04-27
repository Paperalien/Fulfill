import { useState } from 'react';
import { Vote } from 'lucide-react';
import { useTaskContext } from '../contexts/TaskContext';

const FIBONACCI = [1, 2, 3, 5, 8, 13, 21];

export default function PlanningPoker() {
  const { tasks, updateTask } = useTaskContext();
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [voted, setVoted] = useState(false);

  const activeTasks = tasks.filter((t) => !t.archivedAt && !t.deletedAt);
  const selectedTask = activeTasks.find((t) => t.id === selectedTaskId);

  const handleVote = (points: number) => {
    if (!selectedTaskId) return;
    updateTask(selectedTaskId, { storyPoints: points });
    setVoted(true);
    setTimeout(() => setVoted(false), 1500);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Vote size={24} className="text-primary" />
        <h2 className="text-lg font-semibold">Planning Poker</h2>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Select a task to estimate</label>
        <select
          className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          value={selectedTaskId}
          onChange={(e) => { setSelectedTaskId(e.target.value); setVoted(false); }}
          data-testid="poker-task-select"
        >
          <option value="">Choose a task…</option>
          {activeTasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.title}
              {task.storyPoints ? ` (${task.storyPoints} pts)` : ''}
            </option>
          ))}
        </select>
      </div>

      {selectedTask ? (
        <div className="space-y-6">
          <div className="p-4 border border-border rounded-xl bg-card">
            <h3 className="text-base font-semibold mb-1">{selectedTask.title}</h3>
            {selectedTask.notes ? (
              <p className="text-sm text-muted-foreground">{selectedTask.notes}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">No notes provided.</p>
            )}
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Current estimate:</span>
              <span className={`text-sm font-bold px-3 py-1 rounded-full ${
                selectedTask.storyPoints
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}>
                {selectedTask.storyPoints ? `${selectedTask.storyPoints} points` : 'Not estimated'}
              </span>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-3 text-center text-muted-foreground">
              Click a card to vote
            </p>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-3">
              {FIBONACCI.map((pts) => {
                const isSelected = selectedTask.storyPoints === pts;
                return (
                  <button
                    key={pts}
                    onClick={() => handleVote(pts)}
                    className={`
                      aspect-[3/4] flex items-center justify-center text-xl font-bold rounded-xl border-2
                      transition-all duration-150 hover:scale-105 active:scale-95
                      ${isSelected
                        ? 'border-primary bg-primary text-primary-foreground shadow-lg scale-105'
                        : 'border-border bg-card hover:border-primary/60 hover:bg-primary/5'
                      }
                    `}
                    data-testid={`poker-vote-${pts}`}
                  >
                    {pts}
                  </button>
                );
              })}
            </div>
          </div>

          {voted && (
            <div className="text-center py-3 px-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-sm text-green-700 dark:text-green-300 font-medium">
                Story points updated to {selectedTask.storyPoints}!
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-16 text-muted-foreground">
          <Vote size={48} className="mx-auto mb-4 opacity-20" />
          <p className="text-base">Select a task to start estimating</p>
          <p className="text-sm mt-1">
            Use Fibonacci numbers to assign story points to tasks
          </p>
        </div>
      )}
    </div>
  );
}
