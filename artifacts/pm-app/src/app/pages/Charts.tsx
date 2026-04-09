import { useState, useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  type TooltipProps,
} from 'recharts';
import { type ValueType, type NameType } from 'recharts/types/component/DefaultTooltipContent';
import { useTaskContext } from '../contexts/TaskContext';
import { useAuth } from '../contexts/AuthContext';
import { useGetSprintSnapshots, getGetSprintSnapshotsQueryKey } from '@workspace/api-client-react';
import { Sprint } from '../types/task';

// ── Colour palette ─────────────────────────────────────────────────────────
const COLORS = {
  primary: 'hsl(221 83% 53%)',
  green:   'hsl(142 71% 45%)',
  amber:   'hsl(38 92% 50%)',
  red:     'hsl(0 72% 51%)',
  purple:  'hsl(271 81% 56%)',
  muted:   'hsl(215 16% 47%)',
};

const STATUS_COLORS: Record<string, string> = {
  'Not Started': 'hsl(215 16% 47%)',
  'In Progress': COLORS.primary,
  'Done':        COLORS.green,
};

// ── Helpers ────────────────────────────────────────────────────────────────
function sectionTitle(label: string) {
  return (
    <h2 className="text-base font-semibold text-foreground mb-4 pb-2 border-b border-border">
      {label}
    </h2>
  );
}

function chartCard(title: string, children: React.ReactNode) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <p className="text-sm font-medium text-muted-foreground mb-4">{title}</p>
      {children}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
      {message}
    </div>
  );
}

// ── Custom tooltip ─────────────────────────────────────────────────────────
function SimpleTooltip({ active, payload, label }: TooltipProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border border-border rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="font-medium mb-1">{String(label ?? '')}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} style={{ color: (p.color ?? p.payload?.fill ?? undefined) as string | undefined }}>
          {p.name}: <span className="font-mono">{String(p.value ?? '')}</span>
        </p>
      ))}
    </div>
  );
}

