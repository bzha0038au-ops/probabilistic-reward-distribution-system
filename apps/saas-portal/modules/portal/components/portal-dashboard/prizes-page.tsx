import type { FormEvent, FormEventHandler } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  PortalPrizesSubview,
  PortalSelection,
} from "@/modules/portal/lib/portal";

type PrizesPageProps = {
  currentProject: PortalSelection["currentProject"];
  currentProjectId: number | null;
  currentProjectPrizes: PortalSelection["currentProjectPrizes"];
  handleCreatePrize: FormEventHandler<HTMLFormElement>;
  handleDeletePrize: (prizeId: number) => void;
  handleUpdatePrize: (
    event: FormEvent<HTMLFormElement>,
    prizeId: number,
  ) => void;
  isPending: boolean;
  prizesSubview: PortalPrizesSubview | null;
};

export function PortalDashboardPrizesPage({
  currentProject,
  currentProjectId,
  currentProjectPrizes,
  handleCreatePrize,
  handleDeletePrize,
  handleUpdatePrize,
  isPending,
  prizesSubview,
}: PrizesPageProps) {
  const activeSubview = prizesSubview ?? "catalog";

  if (activeSubview === "envelope") {
    return (
      <section className="grid gap-6">
        <Card className="portal-shell-card-dark portal-fade-up portal-fade-up-delay-2 overflow-hidden rounded-[2rem] text-slate-100">
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-full bg-white/10 px-3 py-1 text-slate-200 hover:bg-white/10">
                Reward envelope
              </Badge>
              <Badge className="rounded-full bg-white/10 px-3 py-1 text-slate-200 hover:bg-white/10">
                Current project
              </Badge>
            </div>
            <CardTitle className="text-white tracking-[-0.04em]">
              Project reward envelope
            </CardTitle>
            <CardDescription className="text-slate-400">
              Reference the current project mechanics while editing the catalog.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {currentProject ? (
              <>
                {[
                  ["Strategy", currentProject.strategy],
                  [
                    "Pool balance",
                    `${currentProject.prizePoolBalance} ${currentProject.currency}`,
                  ],
                  ["Draw cap", String(currentProject.maxDrawCount)],
                  ["Miss weight", String(currentProject.missWeight)],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="portal-kpi-card rounded-[1.45rem] p-4"
                  >
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                      {label}
                    </p>
                    <p className="mt-2 text-sm font-medium text-white">
                      {value}
                    </p>
                  </div>
                ))}
              </>
            ) : (
              <p className="text-sm text-slate-400">
                Select a project to inspect its reward configuration.
              </p>
            )}
          </CardContent>
        </Card>
      </section>
    );
  }

  if (activeSubview === "summary") {
    return (
      <section className="grid gap-6">
        <Card className="portal-shell-card portal-fade-up portal-fade-up-delay-3 overflow-hidden rounded-[2rem] bg-white/92">
          <CardHeader className="gap-3">
            <CardTitle className="tracking-[-0.03em] text-slate-950">
              Catalog summary
            </CardTitle>
            <CardDescription>
              Fast counts for the selected project catalog.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {[
              [
                "Active prizes",
                String(
                  currentProjectPrizes.filter((prize) => prize.isActive).length,
                ),
              ],
              ["Total prizes", String(currentProjectPrizes.length)],
            ].map(([label, value]) => (
              <div
                key={label}
                className="portal-soft-metric rounded-[1.45rem] p-4"
              >
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                  {label}
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">
                  {value}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="grid gap-6">
      <Card className="portal-shell-card-strong portal-fade-up portal-fade-up-delay-1 overflow-hidden rounded-[2rem] bg-white/94">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="rounded-full bg-sky-100 px-3 py-1 text-sky-800 hover:bg-sky-100">
              Catalog operations
            </Badge>
            {currentProject ? (
              <Badge className="rounded-full bg-white text-slate-700 shadow-sm hover:bg-white">
                {currentProject.name} · {currentProject.environment}
              </Badge>
            ) : null}
          </div>
          <CardTitle className="tracking-[-0.04em] text-slate-950">
            Prize catalog editor
          </CardTitle>
          <CardDescription>
            Adjust weights, stock, activation, and reward amounts within the
            selected project.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <form
            onSubmit={handleCreatePrize}
            className="portal-soft-metric grid gap-4 rounded-[1.7rem] p-4 md:grid-cols-2"
          >
            <div className="grid gap-2">
              <Label htmlFor="prize-name">Prize name</Label>
              <Input
                id="prize-name"
                name="name"
                placeholder="Gold capsule"
                className="portal-field rounded-2xl"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="prize-reward">Reward amount</Label>
              <Input
                id="prize-reward"
                name="rewardAmount"
                placeholder="25.00"
                className="portal-field rounded-2xl"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="prize-stock">Stock</Label>
              <Input
                id="prize-stock"
                name="stock"
                type="number"
                min="0"
                defaultValue="0"
                className="portal-field rounded-2xl"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="prize-weight">Weight</Label>
              <Input
                id="prize-weight"
                name="weight"
                type="number"
                min="1"
                defaultValue="1"
                className="portal-field rounded-2xl"
              />
            </div>
            <label className="portal-hover-rise flex items-center gap-3 rounded-[1.15rem] border border-slate-200/90 bg-white/92 px-3 py-2 text-sm text-slate-700 md:col-span-2">
              <input
                className="size-4 rounded border-slate-300"
                type="checkbox"
                name="isActive"
                defaultChecked
              />
              <span>Active prize</span>
            </label>
            <div className="flex justify-end md:col-span-2">
              <Button
                type="submit"
                className="rounded-2xl px-4 shadow-[0_18px_44px_rgba(11,123,189,0.22)]"
                disabled={!currentProjectId || isPending}
              >
                Create prize
              </Button>
            </div>
          </form>

          <div className="flex flex-col gap-4">
            {currentProjectPrizes.length > 0 ? (
              currentProjectPrizes.map((prize) => (
                <form
                  key={prize.id}
                  onSubmit={(event) => {
                    handleUpdatePrize(event, prize.id);
                  }}
                  className="portal-shell-card grid gap-4 rounded-[1.75rem] bg-white/92 p-4 md:grid-cols-[1.3fr_repeat(3,minmax(0,0.7fr))_auto]"
                >
                  <div className="grid gap-2">
                    <Label htmlFor={`prize-name-${prize.id}`}>Name</Label>
                    <Input
                      id={`prize-name-${prize.id}`}
                      name="name"
                      defaultValue={prize.name}
                      className="portal-field rounded-2xl"
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`prize-stock-${prize.id}`}>Stock</Label>
                    <Input
                      id={`prize-stock-${prize.id}`}
                      name="stock"
                      type="number"
                      min="0"
                      defaultValue={String(prize.stock)}
                      className="portal-field rounded-2xl"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`prize-weight-${prize.id}`}>Weight</Label>
                    <Input
                      id={`prize-weight-${prize.id}`}
                      name="weight"
                      type="number"
                      min="1"
                      defaultValue={String(prize.weight)}
                      className="portal-field rounded-2xl"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`prize-reward-${prize.id}`}>Reward</Label>
                    <Input
                      id={`prize-reward-${prize.id}`}
                      name="rewardAmount"
                      defaultValue={prize.rewardAmount}
                      className="portal-field rounded-2xl"
                    />
                  </div>
                  <div className="portal-soft-metric flex flex-col justify-between gap-3 rounded-[1.25rem] p-3">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        className="size-4 rounded border-slate-300"
                        type="checkbox"
                        name="isActive"
                        defaultChecked={prize.isActive}
                      />
                      <span>Active</span>
                    </label>
                    <div className="flex gap-2">
                      <Button
                        type="submit"
                        size="sm"
                        className="rounded-xl"
                        disabled={isPending}
                      >
                        Save
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-xl border-slate-200 bg-white/90 hover:border-rose-200 hover:bg-rose-50"
                        onClick={() => {
                          handleDeletePrize(prize.id);
                        }}
                        disabled={isPending}
                      >
                        Archive
                      </Button>
                    </div>
                  </div>
                </form>
              ))
            ) : (
              <p className="text-sm text-slate-500">
                No prizes are configured for the selected project yet.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
