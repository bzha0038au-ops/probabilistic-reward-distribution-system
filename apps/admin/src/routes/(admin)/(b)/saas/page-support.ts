import type {
  SaasOverview,
  SaasTenantProvisioning,
} from "@reward/shared-types/saas"

export interface PageData {
  overview: SaasOverview | null
  error: string | null
  inviteToken: string | null
  billingSetupStatus: string | null
  admin?: { email?: string } | null
}

export type InviteResult = {
  invite: {
    id: number
    email: string
    role: string
  }
  inviteUrl: string
}

export type RiskEnvelopeDraftResult = {
  id: number
  status: string
  summary: string
}

export type HelloRewardQuickstart = {
  tenantName: string
  projectId: number
  projectName: string
  projectSlug: string
  environment: "sandbox" | "live"
  apiKeyLabel: string
  apiKeyExpiresAt: string | Date
  fileName: string
  command: string
}

export type TenantProvisioned = SaasTenantProvisioning