// ── Sprint selector ────────────────────────────────────────────────────────
function SprintSelector({
  sprints,
  value,
  onChange,
}: {
  sprints: Sprint[];
  value: string;
  onChange: (id: string) => void;
}) {
  if (sprints.length === 0) return null;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-xs px-2 py-1 border border-border rounded bg-background focus:outline-none ml-auto"
    >
      {sprints.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}

// ── Velocity chart ─────────────────────────────────────────────────────────
function VelocityChart() {
  const { tasks, sprints } = useTaskContext();
  const { doneColumnIds } = useTaskContext();
  const doneSet = new Set(doneColumnIds());

  const data = useMemo(() => {
    return sprints
      .map((sprint) => {
        const sprintTasks = tasks.filter(
          (t) => t.sprintId === sprint.id && !t.deletedAt
        );
        const completedPoints = sprintTasks
          .filter((t) => doneSet.has(t.columnId) || !!t.archivedAt)
          .reduce((s, t) => s + (t.storyPoints ?? 0), 0);
        return { name: sprint.name, points: completedPoints };
      })
      .filter((d) => d.points > 0);
  }, [tasks, sprints, doneSet]);

  if (data.length === 0) {
    return chartCard(
      'Velocity (Story Points Completed per Sprint)',
      <EmptyState message="No completed story points yet. Complete tasks with points assigned to see velocity." />
    );
  }

  return chartCard(
    'Velocity (Story Points Completed per Sprint)',
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 16% 90%)" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip content={<SimpleTooltip />} />
        <Bar dataKey="points" name="Completed pts" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Burndown / Burnup charts ───────────────────────────────────────────────
type SnapshotRow = { date: string; total: number; done: number };

function buildBurnChartData(sprintId: string, sprint: Sprint, allSnapshots: SnapshotRow[]) {
  const start = sprint.startDate;
  const end = sprint.endDate;

  if (!start || !end) return [];

  const rows = allSnapshots
    .filter((s) => s.date >= start && s.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date));

  return rows.map(({ date, total, done }, idx) => {
    const remaining = Math.max(0, total - done);
    const startTotal = rows[0]?.total ?? total;
    const totalDays = rows.length - 1 || 1;
    const ideal = Math.round(startTotal - (startTotal / totalDays) * idx);

    return {
      date,
      remaining,
      completed: done,
      scope: total,
      ideal,
      label: date.slice(5), // MM-DD
    };
  });
}

function BurndownChart({ sprintId, sprint, snapshots }: { sprintId: string; sprint: Sprint; snapshots: SnapshotRow[] }) {
  const data = useMemo(() => buildBurnChartData(sprintId, sprint, snapshots), [sprintId, sprint, snapshots]);

  if (data.length < 2) {
    return (
      <EmptyState message="Data will appear as the sprint progresses — check back tomorrow." />
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 16% 90%)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip content={<SimpleTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="ideal" name="Ideal" stroke={COLORS.muted} strokeDasharray="4 3" dot={false} strokeWidth={1.5} />
        <Line type="monotone" dataKey="remaining" name="Remaining" stroke={COLORS.red} dot={{ r: 3 }} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function BurnupChart({ sprintId, sprint, snapshots }: { sprintId: string; sprint: Sprint; snapshots: SnapshotRow[] }) {
  const data = useMemo(() => buildBurnChartData(sprintId, sprint, snapshots), [sprintId, sprint, snapshots]);

  if (data.length < 2) {
    return (
      <EmptyState message="Data will appear as the sprint progresses — check back tomorrow." />
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 16% 90%)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip content={<SimpleTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="scope" name="Scope" stroke={COLORS.muted} strokeDasharray="4 3" dot={false} strokeWidth={1.5} />
        <Line type="monotone" dataKey="completed" name="Completed" stroke={COLORS.green} dot={{ r: 3 }} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function BurnCharts() {
  const { sprints } = useTaskContext();
  const { workspaceId } = useAuth();

  const wid = workspaceId ?? '';
  const { data: snapshotData } = useGetSprintSnapshots(
    wid,
    {},
    { query: { enabled: !!workspaceId, queryKey: getGetSprintSnapshotsQueryKey(wid) } }
  );
  const allSnapshots: SnapshotRow[] = (snapshotData ?? []).map((s: { date: string; total: number; done: number }) => ({
    date: s.date,
    total: s.total,
    done: s.done,
  }));

  const defaultSprint = useMemo(() => {
    const active = sprints.find((s) => s.isActive);
    if (active) return active;
    return sprints.reduce<Sprint | undefined>((best, s) => {
      if (!best) return s;
      return (s.endDate ?? '') > (best.endDate ?? '') ? s : best;
    }, undefined);
  }, [sprints]);

  const [selectedId, setSelectedId] = useState<string>(defaultSprint?.id ?? '');
  const selectedSprint = sprints.find((s) => s.id === selectedId);
  const sprintSnapshots = allSnapshots.filter((s) => selectedId && true); // all passed down, filtered in buildBurnChartData

  if (sprints.length === 0) {
    return (
      <>
        {chartCard('Burndown', <EmptyState message="No sprints yet." />)}
        {chartCard('Burnup', <EmptyState message="No sprints yet." />)}
      </>
    );
  }

  return (
    <>
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center mb-4">
          <p className="text-sm font-medium text-muted-foreground">Burndown</p>
          <SprintSelector sprints={sprints} value={selectedId} onChange={setSelectedId} />
        </div>
        {selectedSprint ? (
          <BurndownChart sprintId={selectedId} sprint={selectedSprint} snapshots={sprintSnapshots} />
        ) : (
          <EmptyState message="Select a sprint." />
        )}
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center mb-4">
          <p className="text-sm font-medium text-muted-foreground">Burnup</p>
          <SprintSelector sprints={sprints} value={selectedId} onChange={setSelectedId} />
        </div>
        {selectedSprint ? (
          <BurnupChart sprintId={selectedId} sprint={selectedSprint} snapshots={sprintSnapshots} />
        ) : (
          <EmptyState message="Select a sprint." />
        )}
      </div>
    </>
  );
}

// ── Tasks by Status donut ─────────────────────────────────────────────────
function TasksByStatus() {
  const { tasks, columns } = useTaskContext();

  const data = useMemo(() => {
    const active = tasks.filter((t) => !t.archivedAt && !t.deletedAt && !t.parentId);
    const counts: Record<string, number> = { 'Not Started': 0, 'In Progress': 0, 'Done': 0 };
    for (const task of active) {
      const col = columns.find((c) => c.id === task.columnId);
      if (col?.semanticStatus === 'not-started') counts['Not Started']++;
      else if (col?.semanticStatus === 'in-progress') counts['In Progress']++;
      else if (col?.semanticStatus === 'done') counts['Done']++;
    }
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }));
  }, [tasks, columns]);

  if (data.length === 0) {
    return chartCard('Tasks by Status', <EmptyState message="No active tasks." />);
  }

  const total = data.reduce((s, d) => s + d.value, 0);

  return chartCard(
    'Tasks by Status',
    <div className="flex items-center gap-6">
      <PieChart width={180} height={180}>
        <Pie
          data={data}
          cx={90}
          cy={90}
          innerRadius={50}
          outerRadius={80}
          dataKey="value"
          paddingAngle={2}
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? COLORS.muted} />
          ))}
        </Pie>
        <Tooltip content={<SimpleTooltip />} />
      </PieChart>
      <div className="flex flex-col gap-2">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-2 text-xs">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: STATUS_COLORS[d.name] ?? COLORS.muted }}
            />
            <span className="text-muted-foreground">{d.name}</span>
            <span className="font-mono font-medium ml-1">{d.value}</span>
            <span className="text-muted-foreground">
              ({Math.round((d.value / total) * 100)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Backlog Aging bar chart ────────────────────────────────────────────────
function BacklogAging() {
  const { tasks } = useTaskContext();

  const data = useMemo(() => {
    const now = Date.now();
    const buckets: Record<string, number> = {
      '< 1 week':   0,
      '1–2 weeks':  0,
      '2–4 weeks':  0,
      '> 4 weeks':  0,
    };
    const backlog = tasks.filter(
      (t) => !t.sprintId && !t.archivedAt && !t.deletedAt && !t.parentId
    );
    for (const task of backlog) {
      const ageMs = now - new Date(task.createdAt).getTime();
      const ageDays = ageMs / 86_400_000;
      if (ageDays < 7) buckets['< 1 week']++;
      else if (ageDays < 14) buckets['1–2 weeks']++;
      else if (ageDays < 28) buckets['2–4 weeks']++;
      else buckets['> 4 weeks']++;
    }
    return Object.entries(buckets).map(([age, count]) => ({ age, count }));
  }, [tasks]);

  const hasData = data.some((d) => d.count > 0);

  if (!hasData) {
    return chartCard(
      'Backlog Aging',
      <EmptyState message="Backlog is empty — great work!" />
    );
  }

  return chartCard(
    'Backlog Aging',
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 16% 90%)" vertical={false} />
        <XAxis dataKey="age" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip content={<SimpleTooltip />} />
        <Bar dataKey="count" name="Tasks" fill={COLORS.amber} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Completion Trend ────────────────────────────────────────────────────────
function CompletionTrend() {
  const { tasks } = useTaskContext();

  const data = useMemo(() => {
    const days: { date: string; label: string; count: number }[] = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      days.push({ date: dateStr, label: dateStr.slice(5), count: 0 });
    }
    const byDate = new Map(days.map((d) => [d.date, d]));

    for (const task of tasks) {
      if (!task.archivedAt) continue;
      const date = task.archivedAt.slice(0, 10);
      const bucket = byDate.get(date);
      if (bucket) bucket.count++;
    }
    return days;
  }, [tasks]);

  const hasData = data.some((d) => d.count > 0);

  if (!hasData) {
    return chartCard(
      'Completion Trend (Last 30 Days)',
      <EmptyState message="No tasks completed in the last 30 days." />
    );
  }

  return chartCard(
    'Completion Trend (Last 30 Days)',
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(215 16% 90%)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          interval={4}
        />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip content={<SimpleTooltip />} />
        <Line
          type="monotone"
          dataKey="count"
          name="Completed"
          stroke={COLORS.green}
          dot={false}
          strokeWidth={2}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Main Charts page ───────────────────────────────────────────────────────
export default function Charts() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h2 className="text-xl font-semibold mb-6">Charts</h2>

      <div className="mb-8">
        {sectionTitle('Sprint Charts')}
        <div className="flex flex-col gap-5">
          <VelocityChart />
          <BurnCharts />
        </div>
      </div>

      <div>
        {sectionTitle('Todo Charts')}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <TasksByStatus />
          <BacklogAging />
          <div className="md:col-span-2">
            <CompletionTrend />
          </div>
        </div>
      </div>
    </div>
  );
}
