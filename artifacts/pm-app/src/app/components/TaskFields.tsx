const FIBONACCI = [1, 2, 3, 5, 8, 13, 21];

interface TaskFieldsProps {
  storyPoints?: number;
  dueDate?: string;
  onStoryPointsChange: (pts: number | undefined) => void;
  onDueDateChange: (date: string) => void;
}

export default function TaskFields({
  storyPoints,
  dueDate,
  onStoryPointsChange,
  onDueDateChange,
}: TaskFieldsProps) {
  return (
    <div className="flex flex-wrap gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Story Points</label>
        <select
          className="px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
          value={storyPoints ?? ''}
          onChange={(e) =>
            onStoryPointsChange(e.target.value ? Number(e.target.value) : undefined)
          }
          data-testid="field-story-points"
        >
          <option value="">None</option>
          {FIBONACCI.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Due Date</label>
        <input
          type="date"
          className="px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
          value={dueDate ?? ''}
          onChange={(e) => onDueDateChange(e.target.value)}
          data-testid="field-due-date"
        />
      </div>
    </div>
  );
}
