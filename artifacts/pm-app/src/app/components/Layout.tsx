import { Outlet, NavLink } from 'react-router';
import {
  ListTodo,
  LayoutGrid,
  Calendar,
  Vote,
  Archive,
  Trash2,
} from 'lucide-react';
import { useTaskContext } from '../contexts/TaskContext';

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

export default function Layout() {
  const { tasks } = useTaskContext();

  const doneCount = tasks.filter((t) => t.archivedAt && !t.deletedAt).length;
  const trashCount = tasks.filter(
    (t) => t.deletedAt && Date.now() - new Date(t.deletedAt).getTime() < THIRTY_DAYS
  ).length;

  const navItems = [
    { to: '/', label: 'To-Do List', icon: ListTodo },
    { to: '/kanban', label: 'Kanban', icon: LayoutGrid },
    { to: '/sprints', label: 'Sprints', icon: Calendar },
    { to: '/planning-poker', label: 'Planning Poker', icon: Vote },
    { to: '/done', label: 'Done', icon: Archive, count: doneCount },
    { to: '/trash', label: 'Trash', icon: Trash2, count: trashCount },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <aside className="w-56 shrink-0 border-r border-border bg-sidebar flex flex-col">
        <div className="px-4 py-5 border-b border-sidebar-border">
          <h1 className="text-base font-semibold text-sidebar-foreground tracking-tight">
            Project Manager
          </h1>
        </div>
        <nav className="flex-1 py-3 overflow-y-auto">
          {navItems.map(({ to, label, icon: Icon, count }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2 text-sm rounded-md mx-2 mb-0.5 transition-colors ${
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'
                }`
              }
              data-testid={`nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <Icon size={16} className="shrink-0" />
              <span className="flex-1">{label}</span>
              {count !== undefined && count > 0 && (
                <span className="text-xs bg-sidebar-primary text-sidebar-primary-foreground rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                  {count}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
