import { z } from 'zod';

import { MoneyLikeSchema, OptionalPositiveIntSchema } from './common';

export const AuthCredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type AuthCredentials = z.infer<typeof AuthCredentialsSchema>;

export const PhoneNumberSchema = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{7,14}$/, 'Invalid phone number.');

export const RegisterRequestSchema = AuthCredentialsSchema.extend({
  referrerId: OptionalPositiveIntSchema,
});

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const UserSchema = z.object({
  id: z.number().int(),
  email: z.string().email(),
  role: z.enum(['user', 'admin']),
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
});

export type UserSessionResponse = z.infer<typeof UserSessionResponseSchema>;

export const AdminSessionResponseSchema = z.object({
  token: z.string(),
  expiresAt: z.number(),
  sessionId: z.string().optional(),
  user: AdminSchema,
});

export type AdminSessionResponse = z.infer<typeof AdminSessionResponseSchema>;

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

export const PasswordResetRequestSchema = z.object({
  email: z.string().email(),
});

export const PasswordResetConfirmSchema = z.object({
  token: z.string().min(20).max(255),
  password: z.string().min(6).max(255),
});

export const EmailVerificationRequestSchema = z.object({
  resend: z.boolean().optional(),
});

export const VerificationTokenConfirmSchema = z.object({
  token: z.string().min(20).max(255),
});

export const EmailVerificationResponseSchema = z.object({
  verified: z.literal(true),
  email: z.string().email(),
});

export const PhoneVerificationRequestSchema = z.object({
  phone: PhoneNumberSchema,
});

export const PhoneVerificationConfirmSchema = z.object({
  phone: PhoneNumberSchema,
  code: z.string().regex(/^\d{6}$/, 'Invalid verification code.'),
});

export const PhoneVerificationResponseSchema = z.object({
  verified: z.literal(true),
  phone: PhoneNumberSchema,
});
