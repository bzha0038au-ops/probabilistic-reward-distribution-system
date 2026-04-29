import { z } from 'zod';

import { MoneyLikeSchema, OptionalPositiveIntSchema } from './common';
import {
  CurrentLegalAcceptanceStateSchema,
  LegalAcceptanceInputSchema,
} from "./legal";

// Defer legal schema resolution so auth contracts do not depend on module
// initialization order when shared-types files are loaded through different runtimes.
const LegalAcceptanceInputRefSchema = z.lazy(() => LegalAcceptanceInputSchema);
const CurrentLegalAcceptanceStateRefSchema = z.lazy(
  () => CurrentLegalAcceptanceStateSchema,
);

export const AuthCredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type AuthCredentials = z.infer<typeof AuthCredentialsSchema>;

export const PhoneNumberSchema = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{7,14}$/, 'Invalid phone number.');

const isValidBirthDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf())) {
    return false;
  }

  return parsed.toISOString().slice(0, 10) === value;
};

export const BirthDateSchema = z
  .string()
  .trim()
  .refine(isValidBirthDate, 'Birth date must be in YYYY-MM-DD format.')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return parsed.getTime() <= Date.now();
  }, 'Birth date cannot be in the future.')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    const oldest = new Date();
    oldest.setUTCFullYear(oldest.getUTCFullYear() - 120);
    return parsed.getTime() >= oldest.getTime();
  }, 'Birth date is too far in the past.');

export const RegisterRequestSchema = AuthCredentialsSchema.extend({
  birthDate: BirthDateSchema,
  referrerId: OptionalPositiveIntSchema,
  deviceFingerprint: z.string().trim().min(1).max(255).optional(),
  legalAcceptances: z.array(LegalAcceptanceInputRefSchema).default([]),
});

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const UserSchema = z.object({
  id: z.number().int(),
  email: z.string().email(),
  role: z.enum(['user', 'admin']),
  emailVerifiedAt: z.string().datetime().nullable(),
  phoneVerifiedAt: z.string().datetime().nullable(),
});

export type User = z.infer<typeof UserSchema>;

export const AdminSchema = z.object({
  id: z.number().int(),
  email: z.string().email(),
  adminId: z.number().int(),
  mfaEnabled: z.boolean(),
});

export type Admin = z.infer<typeof AdminSchema>;

export const RegisterResponseSchema = z.object({
  id: z.number().int(),
  email: z.string().email(),
});

export type RegisterResponse = z.infer<typeof RegisterResponseSchema>;

export const UserSessionResponseSchema = z.object({
  token: z.string(),
  expiresAt: z.number(),
  sessionId: z.string().optional(),
  user: UserSchema,
  legal: CurrentLegalAcceptanceStateRefSchema.optional(),
});

export type UserSessionResponse = z.infer<typeof UserSessionResponseSchema>;

export const AdminSessionResponseSchema = z.object({
  token: z.string(),
  expiresAt: z.number(),
  sessionId: z.string().optional(),
  user: AdminSchema,
});

export type AdminSessionResponse = z.infer<typeof AdminSessionResponseSchema>;

export const UserMfaStatusResponseSchema = z.object({
  mfaEnabled: z.boolean(),
  largeWithdrawalThreshold: z.string(),
});

export type UserMfaStatusResponse = z.infer<typeof UserMfaStatusResponseSchema>;

export const UserMfaEnrollmentResponseSchema = z.object({
  secret: z.string().min(1),
  otpauthUrl: z.string().url(),
  enrollmentToken: z.string().min(1),
});

export type UserMfaEnrollmentResponse = z.infer<
  typeof UserMfaEnrollmentResponseSchema
>;

export const UserMfaVerifyRequestSchema = z.object({
  enrollmentToken: z.string().min(1),
  totpCode: z.string().min(6).max(8),
});

export type UserMfaVerifyRequest = z.infer<typeof UserMfaVerifyRequestSchema>;

export const UserMfaVerifyResponseSchema = z.object({
  mfaEnabled: z.literal(true),
});

export type UserMfaVerifyResponse = z.infer<typeof UserMfaVerifyResponseSchema>;

