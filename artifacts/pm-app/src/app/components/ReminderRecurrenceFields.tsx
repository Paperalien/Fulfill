type RecurrenceValue = 'daily' | 'weekly' | 'monthly';

interface Props {
  reminder?: string;
  recurrence?: RecurrenceValue;
  onReminderChange: (r: string | undefined) => void;
  onRecurrenceChange: (r: RecurrenceValue | undefined) => void;
}

function getReminderMode(reminder: string | undefined): 'none' | 'day-before' | 'on-due-date' | 'specific' {
  if (!reminder) return 'none';
  if (reminder === 'day-before') return 'day-before';
  if (reminder === 'on-due-date') return 'on-due-date';
  return 'specific';
}

export default function ReminderRecurrenceFields({ reminder, recurrence, onReminderChange, onRecurrenceChange }: Props) {
  const mode = getReminderMode(reminder);
  const specificDate = mode === 'specific' ? reminder : '';

  function handleModeChange(newMode: string) {
    if (newMode === 'none') { onReminderChange(undefined); return; }
    if (newMode === 'day-before') { onReminderChange('day-before'); return; }
    if (newMode === 'on-due-date') { onReminderChange('on-due-date'); return; }
    if (newMode === 'specific') {
      const today = new Date().toISOString().slice(0, 10);
      onReminderChange(specificDate || today);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Reminder</label>
        <div className="flex gap-2 flex-wrap">
          <select
            value={mode}
            onChange={(e) => handleModeChange(e.target.value)}
            className="flex-1 min-w-32 px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            data-testid="reminder-select"
          >
            <option value="none">No reminder</option>
            <option value="day-before">Day before due date</option>
            <option value="on-due-date">On due date</option>
            <option value="specific">Specific date…</option>
          </select>
          {mode === 'specific' && (
            <input
              type="date"
              value={specificDate ?? ''}
              onChange={(e) => onReminderChange(e.target.value || undefined)}
              className="px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              data-testid="reminder-date-input"
            />
          )}
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Recurrence</label>
        <select
          value={recurrence ?? ''}
          onChange={(e) => onRecurrenceChange((e.target.value as RecurrenceValue) || undefined)}
          className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          data-testid="recurrence-select"
        >
          <option value="">No recurrence</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
        {recurrence && (
          <p className="text-xs text-muted-foreground mt-1">
            When marked done, a new copy of this task will be created with the next {recurrence === 'daily' ? 'day' : recurrence === 'weekly' ? 'week' : 'month'}'s due date.
          </p>
        )}
      </div>
    </div>
  );
}
