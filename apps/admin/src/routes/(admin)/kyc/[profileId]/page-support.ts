import type { KycAdminDetail } from "@reward/shared-types/kyc"

export type PageData = {
  detail: KycAdminDetail | null
  error: string | null
}
