import type { Locale } from "$lib/i18n"

type KycCopy = {
  title: string
  description: string
  common: {
    prev: string
    next: string
  }
  queue: {
    filtersTitle: string
    filtersDescription: string
    tier: string
    from: string
    to: string
    riskFlag: string
    limit: string
    apply: string
    reset: string
    empty: string
    pendingOnly: string
    columns: {
      profile: string
      tier: string
      flags: string
      submittedAt: string
      documents: string
      freeze: string
      actions: string
    }
    activeFreeze: string
    noFreeze: string
    view: string
  }
  detail: {
    back: string
    title: string
    description: string
    summaryTitle: string
    submissionTitle: string
    submissionDescription: string
    documentsTitle: string
    documentsDescription: string
    reviewHistoryTitle: string
    reviewHistoryDescription: string
    reviewActionsTitle: string
    reviewActionsDescription: string
    noDocuments: string
    noReviewEvents: string
    currentTier: string
    requestedTier: string
    status: string
    user: string
    legalName: string
    documentType: string
    documentNumberLast4: string
    countryCode: string
    submittedAt: string
    reviewedAt: string
    submissionVersion: string
    freezeStatus: string
    riskFlags: string
    notes: string
    rejectionReason: string
    submittedData: string
    action: string
    actor: string
    reason: string
    createdAt: string
    approve: string
    reject: string
    requestMoreInfo: string
    approveDescription: string
    rejectDescription: string
    requestMoreInfoDescription: string
    optionalReason: string
    requiredReason: string
    noLongerPending: string
    openPreview: string
    previewUnavailable: string
  }
  errors: {
    loadQueue: string
    loadDetail: string
    unexpectedData: string
    invalidProfileId: string
    rejectReasonRequired: string
  }
  messages: {
    approved: string
    rejected: string
    moreInfoRequested: string
  }
  tierLabels: Record<"tier_0" | "tier_1" | "tier_2", string>
  statusLabels: Record<
    "not_started" | "pending" | "approved" | "rejected" | "more_info_required",
    string
  >
  documentTypeLabels: Record<
    | "national_id"
    | "passport"
    | "driver_license"
    | "proof_of_address"
    | "supporting_document",
    string
  >
  documentKindLabels: Record<
    | "identity_front"
    | "identity_back"
    | "selfie"
    | "proof_of_address"
    | "supporting_document",
    string
  >
  reviewActionLabels: Record<
    "submitted" | "approved" | "rejected" | "request_more_info",
    string
  >
}

