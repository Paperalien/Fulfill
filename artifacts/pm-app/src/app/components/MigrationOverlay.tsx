interface Props {
  status: 'migrating' | 'error';
  onRetry: () => void;
}

export function MigrationOverlay({ status, onRetry }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 text-center max-w-xs px-6">
        {status === 'migrating' ? (
          <>
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
            <p className="text-sm font-medium text-foreground">Saving your data…</p>
            <p className="text-xs text-muted-foreground">
              Uploading your local tasks to your account. This only takes a moment.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-foreground">Something went wrong</p>
            <p className="text-xs text-muted-foreground">
              Your local data is safe. We couldn't reach the server — check your connection and try again.
            </p>
            <button
              onClick={onRetry}
              className="mt-1 text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Retry
            </button>
          </>
        )}
      </div>
    </div>
  );
}
