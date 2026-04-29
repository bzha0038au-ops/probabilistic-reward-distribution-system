import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import {
  ApiFailureSchema,
  ApiSuccessSchema,
} from "@reward/shared-types/api";
import { DrawFairnessCommitSchema } from "@reward/shared-types/draw";
import { FairnessRevealSchema } from "@reward/shared-types/fairness";
import {
  PrizeEngineDrawRequestSchema,
  PrizeEngineDrawResponseSchema,
  PrizeEngineLedgerResponseSchema,
  PrizeEngineOverviewSchema,
  PrizeEngineProjectObservabilitySchema,
  PrizeEngineRewardRequestSchema,
  PrizeEngineRewardResponseSchema,
} from "@reward/shared-types/saas";

type OpenApiSchema = Record<string, unknown>;

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(currentDir, "..");
const outputPath = path.join(
  siteRoot,
  "static",
  "openapi",
  "prize-engine.openapi.json",
);

const toOpenApiSchema = (schema: z.ZodTypeAny): OpenApiSchema => {
  const converted = zodToJsonSchema(schema, {
    target: "openApi3",
    $refStrategy: "none",
    effectStrategy: "input",
    dateStrategy: "format:date-time",
    strictUnions: true,
  }) as OpenApiSchema;

  delete converted.$schema;
  delete converted.definitions;
  return converted;
};

const ref = (name: string) => ({
  $ref: `#/components/schemas/${name}`,
});

const commonHeaders = {
  "X-Prize-Engine-Environment": {
    description: "The resolved project environment for the response.",
    schema: {
      type: "string",
      enum: ["sandbox", "live"],
    },
  },
  "X-Prize-Engine-Sandbox": {
    description: "Present when the request was served from the sandbox environment.",
    schema: {
      type: "string",
      example: "true",
    },
  },
  "X-Prize-Engine-Warning": {
    description: "Human-readable sandbox safety warning.",
    schema: {
      type: "string",
      example: "SANDBOX - non-billable and isolated from live distribution",
    },
  },
};

const standardErrors = {
  400: {
    description: "The request body or query string failed validation.",
    content: {
      "application/json": {
        schema: ref("ErrorEnvelope"),
      },
    },
  },
  401: {
    description: "The API key was missing or invalid.",
    content: {
      "application/json": {
        schema: ref("ErrorEnvelope"),
      },
    },
  },
  429: {
    description: "The API key or project exhausted an auth or rate-limit budget.",
    headers: {
      "Retry-After": {
        description: "Number of seconds until the caller should retry.",
        schema: {
          type: "string",
        },
      },
    },
    content: {
      "application/json": {
        schema: ref("ErrorEnvelope"),
      },
    },
  },
  500: {
    description: "The backend failed while processing the request.",
    content: {
      "application/json": {
        schema: ref("ErrorEnvelope"),
      },
    },
  },
};

const environmentQueryParameter = {
  name: "environment",
  in: "query",
  required: true,
  description: "Target project environment.",
  schema: {
    type: "string",
    enum: ["sandbox", "live"],
  },
};

const apiSecurity = [{ bearerAuth: [] }, { apiKeyAuth: [] }];

