import { createValidator } from "../../shared/validation";

export type AuthPayload = {
  email: string;
  password: string;
  referrerId?: number;
  totpCode?: string;
  breakGlassCode?: string;
};

const schema = {
  type: "object",
  required: ["email", "password"],
  additionalProperties: false,
  properties: {
    email: { type: "string", minLength: 3, maxLength: 255 },
    password: { type: "string", minLength: 6, maxLength: 255 },
    referrerId: { type: "integer", minimum: 1 },
    totpCode: { type: "string", minLength: 1, maxLength: 32 },
    breakGlassCode: { type: "string", minLength: 1, maxLength: 255 },
  },
} as const;

export const validateAuth = createValidator<AuthPayload>(schema);
