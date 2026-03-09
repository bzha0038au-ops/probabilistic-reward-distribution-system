import { DrawPanel } from '@/components/app/draw-panel';
import { Button } from '@/components/ui/button';
import { auth, signOut } from '@/lib/auth';

export default async function AppPage() {
  const session = await auth();

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">User Dashboard</h1>
            <p className="text-sm text-slate-400">
              Signed in as {session?.user?.email}
            </p>
          </div>
          <form
            action={async () => {
              'use server';
              await signOut();
            }}
          >
            <Button variant="outline">Sign Out</Button>
          </form>
        </header>

        <section className="grid gap-6 md:grid-cols-2">
          <DrawPanel />
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">
            <h2 className="text-base font-semibold text-slate-100">
              Wallet & Ledger Notes
            </h2>
            <ul className="mt-3 space-y-2">
              <li>All debits and credits are written to the ledger.</li>
              <li>Draws run inside a single database transaction.</li>
              <li>Inventory is locked before stock deduction.</li>
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
