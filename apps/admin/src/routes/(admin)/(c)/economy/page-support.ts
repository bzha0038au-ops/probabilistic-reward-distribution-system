export type EconomyOverview = {
  assetTotals: Array<{
    assetCode: string
    userCount: number
    availableBalance: string
    lockedBalance: string
  }>
  giftSummary: {
    sentTodayCount: number
    sentTodayAmount: string
    sentLast24hCount: number
    sentLast24hAmount: string
  }
  energySummary: {
    exhaustedCount: number
    belowMaxCount: number
    accountCount: number
  }
  orderSummary: Array<{
    status: string
    count: number
  }>
  recentGifts: Array<{
    id: number
    senderUserId: number
    receiverUserId: number
    assetCode: string
    amount: string
    energyCost: number
    status: string
    createdAt: string | Date | null
  }>
  recentOrders: Array<{
    id: number
    userId: number
    recipientUserId: number | null
    status: string
    storeChannel: string
    metadata: Record<string, unknown> | null
    sku: string
    deliveryType: string
    createdAt: string | Date | null
    updatedAt: string | Date | null
  }>
  activeGiftLocks: Array<{
    id: number
    userId: number
    reason: string
    scope: string
    status: string
    createdAt: string | Date | null
  }>
  riskSignals: Array<{
    senderUserId: number
    receiverUserId: number
    transferCount: number
    totalAmount: string
    sharedDeviceCount: number
    sharedIpCount: number
    lastTransferAt: string | Date | null
  }>
}

export type PageData = {
  overview: EconomyOverview | null
  error: string | null
}
