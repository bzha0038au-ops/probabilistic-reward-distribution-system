import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
        <header>
          <h1 className="text-2xl font-semibold text-slate-900">
            Admin Console
          </h1>
          <p className="text-sm text-slate-600">
            Manage prizes, weights, and draw analytics.
          </p>
        </header>

        <section className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Prize Configuration</CardTitle>
              <CardDescription>
                Adjust weights, stock, thresholds, and status.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-slate-600">
              Use the `/api/admin/prizes` endpoints to manage prize pool entries.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Analytics</CardTitle>
              <CardDescription>
                Track draw counts, win rates, and top spenders.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-slate-600">
              Summary data is exposed via `/api/admin/analytics/summary`.
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
