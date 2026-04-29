import type {
  RewardMissionAdminRecord,
  RewardMissionCadence,
  RewardMissionDailyCheckInParams,
  RewardMissionDefinitionType,
  RewardMissionMetric,
  RewardMissionMetricThresholdParams,
} from "@reward/shared-types/gamification";
import {
  RewardMissionDailyCheckInParamsSchema,
  RewardMissionMetricThresholdParamsSchema,
} from "@reward/shared-types/gamification";

export interface PageData {
  missions: RewardMissionAdminRecord[];
  error: string | null;
}

export type MissionForm = {
  id: string;
  type: RewardMissionDefinitionType;
  reward: string;
  isActive: boolean;
  params: string;
};

export type MissionPreview = {
  valid: boolean;
  error: string | null;
  title: string;
  description: string;
  reward: string;
  autoAwarded: boolean;
  cadence: RewardMissionCadence;
  target: number;
  progressPercent: number;
  metricLabel: string | null;
  progressLabel: string;
};

const missionTemplates: Record<RewardMissionDefinitionType, Record<string, unknown>> =
  {
    daily_checkin: {
      title: "Daily check-in",
      description:
        "Sign in each day to keep the streak active and receive the daily auto bonus.",
      sortOrder: 10,
    },
    metric_threshold: {
      title: "Mission title",
      description: "Describe the action needed to unlock this reward.",
      metric: "draw_count_all",
      target: 1,
      cadence: "one_time",
      awardMode: "manual_claim",
      bonusUnlockWagerRatio: 1,
      sortOrder: 100,
    },
  };

export const missionTypeOptions: Array<{
  value: RewardMissionDefinitionType;
  label: string;
}> = [
  { value: "daily_checkin", label: "daily_checkin" },
  { value: "metric_threshold", label: "metric_threshold" },
];

const metricLabels: Record<RewardMissionMetric, string> = {
  verified_contacts: "验证资料数",
  draw_count_all: "累计抽奖次数",
  draw_count_today: "今日抽奖次数",
  deposit_count: "累计充值申请数",
  deposit_credited_count: "累计到账充值数",
  referral_success_count: "成功推荐人数",
};

export const stringifyMissionTemplate = (type: RewardMissionDefinitionType) =>
  JSON.stringify(missionTemplates[type], null, 2);

export const createMissionForm = (): MissionForm => ({
  id: "",
  type: "metric_threshold",
  reward: "0",
  isActive: true,
  params: stringifyMissionTemplate("metric_threshold"),
});

export const buildMissionForm = (mission: RewardMissionAdminRecord): MissionForm => ({
  id: mission.id,
  type: mission.type,
  reward: mission.reward,
  isActive: mission.isActive,
  params: JSON.stringify(mission.params, null, 2),
});

const parseDailyCheckInParams = (raw: string): RewardMissionDailyCheckInParams => {
  const parsed = JSON.parse(raw);
  return RewardMissionDailyCheckInParamsSchema.parse(parsed);
};

const parseMetricThresholdParams = (
  raw: string,
): RewardMissionMetricThresholdParams => {
  const parsed = JSON.parse(raw);
  return RewardMissionMetricThresholdParamsSchema.parse(parsed);
};

export const buildMissionPreview = (form: MissionForm): MissionPreview => {
  try {
    if (form.type === "daily_checkin") {
      const params = parseDailyCheckInParams(form.params);
      return {
        valid: true,
        error: null,
        title: params.title,
        description: params.description,
        reward: form.reward || "0",
        autoAwarded: true,
        cadence: "daily",
        target: 1,
        progressPercent: 100,
        metricLabel: null,
        progressLabel: "1 / 1",
      };
    }

    const params = parseMetricThresholdParams(form.params);
    return {
      valid: true,
      error: null,
      title: params.title,
      description: params.description,
      reward: form.reward || "0",
      autoAwarded: params.awardMode === "auto_grant",
      cadence: params.cadence,
      target: params.target,
      progressPercent: 0,
      metricLabel: metricLabels[params.metric],
      progressLabel: `0 / ${params.target}`,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Invalid params JSON.",
      title: "Preview unavailable",
      description: "Fix the params JSON to render the mission preview.",
      reward: form.reward || "0",
      autoAwarded: false,
      cadence: "one_time",
      target: 1,
      progressPercent: 0,
      metricLabel: null,
      progressLabel: "0 / 1",
    };
  }
};

export const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

export const formatDateTime = (value: string | Date) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? String(value) : parsed.toLocaleString();
};

export const missionWindowLabel = (value: "lifetime" | "today") =>
  value === "today" ? "今日口径" : "累计口径";

export const missionCadenceLabel = (value: RewardMissionCadence) =>
  value === "daily" ? "每日" : "一次性";
