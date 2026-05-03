export interface AdminAction {
  id: number
  adminId?: number | null
  adminEmail?: string | null
  action: string
  targetType?: string | null
  targetId?: number | null
  subjectUserId?: number | null
  subjectUserEmail?: string | null
  ip?: string | null
  sessionId?: string | null
  userAgent?: string | null
  metadata?: Record<string, unknown> | null
  createdAt?: string | Date
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

export interface AuditSummary {
  totalCount: number
  byAdmin: Array<{
    adminId: number | null
    adminEmail: string | null
    count: number
  }>
  byAction: Array<{
    action: string
    count: number
  }>
  byUser: Array<{
    userId: number | null
    userEmail: string | null
    count: number
  }>
  byDay: Array<{
    day: string
    count: number
  }>
}

export interface PageData {
  adminActions: CursorPage<AdminAction>
  summary: AuditSummary
  error: string | null
}
