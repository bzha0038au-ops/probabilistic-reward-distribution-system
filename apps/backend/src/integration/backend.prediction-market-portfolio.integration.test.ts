import {
  buildUserAuthHeaders,
  describeIntegrationSuite,
  expect,
  getApp,
  getDb,
  itIntegration as it,
  loginUser,
  registerUser,
  seedApprovedKycProfile,
  seedUserWithWallet,
  verifyUserContacts,
} from "./integration-test-support";
import { predictionMarkets, userWallets } from "@reward/database";
import { eq } from "@reward/database/orm";

import {
  createPredictionMarket,
  placePredictionPosition,
  sellPredictionPosition,
  settlePredictionMarket,
} from "../modules/prediction-market/service";

const MARKET_RULES = {
  resolutionRules:
    "Settlement uses the official close reported by the declared source of truth after the market lock time.",
  sourceOfTruth: "Official BTC/USD daily close",
  category: "crypto" as const,
  invalidPolicy: "refund_all" as const,
};

const updateWalletBalance = async (
  userId: number,
  withdrawableBalance: string,
) => {
  await getDb()
    .update(userWallets)
    .set({
      withdrawableBalance,
      updatedAt: new Date(),
    })
    .where(eq(userWallets.userId, userId));
};

const lockMarketForSettlement = async (marketId: number) => {
  await getDb()
    .update(predictionMarkets)
    .set({
      status: "locked",
      locksAt: new Date(Date.now() - 1_000),
      updatedAt: new Date(),
    })
    .where(eq(predictionMarkets.id, marketId));
};

const createMarket = async (params: {
  slug: string;
  roundKey: string;
  title: string;
  tags: [string, ...string[]];
}) =>
  createPredictionMarket({
    slug: params.slug,
    roundKey: params.roundKey,
    title: params.title,
    resolutionRules: MARKET_RULES.resolutionRules,
    sourceOfTruth: MARKET_RULES.sourceOfTruth,
    category: MARKET_RULES.category,
    tags: params.tags,
    invalidPolicy: MARKET_RULES.invalidPolicy,
    vigBps: 500,
    outcomes: [
      { key: "yes", label: "Yes" },
      { key: "no", label: "No" },
    ],
    opensAt: new Date(Date.now() - 60_000),
    locksAt: new Date(Date.now() + 3_600_000),
  });

