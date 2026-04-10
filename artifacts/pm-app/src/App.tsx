import { ReactNode } from 'react';
import { RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from './app/routes';
import { TaskProvider } from './app/contexts/TaskContext';
import { AuthProvider } from './app/contexts/AuthContext';
import { Toaster } from './components/ui/sonner';
import { MigrationOverlay } from './app/components/MigrationOverlay';
import { useMigration } from './app/hooks/useMigration';

const queryClient = new QueryClient();

function MigrationBoundary({ children }: { children: ReactNode }) {
  const { status, retry } = useMigration();
  return (
    <>
      {children}
      {(status === 'migrating' || status === 'error') && (
        <MigrationOverlay status={status} onRetry={retry} />
      )}
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TaskProvider>
          <MigrationBoundary>
            <RouterProvider router={router} />
            <Toaster />
          </MigrationBoundary>
        </TaskProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