const enCopy: KycCopy = {
  title: "KYC Queue",
  description:
    "Review pending KYC submissions, inspect signed document previews, and move cases through the operator queue.",
  common: {
    prev: "Prev",
    next: "Next",
  },
  queue: {
    filtersTitle: "Pending Reviews",
    filtersDescription:
      "Filter the operator queue by tier, submission window, and risk markers.",
    tier: "Tier",
    from: "Submitted From",
    to: "Submitted To",
    riskFlag: "Risk Flag",
    limit: "Page Size",
    apply: "Apply Filters",
    reset: "Reset",
    empty: "No pending KYC profiles match the current filters.",
    pendingOnly: "Only `pending` profiles are shown in this queue.",
    columns: {
      profile: "Profile",
      tier: "Tier",
      flags: "Risk Flags",
      submittedAt: "Submitted At",
      documents: "Documents",
      freeze: "Freeze",
      actions: "Actions",
    },
    activeFreeze: "Active withdrawal freeze",
    noFreeze: "No active freeze",
    view: "Review",
  },
  detail: {
    back: "Back to KYC queue",
    title: "KYC Review",
    description:
      "Inspect the submission package, review supporting documents, and decide the next queue state.",
    summaryTitle: "Profile Summary",
    submissionTitle: "Submitted Data",
    submissionDescription:
      "Core KYC profile fields plus the raw submission payload stored for this version.",
    documentsTitle: "Document Previews",
    documentsDescription:
      "Previews use time-limited signed URLs. Open the case while the links are still valid.",
    reviewHistoryTitle: "Review History",
    reviewHistoryDescription:
      "Every review action is persisted to `kyc_review_events` with status transitions.",
    reviewActionsTitle: "Review Actions",
    reviewActionsDescription:
      "Approve, reject, or move the case to `more_info_required` from this page.",
    noDocuments: "No documents were stored for this submission version.",
    noReviewEvents: "No review events have been recorded yet.",
    currentTier: "Current Tier",
    requestedTier: "Requested Tier",
    status: "Status",
    user: "User",
    legalName: "Legal Name",
    documentType: "Document Type",
    documentNumberLast4: "Document Last 4",
    countryCode: "Country",
    submittedAt: "Submitted At",
    reviewedAt: "Reviewed At",
    submissionVersion: "Submission Version",
    freezeStatus: "Freeze Status",
    riskFlags: "Risk Flags",
    notes: "Notes",
    rejectionReason: "Rejection Reason",
    submittedData: "Submitted Payload",
    action: "Action",
    actor: "Actor",
    reason: "Reason",
    createdAt: "Created At",
    approve: "Approve",
    reject: "Reject",
    requestMoreInfo: "Request More Info",
    approveDescription:
      "Promote the user to the requested tier and release the linked KYC freeze if one exists.",
    rejectDescription:
      "Reject the submission and persist a required rejection reason for audit and user follow-up.",
    requestMoreInfoDescription:
      "Keep the case in the KYC workflow and freeze withdrawals until additional material arrives.",
    optionalReason: "Reason (optional)",
    requiredReason: "Reason (required)",
    noLongerPending:
      "This profile is no longer pending. Review actions are disabled for historical states.",
    openPreview: "Open Preview",
    previewUnavailable: "Inline preview unavailable for this file type.",
  },
  errors: {
    loadQueue: "Failed to load the KYC queue.",
    loadDetail: "Failed to load the KYC profile.",
    unexpectedData: "The backend returned an unexpected KYC payload.",
    invalidProfileId: "Invalid KYC profile id.",
    rejectReasonRequired: "Reject reason is required.",
  },
  messages: {
    approved: "KYC profile approved.",
    rejected: "KYC profile rejected.",
    moreInfoRequested: "KYC profile moved to more-info-required.",
  },
  tierLabels: {
    tier_0: "Tier 0",
    tier_1: "Tier 1",
    tier_2: "Tier 2",
  },
  statusLabels: {
    not_started: "Not Started",
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
    more_info_required: "More Info Required",
  },
  documentTypeLabels: {
    national_id: "National ID",
    passport: "Passport",
    driver_license: "Driver License",
    proof_of_address: "Proof of Address",
    supporting_document: "Supporting Document",
  },
  documentKindLabels: {
    identity_front: "Identity Front",
    identity_back: "Identity Back",
    selfie: "Selfie",
    proof_of_address: "Proof of Address",
    supporting_document: "Supporting Document",
  },
  reviewActionLabels: {
    submitted: "Submitted",
    approved: "Approved",
    rejected: "Rejected",
    request_more_info: "Request More Info",
  },
}

