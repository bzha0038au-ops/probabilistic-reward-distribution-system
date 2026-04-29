import {
  drawRecords,
  experimentAssignments,
  experiments,
  missions,
} from "@reward/database";
import { and, eq } from "@reward/database/orm";

import {
  buildUserAuthHeaders,
  describeIntegrationSuite,
  expect,
  getApp,
  getCreateUserSessionToken,
  getDb,
  itIntegration as it,
  seedUserWithWallet,
} from "./integration-test-support";

describeIntegrationSuite("backend experiments", () => {
  it("returns sticky variants from the user experiment API", async () => {
    await getDb().insert(experiments).values({
      key: "reward-copy-rollout",
      description: "Integration UI copy rollout",
      status: "active",
      defaultVariantKey: "control",
      variants: [
        {
          key: "control",
          weight: 1,
          payload: {
            headline: "Control copy",
            cta: "Claim reward",
          },
        },
        {
          key: "treatment",
          weight: 1,
          payload: {
            headline: "Treatment copy",
            cta: "Unlock reward",
          },
        },
      ],
    });

    const user = await seedUserWithWallet({
      email: "experiment-user@example.com",
      withdrawableBalance: "0.00",
    });
    const { token } = await getCreateUserSessionToken()({
      userId: user.id,
      email: user.email,
      role: "user",
    });

    const firstResponse = await getApp().inject({
      method: "GET",
      url: "/experiments/reward-copy-rollout/variant",
      headers: buildUserAuthHeaders(token),
    });
    expect(firstResponse.statusCode).toBe(200);

    const secondResponse = await getApp().inject({
      method: "GET",
      url: "/experiments/reward-copy-rollout/variant",
      headers: buildUserAuthHeaders(token),
    });
    expect(secondResponse.statusCode).toBe(200);

    const firstVariant = firstResponse.json().data as {
      expKey: string;
      variantKey: "control" | "treatment";
      payload: {
        headline: string;
        cta: string;
      };
      assignedAt: string | null;
      source: string;
    };
    const secondVariant = secondResponse.json().data as typeof firstVariant;

    expect(firstVariant.expKey).toBe("reward-copy-rollout");
    expect(firstVariant.variantKey).toBe(secondVariant.variantKey);
    expect(firstVariant.payload).toEqual(secondVariant.payload);
    expect(firstVariant.assignedAt).toEqual(secondVariant.assignedAt);
    expect(firstVariant.source).toBe("assignment");

    const expectedHeadline =
      firstVariant.variantKey === "control"
        ? "Control copy"
        : "Treatment copy";
    expect(firstVariant.payload.headline).toBe(expectedHeadline);

    const storedAssignments = await getDb()
      .select({
        variantKey: experimentAssignments.variantKey,
      })
      .from(experimentAssignments)
      .innerJoin(
        experiments,
        eq(experimentAssignments.experimentId, experiments.id),
      )
      .where(
        and(
          eq(experimentAssignments.subjectType, "user"),
          eq(experimentAssignments.subjectKey, String(user.id)),
          eq(experiments.key, "reward-copy-rollout"),
        ),
      );

    expect(storedAssignments).toEqual([
      { variantKey: firstVariant.variantKey },
    ]);
  });

  it("merges variant payloads into generic strategy-like configs", async () => {
    await getDb().insert(experiments).values({
      key: "strategy-gray",
      description: "Integration strategy params rollout",
      status: "active",
      defaultVariantKey: "treatment",
      variants: [
        {
          key: "treatment",
          weight: 1,
          payload: {
            epsilon: 0.25,
            risk: {
              halfLifeSeconds: 7200,
            },
          },
        },
      ],
    });

    const {
      buildSaasProjectPlayerExperimentSubject,
      resolveExperimentConfig,
    } = await import(
      "../modules/experiments/service"
    );
    const subject = buildSaasProjectPlayerExperimentSubject(77, "player-alpha");

    const firstResult = await resolveExperimentConfig({
      subject,
      config: {
        epsilon: 0.05,
        risk: {
          halfLifeSeconds: 1800,
          decayAlpha: 0.2,
        },
        experiment: {
          expKey: "strategy-gray",
        },
      },
    });
    const secondResult = await resolveExperimentConfig({
      subject,
      config: {
        epsilon: 0.05,
        risk: {
          halfLifeSeconds: 1800,
          decayAlpha: 0.2,
        },
        experiment: {
          expKey: "strategy-gray",
        },
      },
    });

    expect(firstResult.variant).toMatchObject({
      expKey: "strategy-gray",
      variantKey: "treatment",
      source: "assignment",
    });
    expect(secondResult.variant?.assignedAt).toEqual(
      firstResult.variant?.assignedAt,
    );
    expect(firstResult.config).toEqual({
      epsilon: 0.25,
      risk: {
        halfLifeSeconds: 7200,
        decayAlpha: 0.2,
      },
    });

    const storedAssignments = await getDb()
      .select({
        subjectType: experimentAssignments.subjectType,
        subjectKey: experimentAssignments.subjectKey,
        variantKey: experimentAssignments.variantKey,
      })
      .from(experimentAssignments)
      .innerJoin(
        experiments,
        eq(experimentAssignments.experimentId, experiments.id),
      )
      .where(
        and(
          eq(experimentAssignments.subjectType, "saas_project_player"),
          eq(experimentAssignments.subjectKey, "77:player-alpha"),
          eq(experiments.key, "strategy-gray"),
        ),
      );

    expect(storedAssignments).toEqual([
      {
        subjectType: "saas_project_player",
        subjectKey: "77:player-alpha",
        variantKey: "treatment",
      },
    ]);
  });

  it("resolves mission params through experiment bindings in reward center", async () => {
    await getDb().insert(experiments).values({
      key: "mission-target-rollout",
      description: "Integration mission params rollout",
      status: "active",
      defaultVariantKey: "treatment",
      variants: [
        {
          key: "treatment",
          weight: 1,
          payload: {
            title: "Variant draw mission",
            description: "Need two draws before the reward unlocks.",
            target: 2,
          },
        },
      ],
    });

    await getDb().insert(missions).values({
      id: "variant_draw_mission",
      type: "metric_threshold",
      reward: "4.00",
      isActive: true,
      params: {
        title: "Base draw mission",
        description: "One draw should unlock this in the control path.",
        metric: "draw_count_all",
        target: 1,
        cadence: "one_time",
        sortOrder: 610,
        experiment: {
          expKey: "mission-target-rollout",
        },
      },
    });

    const user = await seedUserWithWallet({
      email: "mission-experiment-user@example.com",
      withdrawableBalance: "0.00",
    });
    const { token } = await getCreateUserSessionToken()({
      userId: user.id,
      email: user.email,
      role: "user",
    });

    await getDb().insert(drawRecords).values({
      userId: user.id,
      prizeId: null,
      drawCost: "1.00",
      rewardAmount: "0.00",
      status: "miss",
      metadata: {
        reason: "integration_seed",
      },
    });

    const response = await getApp().inject({
      method: "GET",
      url: "/rewards/center",
      headers: buildUserAuthHeaders(token),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.missions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "variant_draw_mission",
          title: "Variant draw mission",
          description: "Need two draws before the reward unlocks.",
          progressCurrent: 1,
          progressTarget: 2,
          status: "in_progress",
          claimable: false,
        }),
      ]),
    );
  });
});
