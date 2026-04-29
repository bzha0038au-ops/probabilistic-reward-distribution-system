import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_ERROR_CODES } from "@reward/shared-types/api";

import { resetConfig } from "../../shared/config";
import { resetInMemoryRateLimiters } from "../../shared/rate-limit";
import { guardCommunitySubmission } from "./anti-spam-service";

const originalEnv = {
  databaseUrl: process.env.DATABASE_URL,
  communityCaptchaProvider: process.env.COMMUNITY_CAPTCHA_PROVIDER,
  communityCaptchaSecret: process.env.COMMUNITY_CAPTCHA_SECRET,
  communityModerationProvider: process.env.COMMUNITY_MODERATION_PROVIDER,
  communityModerationOpenAiApiKey:
    process.env.COMMUNITY_MODERATION_OPENAI_API_KEY,
  communityModerationOpenAiModel: process.env.COMMUNITY_MODERATION_OPENAI_MODEL,
  communityModerationKeywordList: process.env.COMMUNITY_MODERATION_KEYWORD_LIST,
};

describe("community anti-spam service", () => {
  beforeEach(() => {
    process.env.DATABASE_URL =
      originalEnv.databaseUrl ??
      "postgres://reward:reward@localhost:5432/reward_test";
    delete process.env.COMMUNITY_CAPTCHA_PROVIDER;
    delete process.env.COMMUNITY_CAPTCHA_SECRET;
    delete process.env.COMMUNITY_MODERATION_PROVIDER;
    delete process.env.COMMUNITY_MODERATION_OPENAI_API_KEY;
    delete process.env.COMMUNITY_MODERATION_OPENAI_MODEL;
    delete process.env.COMMUNITY_MODERATION_KEYWORD_LIST;
    resetConfig();
    resetInMemoryRateLimiters();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    resetConfig();
    resetInMemoryRateLimiters();
    vi.unstubAllGlobals();

    if (originalEnv.databaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalEnv.databaseUrl;
    }

    if (originalEnv.communityCaptchaProvider === undefined) {
      delete process.env.COMMUNITY_CAPTCHA_PROVIDER;
    } else {
      process.env.COMMUNITY_CAPTCHA_PROVIDER =
        originalEnv.communityCaptchaProvider;
    }

    if (originalEnv.communityCaptchaSecret === undefined) {
      delete process.env.COMMUNITY_CAPTCHA_SECRET;
    } else {
      process.env.COMMUNITY_CAPTCHA_SECRET = originalEnv.communityCaptchaSecret;
    }

    if (originalEnv.communityModerationProvider === undefined) {
      delete process.env.COMMUNITY_MODERATION_PROVIDER;
    } else {
      process.env.COMMUNITY_MODERATION_PROVIDER =
        originalEnv.communityModerationProvider;
    }

    if (originalEnv.communityModerationOpenAiApiKey === undefined) {
      delete process.env.COMMUNITY_MODERATION_OPENAI_API_KEY;
    } else {
      process.env.COMMUNITY_MODERATION_OPENAI_API_KEY =
        originalEnv.communityModerationOpenAiApiKey;
    }

    if (originalEnv.communityModerationOpenAiModel === undefined) {
      delete process.env.COMMUNITY_MODERATION_OPENAI_MODEL;
    } else {
      process.env.COMMUNITY_MODERATION_OPENAI_MODEL =
        originalEnv.communityModerationOpenAiModel;
    }

    if (originalEnv.communityModerationKeywordList === undefined) {
      delete process.env.COMMUNITY_MODERATION_KEYWORD_LIST;
    } else {
      process.env.COMMUNITY_MODERATION_KEYWORD_LIST =
        originalEnv.communityModerationKeywordList;
    }
  });

  it("queues and auto-hides posts with stacked heuristic spam signals", async () => {
    process.env.COMMUNITY_MODERATION_KEYWORD_LIST = "airdrop, guaranteed";
    resetConfig();

    const result = await guardCommunitySubmission({
      userId: 42,
      kycTier: "tier_1",
      action: "thread",
      title: "Guaranteed airdrop",
      body: "Join our telegram at https://t.me/example for guaranteed rewards",
    });

    expect(result.reviewRequired).toBe(true);
    expect(result.autoHidden).toBe(true);
    expect(result.queuedReport).toMatchObject({
      source: "automated_signal",
      metadata: expect.objectContaining({
        autoHidden: true,
        signalProviders: expect.arrayContaining([
          "keyword",
          "link",
          "contact",
        ]),
      }),
    });
  });

  it("rate limits tier_1 thread creation more aggressively than tier_2", async () => {
    await guardCommunitySubmission({
      userId: 8,
      kycTier: "tier_1",
      action: "thread",
      title: "One",
      body: "First post",
    });
    await guardCommunitySubmission({
      userId: 8,
      kycTier: "tier_1",
      action: "thread",
      title: "Two",
      body: "Second post",
    });

    await expect(
      guardCommunitySubmission({
        userId: 8,
        kycTier: "tier_1",
        action: "thread",
        title: "Three",
        body: "Third post",
      }),
    ).rejects.toMatchObject({
      statusCode: 429,
      code: API_ERROR_CODES.TOO_MANY_REQUESTS,
    });
  });

  it("requires captcha for tier_1 writers when captcha enforcement is enabled", async () => {
    process.env.COMMUNITY_CAPTCHA_PROVIDER = "turnstile";
    process.env.COMMUNITY_CAPTCHA_SECRET = "turnstile-secret";
    resetConfig();

    await expect(
      guardCommunitySubmission({
        userId: 15,
        kycTier: "tier_1",
        action: "reply",
        body: "Legitimate reply",
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: API_ERROR_CODES.COMMUNITY_CAPTCHA_REQUIRED,
    });
  });

  it("queues content from the OpenAI moderation provider when the score is high", async () => {
    process.env.COMMUNITY_MODERATION_PROVIDER = "openai";
    process.env.COMMUNITY_MODERATION_OPENAI_API_KEY = "openai-key";
    process.env.COMMUNITY_MODERATION_OPENAI_MODEL = "omni-moderation-latest";
    resetConfig();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: "omni-moderation-latest",
        results: [
          {
            flagged: true,
            categories: {
              illicit: true,
            },
            category_scores: {
              illicit: 0.91,
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await guardCommunitySubmission({
      userId: 27,
      kycTier: "tier_2",
      action: "reply",
      body: "unsafe content example",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.reviewRequired).toBe(true);
    expect(result.queuedReport?.metadata).toMatchObject({
      signalProviders: ["openai"],
      autoHidden: true,
    });
  });
});
