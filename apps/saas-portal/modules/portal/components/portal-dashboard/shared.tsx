import type {
  SaasOverview,
  SaasReportExportJob,
} from "@reward/shared-types/saas";

import { cn } from "@/lib/utils";

export type OverviewUiCopy = SaasOverview["uiCopy"]["overview"];
export type SnippetLanguage = "typescript" | "python";

export const API_KEY_SCOPE_OPTIONS = [
  "catalog:read",
  "fairness:read",
  "reward:write",
  "ledger:read",
] as const;

export const REPORT_RESOURCE_OPTIONS = [
  {
    value: "saas_usage_events",
    label: "Usage events",
    description: "Metered reward-engine requests, units, and billing context.",
  },
  {
    value: "saas_ledger_entries",
    label: "Ledger entries",
    description: "Player balance mutations, reference ids, and payout history.",
  },
  {
    value: "agent_risk_state",
    label: "Risk state",
    description:
      "Current agent risk records updated during the selected window.",
  },
] as const;

export const REPORT_FORMAT_OPTIONS = [
  {
    value: "csv",
    label: "CSV",
    description: "Spreadsheet-friendly flat export for auditors.",
  },
  {
    value: "json",
    label: "JSON",
    description:
      "Structured export with metadata and nested payloads preserved.",
  },
] as const;

export const TENANT_ROLE_LABELS = {
  tenant_owner: "Tenant owner",
  tenant_operator: "Tenant operator",
  agent_manager: "Agent manager",
  agent_viewer: "Agent viewer",
} as const;

export const TENANT_ROLE_DESCRIPTIONS = {
  tenant_owner: "Full tenant access, including members and billing controls.",
  tenant_operator: "Project, prize, and key operations without member writes.",
  agent_manager: "Operational agent access plus billing controls.",
  agent_viewer: "Read-only visibility into tenant activity.",
} as const;

const toDateTimeInputValue = (value: Date) => {
  const timezoneOffsetMs = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - timezoneOffsetMs)
    .toISOString()
    .slice(0, 16);
};

export const ENGINE_BASE_URL =
  process.env.NEXT_PUBLIC_ENGINE_BASE_URL ?? "http://localhost:4000";

const padDatePart = (value: number) => String(value).padStart(2, "0");

export const formatDate = (value: string | Date | null | undefined) => {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return [
    parsed.getUTCFullYear(),
    padDatePart(parsed.getUTCMonth() + 1),
    padDatePart(parsed.getUTCDate()),
  ]
    .join("-")
    .concat(
      ` ${padDatePart(parsed.getUTCHours())}:${padDatePart(
        parsed.getUTCMinutes(),
      )}:${padDatePart(parsed.getUTCSeconds())} UTC`,
    );
};

export const getDefaultReportFromAt = () =>
  toDateTimeInputValue(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

export const getDefaultReportToAt = () => toDateTimeInputValue(new Date());

export const parseDateTimeInputToIso = (value: FormDataEntryValue | null) => {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
};

export const getReportStatusTone = (status: SaasReportExportJob["status"]) => {
  if (status === "completed") {
    return "bg-emerald-100 text-emerald-800 hover:bg-emerald-100";
  }

  if (status === "failed") {
    return "bg-rose-100 text-rose-800 hover:bg-rose-100";
  }

  if (status === "processing") {
    return "bg-amber-100 text-amber-800 hover:bg-amber-100";
  }

  return "bg-slate-100 text-slate-700 hover:bg-slate-100";
};

export const formatWindow = (payload?: {
  used: number;
  limit: number;
  remaining: number;
  resetAt: string | Date | null;
}) => {
  if (!payload) {
    return "—";
  }

  return `${payload.used}/${payload.limit} used · ${payload.remaining} left · resets ${formatDate(payload.resetAt)}`;
};

export const formatPercent = (value: number | null | undefined) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—";
  }

  return `${(value * 100).toFixed(1)}%`;
};

export const formatPlainPercent = (value: number | null | undefined) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—";
  }

  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
};

export const formatSignedDelta = (value: number | null | undefined) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—";
  }

  const scaled = value * 100;
  return `${scaled >= 0 ? "+" : ""}${scaled.toFixed(1)} pts`;
};

export const getDistributionBarWidth = (value: number) =>
  `${Math.max(8, Math.min(100, value * 100)).toFixed(1)}%`;

