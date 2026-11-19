import Link from 'next/link';

export default function NotFound() {
  return (
    <main
      id="main"
      className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <Link href="/" className="text-sm font-medium text-primary underline">
        Back to overview
      </Link>
    </main>
  );
}
