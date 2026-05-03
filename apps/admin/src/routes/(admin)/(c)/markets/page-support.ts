import type {
  PredictionMarketAppealQueueItem,
  PredictionMarketSummary,
} from "@reward/shared-types/prediction-market"

export interface PageData {
  markets: PredictionMarketSummary[]
  appeals: PredictionMarketAppealQueueItem[]
  error: string | null
}