async function main() {
  const document = {
    openapi: "3.0.3",
    info: {
      title: "Reward Prize Engine API",
      version: "0.1.0",
      description:
        "Tenant-facing Prize Engine endpoints for catalog reads, fairness verification, reward decisions, observability, and ledger lookups.",
    },
    tags: [
      {
        name: "Prize Engine",
        description: "External B-side reward engine API.",
      },
    ],
    servers: [
      {
        url: "https://api.reward.system",
        description: "Production API host",
      },
      {
        url: "http://localhost:3001",
        description: "Local backend",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "API key",
          description: "Preferred transport for project API keys.",
        },
        apiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
          description: "Alternative header-based project API key transport.",
        },
      },
      schemas: {
        ErrorEnvelope: toOpenApiSchema(ApiFailureSchema),
        PrizeEngineOverview: toOpenApiSchema(PrizeEngineOverviewSchema),
        PrizeEngineOverviewEnvelope: toOpenApiSchema(
          ApiSuccessSchema(PrizeEngineOverviewSchema),
        ),
        PrizeEngineFairnessCommit: toOpenApiSchema(DrawFairnessCommitSchema),
        PrizeEngineFairnessCommitEnvelope: toOpenApiSchema(
          ApiSuccessSchema(DrawFairnessCommitSchema),
        ),
        PrizeEngineFairnessReveal: toOpenApiSchema(FairnessRevealSchema),
        PrizeEngineFairnessRevealEnvelope: toOpenApiSchema(
          ApiSuccessSchema(FairnessRevealSchema),
        ),
        PrizeEngineRewardRequest: toOpenApiSchema(PrizeEngineRewardRequestSchema),
        PrizeEngineRewardResponse: toOpenApiSchema(PrizeEngineRewardResponseSchema),
        PrizeEngineRewardResponseEnvelope: toOpenApiSchema(
          ApiSuccessSchema(PrizeEngineRewardResponseSchema),
        ),
        PrizeEngineLegacyDrawRequest: toOpenApiSchema(PrizeEngineDrawRequestSchema),
        PrizeEngineDrawResponse: toOpenApiSchema(PrizeEngineDrawResponseSchema),
        PrizeEngineDrawResponseEnvelope: toOpenApiSchema(
          ApiSuccessSchema(PrizeEngineDrawResponseSchema),
        ),
        PrizeEngineProjectObservability: toOpenApiSchema(
          PrizeEngineProjectObservabilitySchema,
        ),
        PrizeEngineProjectObservabilityEnvelope: toOpenApiSchema(
          ApiSuccessSchema(PrizeEngineProjectObservabilitySchema),
        ),
        PrizeEngineLedgerResponse: toOpenApiSchema(PrizeEngineLedgerResponseSchema),
        PrizeEngineLedgerResponseEnvelope: toOpenApiSchema(
          ApiSuccessSchema(PrizeEngineLedgerResponseSchema),
        ),
      },
    },
    paths: {
      "/v1/engine/overview": {
        get: {
          tags: ["Prize Engine"],
          summary: "Fetch the current project catalog and fairness commit.",
          description:
            "Returns the active project, fairness commit, and prize catalog for the requested environment.",
          security: apiSecurity,
          parameters: [environmentQueryParameter],
          responses: {
            200: {
              description: "Overview loaded.",
              headers: commonHeaders,
              content: {
                "application/json": {
                  schema: ref("PrizeEngineOverviewEnvelope"),
                },
              },
            },
            ...standardErrors,
          },
        },
      },
      "/v1/engine/fairness/commit": {
        get: {
          tags: ["Prize Engine"],
          summary: "Read the active fairness commit for the current epoch.",
          security: apiSecurity,
          parameters: [environmentQueryParameter],
          responses: {
            200: {
              description: "Fairness commit loaded.",
              headers: commonHeaders,
              content: {
                "application/json": {
                  schema: ref("PrizeEngineFairnessCommitEnvelope"),
                },
              },
            },
            ...standardErrors,
          },
        },
      },
      "/v1/engine/fairness/reveal": {
        get: {
          tags: ["Prize Engine"],
          summary: "Reveal a fairness seed for a past epoch.",
          security: apiSecurity,
          parameters: [
            environmentQueryParameter,
            {
              name: "epoch",
              in: "query",
              required: true,
              description: "Epoch number to reveal.",
              schema: {
                type: "integer",
                minimum: 0,
              },
            },
          ],
          responses: {
            200: {
              description: "Fairness seed revealed.",
              headers: commonHeaders,
              content: {
                "application/json": {
                  schema: ref("PrizeEngineFairnessRevealEnvelope"),
                },
              },
            },
            ...standardErrors,
          },
        },
      },
      "/v1/engine/rewards": {
        post: {
          tags: ["Prize Engine"],
          summary: "Create an idempotent reward decision.",
          description:
            "Primary write route for tenants. Replayed idempotency keys return the original decision with a 200.",
          security: apiSecurity,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: ref("PrizeEngineRewardRequest"),
                example: {
                  environment: "sandbox",
                  agent: {
                    agentId: "agent-checkout-bot",
                    groupId: "cohort-a",
                  },
                  behavior: {
                    actionType: "checkout.completed",
                    score: 0.82,
                    risk: 0.18,
                  },
                  budget: {
                    amount: "3.00",
                    currency: "USD",
                    window: "day",
                  },
                  idempotencyKey: "rw-checkout-2026-04-29-0001",
                },
              },
            },
          },
          responses: {
            200: {
              description:
                "Existing reward decision replayed for the same idempotency key.",
              headers: commonHeaders,
              content: {
                "application/json": {
                  schema: ref("PrizeEngineRewardResponseEnvelope"),
                },
              },
            },
            201: {
              description: "Reward decision created.",
              headers: commonHeaders,
              content: {
                "application/json": {
                  schema: ref("PrizeEngineRewardResponseEnvelope"),
                },
              },
            },
            ...standardErrors,
          },
        },
      },
      "/v1/engine/draws": {
        post: {
          tags: ["Prize Engine"],
          summary: "Legacy gacha-style draw route.",
          description:
            "Deprecated compatibility path. New tenants should integrate against /v1/engine/rewards.",
          security: apiSecurity,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: ref("PrizeEngineLegacyDrawRequest"),
                example: {
                  environment: "sandbox",
                  player: {
                    playerId: "player-42",
                    displayName: "Checkout cohort",
                  },
                  groupId: "cohort-a",
                  risk: 0.18,
                  idempotencyKey: "dr-checkout-2026-04-29-0001",
                },
              },
            },
          },
          responses: {
            200: {
              description: "Legacy draw completed.",
              headers: {
                ...commonHeaders,
                Deprecation: {
                  description: "Signals that this route is deprecated.",
                  schema: { type: "string", example: "true" },
                },
                Sunset: {
                  description: "RFC 1123 timestamp for route sunset.",
                  schema: {
                    type: "string",
                    example: "Tue, 28 Oct 2026 00:00:00 GMT",
                  },
                },
                Link: {
                  description: "Successor route relation.",
                  schema: {
                    type: "string",
                    example: "</v1/engine/rewards>; rel=\"successor-version\"",
                  },
                },
              },
              content: {
                "application/json": {
                  schema: ref("PrizeEngineDrawResponseEnvelope"),
                },
              },
            },
            ...standardErrors,
          },
        },
      },
      "/v1/engine/observability/distribution": {
        get: {
          tags: ["Prize Engine"],
          summary: "Inspect distribution drift and payout observability.",
          security: apiSecurity,
          parameters: [
            environmentQueryParameter,
            {
              name: "days",
              in: "query",
              required: false,
              description: "Trailing window size in days.",
              schema: {
                type: "integer",
                minimum: 1,
                maximum: 90,
              },
            },
          ],
          responses: {
            200: {
              description: "Observability report loaded.",
              headers: commonHeaders,
              content: {
                "application/json": {
                  schema: ref("PrizeEngineProjectObservabilityEnvelope"),
                },
              },
            },
            ...standardErrors,
          },
        },
      },
      "/v1/engine/ledger": {
        get: {
          tags: ["Prize Engine"],
          summary: "Fetch a player ledger slice for a project environment.",
          security: apiSecurity,
          parameters: [
            environmentQueryParameter,
            {
              name: "playerId",
              in: "query",
              required: true,
              description: "External player identifier.",
              schema: {
                type: "string",
                minLength: 1,
                maxLength: 128,
              },
            },
            {
              name: "limit",
              in: "query",
              required: false,
              description: "Maximum number of ledger entries to return.",
              schema: {
                type: "integer",
                minimum: 1,
                maximum: 100,
              },
            },
          ],
          responses: {
            200: {
              description: "Ledger loaded.",
              headers: commonHeaders,
              content: {
                "application/json": {
                  schema: ref("PrizeEngineLedgerResponseEnvelope"),
                },
              },
            },
            ...standardErrors,
          },
        },
      },
    },
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  process.stdout.write(`Generated ${path.relative(siteRoot, outputPath)}\n`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
