import type { FormEvent, FormEventHandler } from "react";

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
import type { PortalSelection } from "@/modules/portal/lib/portal";

type PrizesPageProps = {
  currentProject: PortalSelection["currentProject"];
  currentProjectId: number | null;
  currentProjectPrizes: PortalSelection["currentProjectPrizes"];
  handleCreatePrize: FormEventHandler<HTMLFormElement>;
  handleDeletePrize: (prizeId: number) => void;
  handleUpdatePrize: (event: FormEvent<HTMLFormElement>, prizeId: number) => void;
  isPending: boolean;
};

export function PortalDashboardPrizesPage({
  currentProject,
  currentProjectId,
  currentProjectPrizes,
  handleCreatePrize,
  handleDeletePrize,
  handleUpdatePrize,
  isPending,
}: PrizesPageProps) {
  return (
    <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <Card className="border-slate-200 bg-white/90">
        <CardHeader className="gap-2">
          <CardTitle>Prize catalog editor</CardTitle>
          <CardDescription>
            Adjust weights, stock, activation, and reward amounts within the
            selected project.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <form
            onSubmit={handleCreatePrize}
            className="grid gap-4 rounded-3xl border border-slate-200 bg-slate-50/70 p-4 md:grid-cols-2"
          >
            <div className="grid gap-2">
              <Label htmlFor="prize-name">Prize name</Label>
              <Input
                id="prize-name"
                name="name"
                placeholder="Gold capsule"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="prize-reward">Reward amount</Label>
              <Input
                id="prize-reward"
                name="rewardAmount"
                placeholder="25.00"
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
              />
            </div>
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 md:col-span-2">
              <input
                className="size-4 rounded border-slate-300"
                type="checkbox"
                name="isActive"
                defaultChecked
              />
              <span>Active prize</span>
            </label>
            <div className="flex justify-end md:col-span-2">
              <Button type="submit" disabled={!currentProjectId || isPending}>
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
                  className="grid gap-4 rounded-[1.75rem] border border-slate-200 bg-white p-4 md:grid-cols-[1.3fr_repeat(3,minmax(0,0.7fr))_auto]"
                >
                  <div className="grid gap-2">
                    <Label htmlFor={`prize-name-${prize.id}`}>Name</Label>
                    <Input
                      id={`prize-name-${prize.id}`}
                      name="name"
                      defaultValue={prize.name}
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
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`prize-reward-${prize.id}`}>Reward</Label>
                    <Input
                      id={`prize-reward-${prize.id}`}
                      name="rewardAmount"
                      defaultValue={prize.rewardAmount}
                    />
                  </div>
                  <div className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
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
                      <Button type="submit" size="sm" disabled={isPending}>
                        Save
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
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

      <div className="grid gap-6">
        <Card className="border-slate-200 bg-slate-950 text-slate-100">
          <CardHeader className="gap-2">
            <CardTitle className="text-white">
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
                    className="rounded-3xl border border-white/10 bg-white/[0.05] p-4"
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

        <Card className="border-slate-200 bg-white/90">
          <CardHeader className="gap-2">
            <CardTitle>Catalog summary</CardTitle>
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
                className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4"
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
      </div>
    </section>
  );
}