export const UserMfaDisableRequestSchema = z.object({
  totpCode: z.string().min(1).max(64),
});

export type UserMfaDisableRequest = z.infer<typeof UserMfaDisableRequestSchema>;

export const UserMfaDisableResponseSchema = z.object({
  mfaEnabled: z.literal(false),
});

export type UserMfaDisableResponse = z.infer<
  typeof UserMfaDisableResponseSchema
>;

export const BonusReleaseRequestSchema = z.object({
  userId: z.number().int().positive(),
  amount: MoneyLikeSchema,
});

export const AcceptedResponseSchema = z.object({
  accepted: z.literal(true),
});

export const CompletedResponseSchema = z.object({
  completed: z.literal(true),
});

export type AcceptedResponse = z.infer<typeof AcceptedResponseSchema>;
export type CompletedResponse = z.infer<typeof CompletedResponseSchema>;

export const PasswordResetRequestSchema = z.object({
  email: z.string().email(),
});

export type PasswordResetRequest = z.infer<typeof PasswordResetRequestSchema>;

export const PasswordResetConfirmSchema = z.object({
  token: z.string().min(20).max(255),
  password: z.string().min(6).max(255),
});

export type PasswordResetConfirmRequest = z.infer<typeof PasswordResetConfirmSchema>;

export const EmailVerificationRequestSchema = z.object({
  resend: z.boolean().optional(),
});

export type EmailVerificationRequest = z.infer<typeof EmailVerificationRequestSchema>;

export const VerificationTokenConfirmSchema = z.object({
  token: z.string().min(20).max(255),
});

export type VerificationTokenConfirmRequest = z.infer<
  typeof VerificationTokenConfirmSchema
>;

export const EmailVerificationResponseSchema = z.object({
  verified: z.literal(true),
  email: z.string().email(),
});

export type EmailVerificationResponse = z.infer<typeof EmailVerificationResponseSchema>;

export const PhoneVerificationRequestSchema = z.object({
  phone: PhoneNumberSchema,
});

export type PhoneVerificationRequest = z.infer<typeof PhoneVerificationRequestSchema>;

export const PhoneVerificationConfirmSchema = z.object({
  phone: PhoneNumberSchema,
  code: z.string().regex(/^\d{6}$/, 'Invalid verification code.'),
});

export type PhoneVerificationConfirmRequest = z.infer<
  typeof PhoneVerificationConfirmSchema
>;

export const PhoneVerificationResponseSchema = z.object({
  verified: z.literal(true),
  phone: PhoneNumberSchema,
});

export type PhoneVerificationResponse = z.infer<typeof PhoneVerificationResponseSchema>;

export const AuthSessionSummarySchema = z.object({
  sessionId: z.string(),
  kind: z.enum(['user', 'admin']),
  role: z.enum(['user', 'admin']),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.string().datetime().nullable(),
  lastSeenAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
  current: z.boolean(),
});

export type AuthSessionSummary = z.infer<typeof AuthSessionSummarySchema>;

export const CurrentUserSessionResponseSchema = z.object({
  user: UserSchema,
  session: AuthSessionSummarySchema,
  legal: CurrentLegalAcceptanceStateRefSchema,
});

export type CurrentUserSessionResponse = z.infer<
  typeof CurrentUserSessionResponseSchema
>;

export const UserRealtimeTokenResponseSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.number().int().positive(),
});

export type UserRealtimeTokenResponse = z.infer<
  typeof UserRealtimeTokenResponseSchema
>;

export const UserSessionsResponseSchema = z.object({
  items: z.array(AuthSessionSummarySchema),
});

export type UserSessionsResponse = z.infer<typeof UserSessionsResponseSchema>;

export const SessionRevocationResponseSchema = z.object({
  revoked: z.literal(true),
  scope: z.enum(['current', 'single']),
  sessionId: z.string().optional(),
});

export type SessionRevocationResponse = z.infer<
  typeof SessionRevocationResponseSchema
>;

export const SessionBulkRevocationResponseSchema = z.object({
  revokedCount: z.number().int().nonnegative(),
  scope: z.literal('all'),
});

export type SessionBulkRevocationResponse = z.infer<
  typeof SessionBulkRevocationResponseSchema
>;
