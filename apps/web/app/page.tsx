import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-sky-50 text-slate-900">
      <div className="pointer-events-none absolute -top-32 right-0 h-72 w-72 rounded-full bg-brand-200/50 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-80 w-80 rounded-full bg-brand-300/40 blur-3xl" />

      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-brand-600" />
          <span className="text-lg font-semibold tracking-tight">
            Prize Pool Engine
          </span>
        </div>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/app" className="text-slate-600 hover:text-slate-900">
            Dashboard
          </Link>
          <Link href="/login" className="text-slate-600 hover:text-slate-900">
            Sign In
          </Link>
          <Button asChild size="sm">
            <Link href="/register">Get Started</Link>
          </Button>
        </nav>
      </header>

      <section className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-12 px-6 py-12 lg:grid-cols-2">
        <div className="space-y-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
            Probabilistic Reward Distribution
          </p>
          <h1 className="text-4xl font-semibold leading-tight text-slate-900 md:text-5xl">
            A transactional prize pool platform built for precision and scale.
          </h1>
          <p className="text-lg text-slate-600">
            Model wallet-safe draws, dynamic prize pools, weighted probabilities,
            and admin analytics in a single cohesive system. Designed for
            portfolio-grade engineering quality.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href="/register">Launch the Demo</Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="/app">View Dashboard</Link>
            </Button>
          </div>
          <div className="flex flex-wrap gap-6 text-sm text-slate-500">
            <div>
              <span className="block text-2xl font-semibold text-slate-900">
                100%
              </span>
              Transaction-safe draws
            </div>
            <div>
              <span className="block text-2xl font-semibold text-slate-900">
                6+
              </span>
              Core modules wired
            </div>
            <div>
              <span className="block text-2xl font-semibold text-slate-900">
                0
              </span>
              Real payment risk
            </div>
          </div>
        </div>
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Draw Engine Snapshot</CardTitle>
              <CardDescription>
                Wallet → Weighted pick → Stock lock → Ledger
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm text-slate-600">
              <div className="flex items-center justify-between">
                <span>Wallet balance check</span>
                <span className="font-semibold text-slate-900">Atomic</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Prize eligibility filter</span>
                <span className="font-semibold text-slate-900">Dynamic</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Inventory lock</span>
                <span className="font-semibold text-slate-900">Row-level</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Ledger logging</span>
                <span className="font-semibold text-slate-900">Guaranteed</span>
              </div>
            </CardContent>
          </Card>
          <Card className="border-brand-200/60 bg-brand-50/70">
            <CardHeader>
              <CardTitle>Admin Control Surface</CardTitle>
              <CardDescription>
                Adjust weights, monitor pool balance, audit draw stats.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-slate-600">
              Live configuration, no redeploys. Every edit is reflected instantly
              in the draw engine.
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              title: 'Wallet + Ledger',
              copy: 'Balance changes are atomic, audited, and traceable per draw.',
            },
            {
              title: 'Prize Pool Control',
              copy: 'Weighted probabilities with threshold gating and stock locks.',
            },
            {
              title: 'Admin Analytics',
              copy: 'Monitor wins, spend leaders, and pool health in real time.',
            },
          ].map((item) => (
            <Card key={item.title}>
              <CardHeader>
                <CardTitle className="text-lg">{item.title}</CardTitle>
                <CardDescription>{item.copy}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm md:flex md:items-center md:justify-between">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-slate-900">
              Ready to stress-test the engine?
            </h2>
            <p className="text-slate-600">
              Spin up the demo, configure prizes, and watch the ledger update in
              real time.
            </p>
          </div>
          <div className="mt-6 flex gap-3 md:mt-0">
            <Button asChild>
              <Link href="/register">Create Account</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/app">Open Dashboard</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white/70">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-4 px-6 py-6 text-sm text-slate-500 md:flex-row md:items-center">
          <span>© 2026 Prize Pool Engine. Portfolio prototype.</span>
          <div className="flex items-center gap-4">
            <Link href="/app" className="hover:text-slate-900">
              App
            </Link>
            <Link href="/admin" className="hover:text-slate-900">
              Admin
            </Link>
            <Link href="/login" className="hover:text-slate-900">
              Sign In
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
