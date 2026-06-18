import { useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router';
import {
  ListTodo,
  LayoutGrid,
  Calendar,
  BarChart2,
  Vote,
  Archive,
  Trash2,
  Menu,
} from 'lucide-react';
import { useTaskContext } from '../contexts/TaskContext';
import { useAuth } from '../contexts/AuthContext';
import { ReminderBanner } from './ReminderBanner';
import { AuthArea } from './AuthArea';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

function Brand() {
  return (
    <span className="text-base font-bold tracking-tight text-foreground">Fulfill</span>
  );
}

// Green "beta" pill, matching the app's existing badges (DoneFolder, Sprint "Active").
// Lives in the main pane's top strip so it stays visible when the sidebar collapses
// on narrow screens.
function BetaPill() {
  return (
    <span className="rounded-full bg-green-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide leading-none text-white dark:bg-green-500">
      beta
    </span>
  );
}

const NAV_ITEMS = [
  { to: '/', label: 'To-Do', icon: ListTodo, end: true },
  { to: '/kanban', label: 'Kanban', icon: LayoutGrid },
  { to: '/sprints', label: 'Sprint', icon: Calendar },
  { to: '/charts', label: 'Charts', icon: BarChart2 },
  { to: '/planning-poker', label: 'Planning Poker', icon: Vote },
  { to: '/done', label: 'Done', icon: Archive },
  { to: '/trash', label: 'Trash', icon: Trash2 },
];

interface NavProps {
  archivedCount: number;
  trashCount: number;
  onNavigate?: () => void;
}

function SidebarNav({ archivedCount, trashCount, onNavigate }: NavProps) {
  return (
    <nav className="flex-1 py-2">
      {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 min-h-[44px] text-sm transition-colors w-full ${
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
  );
}

export default function Layout() {
  const { tasks, columns, doneColumnIds } = useTaskContext();
  const { isAuthenticated } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  const pageLabel = NAV_ITEMS.find(({ to, end }) =>
    end ? pathname === to : pathname.startsWith(to)
  )?.label ?? 'Fulfill';

  const active = tasks.filter((t) => !t.archivedAt && !t.deletedAt);
  const inProgressCount = active.filter((t) => {
    const col = columns.find((c) => c.id === t.columnId);
    return col?.semanticStatus === 'in-progress';
  }).length;
  const archivedCount = tasks.filter((t) => t.archivedAt && !t.deletedAt).length;
  const trashCount = tasks.filter((t) => t.deletedAt).length;

  const navProps = { archivedCount, trashCount };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar — hidden below md breakpoint */}
      <aside className="hidden md:flex w-56 shrink-0 border-r border-border bg-sidebar flex-col">
        <div className="px-4 py-5 border-b border-border">
          <Brand />
          {inProgressCount > 0 && (
            <p className="text-xs text-blue-600 mt-0.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse inline-block" />
              {inProgressCount} in progress
            </p>
          )}
          <div className="mt-2">
            {isAuthenticated ? <WorkspaceSwitcher /> : <AuthArea />}
          </div>
        </div>
        <SidebarNav {...navProps} />
        <div className="px-4 py-3 border-t border-border">
          <p className="text-xs text-muted-foreground">{active.length} active tasks</p>
        </div>
      </aside>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-56 p-0 bg-sidebar border-r border-border [&>button]:hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <div className="px-4 py-5 border-b border-border">
            <Brand />
            {inProgressCount > 0 && (
              <p className="text-xs text-blue-600 mt-0.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse inline-block" />
                {inProgressCount} in progress
              </p>
            )}
            <div className="mt-2">
              <AuthArea />
            </div>
          </div>
          <SidebarNav {...navProps} onNavigate={() => setMobileOpen(false)} />
          <div className="px-4 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground">{active.length} active tasks</p>
          </div>
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-auto flex flex-col bg-background">
        {/* Top strip — always visible so the BETA badge survives the responsive
            sidebar collapse. On mobile it also holds the nav toggle + page label. */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-sidebar shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="md:hidden p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>
          <BetaPill />
          <span className="md:hidden text-sm font-semibold">{pageLabel}</span>
        </div>
        <ReminderBanner />
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
