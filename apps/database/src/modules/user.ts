import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { countryTierValues } from "@reward/shared-types/risk";

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 32 }),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    role: varchar("role", { length: 20 }).notNull().default("user"),
    birthDate: date("birth_date", { mode: "string" }),
    registrationCountryCode: varchar("registration_country_code", {
      length: 2,
    }),
    countryTier: varchar("country_tier", {
      length: 16,
      enum: countryTierValues,
    })
      .notNull()
      .default("unknown"),
    countryResolvedAt: timestamp("country_resolved_at", { withTimezone: true }),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
    userPoolBalance: numeric("user_pool_balance", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    pityStreak: integer("pity_streak").notNull().default(0),
    lastDrawAt: timestamp("last_draw_at", { withTimezone: true }),
    lastWinAt: timestamp("last_win_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    emailUnique: uniqueIndex("users_email_unique").on(table.email),
    phoneUnique: uniqueIndex("users_phone_unique").on(table.phone),
    registrationCountryIdx: index("users_registration_country_idx").on(
      table.registrationCountryCode,
    ),
    userPoolBalanceIdx: index("users_user_pool_balance_idx").on(
      table.userPoolBalance,
    ),
  }),
);

export const admins = pgTable(
  "admins",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    displayName: varchar("display_name", { length: 160 }),
    isActive: boolean("is_active").notNull().default(true),
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    mfaSecretCiphertext: text("mfa_secret_ciphertext"),
    mfaRecoveryCodeHashes: jsonb("mfa_recovery_code_hashes"),
    mfaRecoveryCodesGeneratedAt: timestamp("mfa_recovery_codes_generated_at", {
      withTimezone: true,
    }),
    mfaEnabledAt: timestamp("mfa_enabled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userUnique: uniqueIndex("admins_user_id_unique").on(table.userId),
  }),
);

export const adminPermissions = pgTable(
  "admin_permissions",
  {
    id: serial("id").primaryKey(),
    adminId: integer("admin_id")
      .notNull()
      .references(() => admins.id, { onDelete: "cascade" }),
    permissionKey: varchar("permission_key", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    adminPermissionUnique: uniqueIndex("admin_permissions_unique").on(
      table.adminId,
      table.permissionKey,
    ),
  }),
);
