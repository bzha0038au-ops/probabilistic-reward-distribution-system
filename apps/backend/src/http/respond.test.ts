import type { FastifyReply } from "fastify";
import { describe, expect, it } from "vitest";
import { API_ERROR_CODES } from "@reward/shared-types/api";

import { sendError } from "./respond";

type ReplyStub = {
  payload?: unknown;
  statusCode?: number;
  send: (payload: unknown) => ReplyStub;
  status: (statusCode: number) => ReplyStub;
};

const createReplyStub = () => {
  const reply: ReplyStub = {
    statusCode: undefined,
    payload: undefined,
    status(statusCode) {
      reply.statusCode = statusCode;
      return reply;
    },
    send(payload) {
      reply.payload = payload;
      return reply;
    },
  };

  return reply as FastifyReply & ReplyStub;
};

describe("sendError", () => {
  it("derives a public error code for 4xx responses", () => {
    const reply = createReplyStub();

    sendError(reply, 409, "Draw cooldown active.");

    expect(reply.statusCode).toBe(409);
    expect(reply.payload).toMatchObject({
      ok: false,
      error: {
        message: "Draw cooldown active.",
        code: "DRAW_COOLDOWN_ACTIVE",
      },
    });
  });

  it("preserves explicit error codes when provided", () => {
    const reply = createReplyStub();

    sendError(
      reply,
      409,
      "Insufficient withdrawable balance.",
      undefined,
      API_ERROR_CODES.INSUFFICIENT_WITHDRAWABLE_BALANCE,
    );

    expect(reply.payload).toMatchObject({
      ok: false,
      error: {
        message: "Insufficient withdrawable balance.",
        code: "INSUFFICIENT_WITHDRAWABLE_BALANCE",
      },
    });
  });

  it("omits public codes for 5xx responses", () => {
    const reply = createReplyStub();

    sendError(
      reply,
      503,
      "Backend request failed.",
      undefined,
      API_ERROR_CODES.BACKEND_REQUEST_FAILED,
    );

    expect(reply.statusCode).toBe(503);
    expect(reply.payload).toMatchObject({
      ok: false,
      error: {
        message: "Backend request failed.",
        code: undefined,
      },
    });
  });
});
