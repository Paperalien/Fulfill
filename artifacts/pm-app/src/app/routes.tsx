import { createBrowserRouter } from 'react-router';
import Layout from './components/Layout';
import TodoList from './pages/TodoList';
import KanbanBoard from './pages/KanbanBoard';
import SprintManagement from './pages/SprintManagement';
import PlanningPoker from './pages/PlanningPoker';
import DoneFolder from './pages/DoneFolder';
import TrashBin from './pages/TrashBin';

const base = import.meta.env.BASE_URL.replace(/\/$/, '');

export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <Layout />,
      children: [
        { index: true, element: <TodoList /> },
        { path: 'kanban', element: <KanbanBoard /> },
        { path: 'sprints', element: <SprintManagement /> },
        { path: 'planning-poker', element: <PlanningPoker /> },
        { path: 'done', element: <DoneFolder /> },
        { path: 'trash', element: <TrashBin /> },
      ],
    },
  ],
  { basename: base }
);
