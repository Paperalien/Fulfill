import { Outlet, NavLink } from 'react-router';
import {
  ListTodo,
  LayoutGrid,
  Calendar,
  Dices,
  Archive,
  Trash2,
} from 'lucide-react';
import { useTaskContext } from '../contexts/TaskContext';
import { ReminderBanner } from './ReminderBanner';

const NAV_ITEMS = [
  { to: '/', label: 'To-Do', icon: ListTodo, end: true },
  { to: '/kanban', label: 'Kanban', icon: LayoutGrid },
  { to: '/sprints', label: 'Sprint', icon: Calendar },
  { to: '/planning-poker', label: 'Planning Poker', icon: Dices },
  { to: '/done', label: 'Done', icon: Archive },
  { to: '/trash', label: 'Trash', icon: Trash2 },
];

export default function Layout() {
  const { tasks, columns, doneColumnIds } = useTaskContext();

  const active = tasks.filter((t) => !t.archivedAt && !t.deletedAt);
  const inProgressCount = active.filter((t) => {
    const col = columns.find((c) => c.id === t.columnId);
    return col?.semanticStatus === 'in-progress';
  }).length;
  const doneIds = new Set(doneColumnIds());
  const archivedCount = tasks.filter((t) => t.archivedAt && !t.deletedAt).length;
  const trashCount = tasks.filter((t) => t.deletedAt).length;

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-border bg-card flex flex-col">
        <div className="px-4 py-5 border-b border-border">
          <h1 className="text-base font-bold tracking-tight text-foreground">Project Manager</h1>
          {inProgressCount > 0 && (
            <p className="text-xs text-blue-600 mt-0.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse inline-block" />
              {inProgressCount} in progress
            </p>
          )}
        </div>
        <nav className="flex-1 py-2">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`
              }
            >
              <Icon size={16} />
              <span className="flex-1">{label}</span>
              {label === 'Done' && archivedCount > 0 && (
                <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">
                  {archivedCount}
                </span>
              )}
              {label === 'Trash' && trashCount > 0 && (
                <span className="text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-full">
                  {trashCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-border">
          <p className="text-xs text-muted-foreground">{active.length} active tasks</p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 overflow-auto flex flex-col">
        <ReminderBanner />
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
