'use client';

import { Button } from '@/components/ui/button';

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main
      id="main"
      role="alert"
      className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        The page could not be displayed. Please try again.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
