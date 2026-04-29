import type { PageServerLoad } from "./$types"
import { AdminUserAssociationGraphSchema } from "@reward/shared-types/admin"

import { captureAdminServerException } from "$lib/observability/server"
import { apiRequest } from "$lib/server/api"

const parseUserId = (value: string) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null
}

const parseDays = (value: string | null) => {
  if (!value) {
    return 90
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 90
}

const getCopy = (locale: string) =>
  locale === "zh-CN"
    ? {
        back: "返回用户详情",
        title: "关联图谱",
        description: "按设备指纹、IP 和出款卡/地址查看该用户与其他账号的重合关系。",
        filtersTitle: "时间窗口",
        filtersDescription: "缩小窗口以聚焦近期设备和资金关联。",
        filtersDays: "天数",
        filtersApply: "应用",
        focusTitle: "目标账户",
        focusDescription: "当前被审查的用户及其基础风险状态。",
        relatedUsersTitle: "关联账户",
        relatedUsersDescription: "至少共享一个设备、IP 或出款标识的账号。",
        deviceTitle: "同设备",
        ipTitle: "同 IP",
        payoutTitle: "同卡号/地址",
        signalEmpty: "当前窗口内没有关联信号。",
        relatedEmpty: "当前窗口内没有命中的关联账户。",
        summaryRelated: "关联账户数",
        summaryDevices: "设备信号",
        summaryIps: "IP 信号",
        summaryPayouts: "出款信号",
        summaryFlagged: "已命中风控",
        freezeActive: "冻结中",
        freezeNone: "未冻结",
        riskOpen: "有风险标记",
        riskNone: "无风险标记",
        columnsSignal: "信号",
        columnsUsers: "关联用户",
        columnsActivity: "入口",
        columnsLastSeen: "最近出现",
        columnsRelations: "关联类型",
        columnsNotes: "命中明细",
      }
    : {
        back: "Back to user detail",
        title: "Association graph",
        description:
          "Review overlapping devices, IPs, and payout identifiers connected to this user.",
        filtersTitle: "Window",
        filtersDescription:
          "Tighten the window to focus on more recent device and payout overlap.",
        filtersDays: "Days",
        filtersApply: "Apply",
        focusTitle: "Focus account",
        focusDescription: "The user under review and their current risk state.",
        relatedUsersTitle: "Related accounts",
        relatedUsersDescription:
          "Accounts sharing at least one device, IP, or payout identity.",
        deviceTitle: "Shared devices",
        ipTitle: "Shared IPs",
        payoutTitle: "Shared cards / wallets",
        signalEmpty: "No association signals in the selected window.",
        relatedEmpty: "No related accounts in the selected window.",
        summaryRelated: "Related accounts",
        summaryDevices: "Device signals",
        summaryIps: "IP signals",
        summaryPayouts: "Payout signals",
        summaryFlagged: "Flagged accounts",
        freezeActive: "Frozen",
        freezeNone: "Not frozen",
        riskOpen: "Risk flag open",
        riskNone: "No risk flag",
        columnsSignal: "Signal",
        columnsUsers: "Related users",
        columnsActivity: "Entry points",
        columnsLastSeen: "Last seen",
        columnsRelations: "Relations",
        columnsNotes: "Matched details",
      }

export const load: PageServerLoad = async ({
  fetch,
  cookies,
  params,
  url,
  locals,
}) => {
  const userId = parseUserId(params.userId)
  const copy = getCopy(locals.locale)

  if (!userId) {
    return {
      graph: null,
      error: locals.locale === "zh-CN" ? "无效用户 ID。" : "Invalid user id.",
      copy,
      userId: null,
      days: 90,
    }
  }

  const days = parseDays(url.searchParams.get("days"))

  try {
    const response = await apiRequest(
      fetch,
      cookies,
      `/admin/users/${userId}/associations?days=${days}`,
    )

    if (!response.ok) {
      return {
        graph: null,
        error:
          response.error?.message ??
          (locals.locale === "zh-CN"
            ? "加载关联图谱失败。"
            : "Failed to load association graph."),
        copy,
        userId,
        days,
      }
    }

    const parsed = AdminUserAssociationGraphSchema.safeParse(response.data)
    if (!parsed.success) {
      captureAdminServerException(new Error("admin user association unexpected response"), {
        tags: {
          kind: "admin_user_association_unexpected_response",
        },
      })

      return {
        graph: null,
        error:
          locals.locale === "zh-CN"
            ? "关联图谱返回了意外数据。"
            : "Association graph returned unexpected data.",
        copy,
        userId,
        days,
      }
    }

    return {
      graph: parsed.data,
      error: null,
      copy,
      userId,
      days,
    }
  } catch (error) {
    captureAdminServerException(error, {
      tags: {
        kind: "admin_user_association_exception",
      },
    })

    return {
      graph: null,
      error:
        locals.locale === "zh-CN"
          ? "加载关联图谱失败。"
          : "Failed to load association graph.",
      copy,
      userId,
      days,
    }
  }
}
