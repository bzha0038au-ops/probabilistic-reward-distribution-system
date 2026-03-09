import { z } from 'zod';

import { MoneyLikeSchema, OptionalPositiveIntSchema } from './common';

export const AuthCredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type AuthCredentials = z.infer<typeof AuthCredentialsSchema>;

export const RegisterRequestSchema = AuthCredentialsSchema.extend({
  referrerId: OptionalPositiveIntSchema,
});

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const UserSchema = z.object({
  id: z.number().int(),
  email: z.string().email(),
  role: z.enum(['user', 'admin']),
});

export const AdminSchema = z.object({
  id: z.number().int(),
  email: z.string().email(),
});

export const RegisterResponseSchema = z.object({
  id: z.number().int(),
  email: z.string().email(),
});

export const UserSessionResponseSchema = z.object({
  token: z.string(),
  expiresAt: z.number(),
  user: UserSchema,
});

export const AdminSessionResponseSchema = z.object({
  token: z.string(),
  expiresAt: z.number(),
  user: AdminSchema,
});

export const BonusReleaseRequestSchema = z.object({
  userId: z.number().int().positive(),
  amount: MoneyLikeSchema,
});