describeIntegrationSuite(
  "backend prediction market portfolio integration",
  () => {
    it(
      "returns grouped open, resolved, and refunded prediction market records",
      { timeout: 20_000 },
      async () => {
        const viewerEmail = "prediction-portfolio-viewer@example.com";
        const viewerPassword = "secret-123";
        const viewer = await registerUser(viewerEmail, viewerPassword);
        await verifyUserContacts(viewer.id, { email: true });
        await updateWalletBalance(viewer.id, "100.00");
        const viewerSession = await loginUser(viewerEmail, viewerPassword);

        const counterparty = await seedUserWithWallet({
          email: "prediction-portfolio-counterparty@example.com",
          withdrawableBalance: "100.00",
        });
        await seedApprovedKycProfile(counterparty.id, "tier_1");

        const openMarket = await createMarket({
          slug: "btc-open-portfolio-view",
          roundKey: "btc-open-portfolio-view",
          title: "BTC holds above 100k this hour",
          tags: ["btc", "open-view"],
        });
        await placePredictionPosition(viewer.id, openMarket.id, {
          outcomeKey: "yes",
          stakeAmount: "15.00",
        });

        const resolvedMarket = await createMarket({
          slug: "btc-resolved-portfolio-view",
          roundKey: "btc-resolved-portfolio-view",
          title: "BTC closes green today",
          tags: ["btc", "resolved-view"],
        });
        await placePredictionPosition(viewer.id, resolvedMarket.id, {
          outcomeKey: "yes",
          stakeAmount: "20.00",
        });
        await placePredictionPosition(counterparty.id, resolvedMarket.id, {
          outcomeKey: "no",
          stakeAmount: "10.00",
        });
        await lockMarketForSettlement(resolvedMarket.id);
        await settlePredictionMarket(resolvedMarket.id, {
          winningOutcomeKey: "yes",
          oracle: {
            source: "integration_oracle",
            externalRef: "resolved-1",
          },
        });

        const refundedMarket = await createMarket({
          slug: "btc-refunded-portfolio-view",
          roundKey: "btc-refunded-portfolio-view",
          title: "BTC prints an impossible close",
          tags: ["btc", "refund-view"],
        });
        await placePredictionPosition(viewer.id, refundedMarket.id, {
          outcomeKey: "yes",
          stakeAmount: "12.00",
        });
        await placePredictionPosition(counterparty.id, refundedMarket.id, {
          outcomeKey: "yes",
          stakeAmount: "8.00",
        });
        await lockMarketForSettlement(refundedMarket.id);
        await settlePredictionMarket(refundedMarket.id, {
          winningOutcomeKey: "no",
          oracle: {
            source: "integration_oracle",
            externalRef: "refunded-1",
          },
        });

        const laterResolvedMarket = await createMarket({
          slug: "btc-resolved-portfolio-view-2",
          roundKey: "btc-resolved-portfolio-view-2",
          title: "BTC closes below weekly high",
          tags: ["btc", "resolved-view-2"],
        });
        await placePredictionPosition(viewer.id, laterResolvedMarket.id, {
          outcomeKey: "no",
          stakeAmount: "5.00",
        });
        await placePredictionPosition(counterparty.id, laterResolvedMarket.id, {
          outcomeKey: "yes",
          stakeAmount: "5.00",
        });
        await lockMarketForSettlement(laterResolvedMarket.id);
        await settlePredictionMarket(laterResolvedMarket.id, {
          winningOutcomeKey: "yes",
          oracle: {
            source: "integration_oracle",
            externalRef: "resolved-2",
          },
        });

        const soldMarket = await createMarket({
          slug: "btc-sold-portfolio-view",
          roundKey: "btc-sold-portfolio-view",
          title: "BTC exits before settlement",
          tags: ["btc", "sold-view"],
        });
        const soldPosition = await placePredictionPosition(
          viewer.id,
          soldMarket.id,
          {
            outcomeKey: "yes",
            stakeAmount: "6.00",
          },
        );
        await sellPredictionPosition(
          viewer.id,
          soldMarket.id,
          soldPosition.position.id,
        );

        const portfolioResponse = await getApp().inject({
          method: "GET",
          url: "/markets/portfolio?status=open",
          headers: buildUserAuthHeaders(viewerSession.token),
        });

        expect(portfolioResponse.statusCode).toBe(200);
        expect(portfolioResponse.json().data).toMatchObject({
          status: "open",
          summary: {
            marketCount: 1,
            positionCount: 1,
            totalStakeAmount: "15.00",
            openStakeAmount: "15.00",
            settledPayoutAmount: "0.00",
            refundedAmount: "0.00",
          },
          items: [
            {
              portfolioStatus: "open",
              totalStakeAmount: "15.00",
              openStakeAmount: "15.00",
              settledPayoutAmount: "0.00",
              refundedAmount: "0.00",
              positions: [
                {
                  outcomeKey: "yes",
                  stakeAmount: "15.00",
                  status: "open",
                },
              ],
              market: {
                slug: "btc-open-portfolio-view",
                status: "open",
              },
            },
          ],
        });

        const resolvedHistoryPageOne = await getApp().inject({
          method: "GET",
          url: "/markets/history?status=resolved&page=1&limit=1",
          headers: buildUserAuthHeaders(viewerSession.token),
        });

        expect(resolvedHistoryPageOne.statusCode).toBe(200);
        expect(resolvedHistoryPageOne.json().data).toMatchObject({
          status: "resolved",
          page: 1,
          limit: 1,
          hasNext: true,
          summary: {
            marketCount: 2,
            positionCount: 2,
            totalStakeAmount: "25.00",
            openStakeAmount: "0.00",
            settledPayoutAmount: "28.50",
            refundedAmount: "0.00",
          },
          items: [
            {
              portfolioStatus: "resolved",
              totalStakeAmount: "5.00",
              settledPayoutAmount: "0.00",
              refundedAmount: "0.00",
              positions: [
                {
                  outcomeKey: "no",
                  stakeAmount: "5.00",
                  status: "lost",
                },
              ],
              market: {
                slug: "btc-resolved-portfolio-view-2",
                status: "resolved",
              },
            },
          ],
        });

        const resolvedHistoryPageTwo = await getApp().inject({
          method: "GET",
          url: "/markets/history?status=resolved&page=2&limit=1",
          headers: buildUserAuthHeaders(viewerSession.token),
        });

        expect(resolvedHistoryPageTwo.statusCode).toBe(200);
        expect(resolvedHistoryPageTwo.json().data).toMatchObject({
          status: "resolved",
          page: 2,
          limit: 1,
          hasNext: false,
          items: [
            {
              portfolioStatus: "resolved",
              totalStakeAmount: "20.00",
              settledPayoutAmount: "28.50",
              refundedAmount: "0.00",
              positions: [
                {
                  outcomeKey: "yes",
                  stakeAmount: "20.00",
                  payoutAmount: "28.50",
                  status: "won",
                },
              ],
              market: {
                slug: "btc-resolved-portfolio-view",
                status: "resolved",
              },
            },
          ],
        });

        const refundedHistoryResponse = await getApp().inject({
          method: "GET",
          url: "/markets/history?status=refunded&page=1&limit=10",
          headers: buildUserAuthHeaders(viewerSession.token),
        });

        expect(refundedHistoryResponse.statusCode).toBe(200);
        expect(refundedHistoryResponse.json().data).toMatchObject({
          status: "refunded",
          page: 1,
          limit: 10,
          hasNext: false,
          summary: {
            marketCount: 2,
            positionCount: 2,
            totalStakeAmount: "18.00",
            openStakeAmount: "0.00",
            settledPayoutAmount: "0.00",
            refundedAmount: "18.00",
          },
          items: [
            {
              portfolioStatus: "refunded",
              totalStakeAmount: "6.00",
              settledPayoutAmount: "0.00",
              refundedAmount: "6.00",
              positions: [
                {
                  outcomeKey: "yes",
                  stakeAmount: "6.00",
                  payoutAmount: "6.00",
                  status: "sold",
                },
              ],
              market: {
                slug: "btc-sold-portfolio-view",
                status: "open",
              },
            },
            {
              portfolioStatus: "refunded",
              totalStakeAmount: "12.00",
              settledPayoutAmount: "0.00",
              refundedAmount: "12.00",
              positions: [
                {
                  outcomeKey: "yes",
                  stakeAmount: "12.00",
                  payoutAmount: "12.00",
                  status: "refunded",
                },
              ],
              market: {
                slug: "btc-refunded-portfolio-view",
                status: "resolved",
              },
            },
          ],
        });
      },
    );
  },
);
