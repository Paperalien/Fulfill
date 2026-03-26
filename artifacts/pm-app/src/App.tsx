import { RouterProvider } from 'react-router';
import { router } from './app/routes';
import { TaskProvider } from './app/contexts/TaskContext';

export default function App() {
  return (
    <TaskProvider>
      <RouterProvider router={router} />
    </TaskProvider>
  );
}
