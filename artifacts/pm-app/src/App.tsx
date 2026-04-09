import { RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from './app/routes';
import { TaskProvider } from './app/contexts/TaskContext';
import { AuthProvider } from './app/contexts/AuthContext';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TaskProvider>
          <RouterProvider router={router} />
        </TaskProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
