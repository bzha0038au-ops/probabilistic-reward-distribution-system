import { describe, expect, it } from "vitest"

import {
  getSaasTenantRiskEnvelopeDiffRows,
  getSaasTenantRiskEnvelopeDisplayContext,
  getSaasTenantRiskEnvelopeHeadline,
  requestMarketingCopy,
  requestTypeLabel,
  type ChangeRequestRecord,
} from "../routes/(admin)/(engine)/(shared)/control-center/page-support"

const baseRequest: ChangeRequestRecord = {
  id: 42,
  changeType: "saas_tenant_risk_envelope_upsert",
  status: "pending_approval",
  targetType: "saas_tenant_risk_envelope",
  targetId: 18,
  reason: "Clamp runaway tenant budgets before launch",
  requiresSecondConfirmation: true,
  requiresMfa: true,
  createdByAdminId: 9,
  submittedByAdminId: 9,
  approvedByAdminId: null,
  publishedByAdminId: null,
  rejectedByAdminId: null,
  createdAt: "2026-04-28T07:00:00.000Z",
  updatedAt: "2026-04-28T07:00:00.000Z",
  submittedAt: "2026-04-28T07:01:00.000Z",
  approvedAt: null,
  publishedAt: null,
  rejectedAt: null,
  summary: "SaaS 租户 #18 风险包络兜底",
  changePayload: {
    tenantId: 18,
    dailyBudgetCap: "900.00",
    varianceCap: "15.00",
    emergencyStop: true,
    displayContext: {
      tenant: {
        id: 18,
        name: "Acme Rewards",
        slug: "acme-rewards",
      },
      currentEnvelope: {
        dailyBudgetCap: "1500.00",
        maxSinglePayout: "80.00",
        varianceCap: "30.00",
        emergencyStop: false,
      },
      proposedEnvelope: {
        dailyBudgetCap: "900.00",
        maxSinglePayout: "80.00",
        varianceCap: "15.00",
        emergencyStop: true,
      },
      changedKeys: ["dailyBudgetCap", "varianceCap", "emergencyStop"],
    },
  },
  confirmationPhrases: {
    submit: "SUBMIT 42",
    publish: "PUBLISH 42",
  },
}

describe("change request page support", () => {
  it("builds SaaS tenant risk-envelope approval copy and diff rows", () => {
    expect(requestTypeLabel(baseRequest)).toBe("SaaS 风控兜底")
    expect(requestMarketingCopy(baseRequest)).toContain("运营兜底")
    expect(getSaasTenantRiskEnvelopeHeadline(baseRequest)).toBe(
      "Acme Rewards / acme-rewards",
    )
    expect(getSaasTenantRiskEnvelopeDisplayContext(baseRequest)).toMatchObject({
      tenant: {
        id: 18,
        name: "Acme Rewards",
      },
    })
    expect(getSaasTenantRiskEnvelopeDiffRows(baseRequest)).toEqual([
      {
        label: "每日预算上限",
        from: "1500.00",
        to: "900.00",
      },
      {
        label: "方差上限",
        from: "30.00",
        to: "15.00",
      },
      {
        label: "紧急停付",
        from: "关闭",
        to: "开启",
      },
    ])
  })

  it("falls back to request payload when display context is unavailable", () => {
    const request = {
      ...baseRequest,
      changePayload: {
        tenantId: 22,
        maxSinglePayout: null,
      },
    } satisfies ChangeRequestRecord

    expect(getSaasTenantRiskEnvelopeHeadline(request)).toBe("Tenant #22")
    expect(getSaasTenantRiskEnvelopeDiffRows(request)).toEqual([
      {
        label: "单次最大派发",
        from: "无上限",
        to: "无上限",
      },
    ])
  })
})