const zhCopy: KycCopy = {
  title: "KYC 审核队列",
  description:
    "集中处理待审 KYC 提交，查看限时签名文件预览，并推动案例在运营队列中流转。",
  common: {
    prev: "上一页",
    next: "下一页",
  },
  queue: {
    filtersTitle: "待审核队列",
    filtersDescription: "按层级、提交时间窗口和风险标记筛选待处理的 KYC 案例。",
    tier: "层级",
    from: "提交起始时间",
    to: "提交结束时间",
    riskFlag: "风险标记",
    limit: "每页条数",
    apply: "应用筛选",
    reset: "重置",
    empty: "当前筛选条件下没有待审核的 KYC 资料。",
    pendingOnly: "该列表仅展示 `pending` 状态的 KYC 申请。",
    columns: {
      profile: "申请资料",
      tier: "目标层级",
      flags: "风险标记",
      submittedAt: "提交时间",
      documents: "文件数",
      freeze: "冻结状态",
      actions: "操作",
    },
    activeFreeze: "已冻结提现",
    noFreeze: "未冻结",
    view: "进入审核",
  },
  detail: {
    back: "返回 KYC 队列",
    title: "KYC 审核详情",
    description: "查看提交资料、核对文件，并在当前页面完成审核流转。",
    summaryTitle: "概要信息",
    submissionTitle: "提交内容",
    submissionDescription: "展示结构化 KYC 字段以及本次提交版本的原始 payload。",
    documentsTitle: "文件预览",
    documentsDescription: "文件通过限时签名 URL 预览。链接过期后需要刷新详情页重新获取。",
    reviewHistoryTitle: "审核历史",
    reviewHistoryDescription:
      "每次审核动作都会写入 `kyc_review_events`，并记录状态迁移。",
    reviewActionsTitle: "审核动作",
    reviewActionsDescription:
      "在这里直接批准、拒绝，或将资料流转到 `more_info_required`。",
    noDocuments: "该提交版本没有找到已存档文件。",
    noReviewEvents: "目前还没有审核事件记录。",
    currentTier: "当前层级",
    requestedTier: "申请层级",
    status: "状态",
    user: "用户",
    legalName: "法定姓名",
    documentType: "证件类型",
    documentNumberLast4: "证件尾号",
    countryCode: "国家/地区",
    submittedAt: "提交时间",
    reviewedAt: "审核时间",
    submissionVersion: "提交版本",
    freezeStatus: "冻结状态",
    riskFlags: "风险标记",
    notes: "备注",
    rejectionReason: "拒绝原因",
    submittedData: "提交 Payload",
    action: "动作",
    actor: "操作人",
    reason: "原因",
    createdAt: "记录时间",
    approve: "批准",
    reject: "拒绝",
    requestMoreInfo: "补件",
    approveDescription: "将用户升级到申请层级，并释放关联的 KYC 冻结记录。",
    rejectDescription: "拒绝申请，并写入必填的拒绝原因，便于审计和后续通知。",
    requestMoreInfoDescription:
      "要求用户补充资料，并继续保持提现冻结，直到新资料到达。",
    optionalReason: "原因（可选）",
    requiredReason: "原因（必填）",
    noLongerPending: "该资料已不是待审核状态，当前页面只提供历史查看。",
    openPreview: "打开预览",
    previewUnavailable: "该文件类型暂不支持内嵌预览。",
  },
  errors: {
    loadQueue: "加载 KYC 队列失败。",
    loadDetail: "加载 KYC 详情失败。",
    unexpectedData: "后端返回了无法识别的 KYC 数据。",
    invalidProfileId: "KYC 资料 ID 无效。",
    rejectReasonRequired: "拒绝时必须填写原因。",
  },
  messages: {
    approved: "KYC 资料已批准。",
    rejected: "KYC 资料已拒绝。",
    moreInfoRequested: "KYC 资料已流转到补件状态。",
  },
  tierLabels: {
    tier_0: "Tier 0",
    tier_1: "Tier 1",
    tier_2: "Tier 2",
  },
  statusLabels: {
    not_started: "未开始",
    pending: "待审核",
    approved: "已批准",
    rejected: "已拒绝",
    more_info_required: "待补件",
  },
  documentTypeLabels: {
    national_id: "身份证",
    passport: "护照",
    driver_license: "驾照",
    proof_of_address: "地址证明",
    supporting_document: "补充材料",
  },
  documentKindLabels: {
    identity_front: "证件正面",
    identity_back: "证件反面",
    selfie: "自拍照",
    proof_of_address: "地址证明",
    supporting_document: "补充材料",
  },
  reviewActionLabels: {
    submitted: "已提交",
    approved: "已批准",
    rejected: "已拒绝",
    request_more_info: "要求补件",
  },
}

export const getKycCopy = (locale: Locale) =>
  locale === "zh-CN" ? zhCopy : enCopy