export const buildSandboxTypeScriptSnippet = (payload: {
  apiKey: string | null;
  projectSlug: string | null;
}) => {
  const apiKey = payload.apiKey ?? "paste-your-sandbox-key";
  const projectSlug = payload.projectSlug ?? "sandbox-project";
  const agentId = `${projectSlug}-hello-agent`;

  return `import {
  createPrizeEngineClient,
  createPrizeEngineIdempotencyKey,
} from "@reward/prize-engine-sdk";

const apiKey = ${JSON.stringify(apiKey)};
const agentId = ${JSON.stringify(agentId)};
const client = createPrizeEngineClient({
  getApiKey: () => apiKey,
  environment: "sandbox",
  baseUrl: "${ENGINE_BASE_URL}",
});

const overview = await client.getOverview();
if (!overview.ok) {
  throw new Error(overview.error?.message ?? "Overview failed");
}

const reward = await client.reward({
  agent: {
    agentId,
    groupId: "hello-reward-demo",
    metadata: { source: "hello-reward" },
  },
  behavior: {
    actionType: "hello_reward_demo",
    score: 0.92,
    context: { source: "hello-reward" },
  },
  idempotencyKey: createPrizeEngineIdempotencyKey(),
  clientNonce: "hello-reward-portal",
});
if (!reward.ok) {
  throw new Error(reward.error?.message ?? "Reward failed");
}

const ledger = await client.getLedger(agentId);
if (!ledger.ok) {
  throw new Error(ledger.error?.message ?? "Ledger failed");
}

console.log("project", overview.data.project);
console.log("reward", reward.data.result);
console.log("ledger", ledger.data);`;
};

export const buildSandboxPythonSnippet = (payload: {
  apiKey: string | null;
  projectSlug: string | null;
}) => {
  const apiKey = payload.apiKey ?? "paste-your-sandbox-key";
  const projectSlug = payload.projectSlug ?? "sandbox-project";
  const agentId = `${projectSlug}-hello-agent`;

  return `from prize_engine_sdk import PrizeEngineClient, create_idempotency_key

api_key = ${JSON.stringify(apiKey)}
agent_id = ${JSON.stringify(agentId)}

client = PrizeEngineClient(
    base_url=${JSON.stringify(ENGINE_BASE_URL)},
    environment="sandbox",
    api_key=api_key,
)

overview = client.get_overview()
if not overview.get("ok"):
    raise RuntimeError(overview.get("error", {}).get("message", "Overview failed"))

reward = client.reward(
    {
        "agent": {
            "agentId": agent_id,
            "groupId": "hello-reward-demo",
            "metadata": {"source": "hello-reward"},
        },
        "behavior": {
            "actionType": "hello_reward_demo",
            "score": 0.92,
            "context": {"source": "hello-reward"},
        },
        "idempotencyKey": create_idempotency_key(),
        "clientNonce": "hello-reward-portal",
    }
)
if not reward.get("ok"):
    raise RuntimeError(reward.get("error", {}).get("message", "Reward failed"))

ledger = client.get_ledger(agent_id)
if not ledger.get("ok"):
    raise RuntimeError(ledger.get("error", {}).get("message", "Ledger failed"))

print("project", overview["data"]["project"])
print("reward", reward["data"]["result"])
print("ledger", ledger["data"])`;
};

export const getDriftTone = (value: number | null | undefined) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "text-slate-500";
  }

  if (Math.abs(value) >= 0.1) {
    return "text-rose-700";
  }

  if (Math.abs(value) >= 0.03) {
    return "text-amber-700";
  }

  return "text-emerald-700";
};

type SnippetLanguagePickerProps = {
  onChange: (language: SnippetLanguage) => void;
  value: SnippetLanguage;
};

export function SnippetLanguagePicker({
  onChange,
  value,
}: SnippetLanguagePickerProps) {
  return (
    <div className="inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      {(
        [
          ["typescript", "TypeScript"],
          ["python", "Python"],
        ] as const
      ).map(([language, label]) => (
        <button
          key={language}
          type="button"
          aria-pressed={value === language}
          data-state={value === language ? "active" : "inactive"}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-semibold transition duration-200",
            value === language
              ? "bg-white text-slate-950 shadow-sm"
              : "text-slate-300 hover:bg-white/[0.06] hover:text-white",
          )}
          onClick={() => {
            onChange(language);
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
