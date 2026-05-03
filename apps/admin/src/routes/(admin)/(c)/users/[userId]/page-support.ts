export type FreezeRecord = {
  id: number
  userId: number
  category: string
  reason: string
  scope: string
  status: string
  metadata?: Record<string, unknown> | null
  createdAt: string
  releasedAt?: string | null
}

export type PageData = {
  detail: {
    user: {
      id: number
      email: string
      phone: string | null
      role: string
      birthDate: string | null
      registrationCountryCode: string | null
      countryTier: string
      countryResolvedAt?: string | null
      createdAt: string
      updatedAt: string
      emailVerifiedAt?: string | null
      phoneVerifiedAt?: string | null
      userPoolBalance: string
      pityStreak: number
      lastDrawAt?: string | null
      lastWinAt?: string | null
      kycProfileId?: number | null
      kycTier: string
      kycTierSource: string
      activeScopes: string[]
      jurisdiction: {
        registrationCountryCode: string | null
        birthDate: string | null
        countryTier: string
        minimumAge: number
        userAge: number | null
        isOfAge: boolean
        allowedFeatures: string[]
        blockedScopes: string[]
        restrictionReasons: string[]
        countryResolvedAt?: string | null
      }
    }
    wallet: {
      withdrawableBalance: string
      bonusBalance: string
      lockedBalance: string
      wageredAmount: string
      updatedAt?: string | null
    }
    freezes: FreezeRecord[]
    recentDraws: Array<{
      id: number
      prizeId: number | null
      prizeName: string | null
      status: string
      drawCost: string
      rewardAmount: string
      createdAt: string
    }>
    recentPayments: Array<{
      id: number
      flow: "deposit" | "withdrawal"
      amount: string
      status: string
      channelType: string
      assetType: string
      assetCode: string | null
      network: string | null
      createdAt: string
      updatedAt: string
    }>
    recentLoginIps: Array<{
      id: number
      eventType: string
      ip: string | null
      userAgent: string | null
      createdAt: string
    }>
  } | null
  error: string | null
}
