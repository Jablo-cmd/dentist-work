import { AlertTriangle, Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { ApiRequestError } from '@/lib/api';
import { Button } from './button';

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden />
      <p className="font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const e = error instanceof ApiRequestError ? error : null;
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <AlertTriangle className="h-8 w-8 text-danger" aria-hidden />
      <p className="font-medium">Something went wrong</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {e?.message ?? 'An unexpected error occurred.'}
      </p>
      {e?.requestId && <p className="text-xs text-muted-foreground">Reference: {e.requestId}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
