import type {
  JurisdictionFeature,
  UserFreezeReason,
  UserFreezeScope,
} from "@reward/shared-types/risk"

export interface AuthEvent {
  id: number
  userId?: number | null
  email?: string | null
  eventType: string
  ip?: string | null
  userAgent?: string | null
  metadata?: Record<string, unknown> | null
  createdAt?: string
}

export interface FreezeRecord {
  id: number
  userId: number
  reason: UserFreezeReason
  scope: UserFreezeScope
  status: string
  createdAt?: string
  releasedAt?: string | null
}

export interface JurisdictionRule {
  id: number
  countryCode: string
  minimumAge: number
  allowedFeatures: JurisdictionFeature[]
  notes?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface CursorPage<T> {
  items: T[]
  limit: number
  hasNext: boolean
  hasPrevious: boolean
  nextCursor?: string | null
  prevCursor?: string | null
  direction: "next" | "prev"
  sort: "asc" | "desc"
}

export interface Paginated<T> {
  items: T[]
  page: number
  limit: number
  hasNext: boolean
}

export interface PageData {
  authEvents: CursorPage<AuthEvent>
  freezeRecords: Paginated<FreezeRecord>
  jurisdictionRules: JurisdictionRule[]
  error: string | null
}
