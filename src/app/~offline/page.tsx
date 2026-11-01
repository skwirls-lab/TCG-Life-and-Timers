export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-2xl font-semibold">You&apos;re offline</h1>
      <p className="text-fg-muted">
        This page isn&apos;t cached yet. Your games still work offline from the home screen.
      </p>
    </main>
  );
}
