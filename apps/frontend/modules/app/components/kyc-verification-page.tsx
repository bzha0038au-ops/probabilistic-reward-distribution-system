'use client';

import {
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import type {
  KycDocumentKind,
  KycDocumentType,
  KycReviewAction,
  KycStatus,
  KycSubmitDocument,
  KycSubmitRequest,
  KycTier,
  KycUserProfile,
} from '@reward/shared-types/kyc';

import { useLocale } from '@/components/i18n-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { browserUserApiClient } from '@/lib/api/user-client';
import { cn } from '@/lib/utils';
import { DashboardFeedbackNotice } from './user-dashboard-domain-ui';

type DraftDocument = KycSubmitDocument & {
  previewUrl: string;
};

const copy = {
  en: {
    title: 'Identity verification',
    description:
      'Move from lightweight checks into full KYC only when withdrawals, event access, or higher-trust play require it.',
    loading: 'Loading verification profile...',
    reviewDeskTitle: 'Review desk',
    reviewDeskDescription:
      'Track current tier, pending requests, review state, and operational flags from one audit-friendly surface.',
    tierLadderTitle: 'Access ladder',
    tierLadderDescription:
      'Each tier expands wallet and event access. Resubmissions stay unlocked unless a review is already pending.',
    formTitle: 'Submit or refresh identity review',
    formDescription:
      'Complete the identity packet once, then only resubmit when support or risk review asks for newer material.',
    docsTitle: 'Submitted materials',
    docsDescription:
      'Reference the latest uploaded files and the review metadata attached to each one.',
    historyTitle: 'Review timeline',
    historyDescription:
      'Every status transition is recorded here so the player can see why access changed.',
    currentTier: 'Current tier',
    requestedTier: 'Requested tier',
    status: 'Review status',
    docsCount: 'Documents on file',
    submissionVersion: 'Submission version',
    submittedAt: 'Submitted',
    reviewedAt: 'Reviewed',
    legalName: 'Legal name',
    legalNamePlaceholder: 'Full name on the document',
    documentType: 'Document type',
    documentNumberLast4: 'Document number last 4',
    countryCode: 'Country code',
    countryCodePlaceholder: 'AU',
    documentExpiresAt: 'Document expiry date',
    notes: 'Notes for the reviewer',
    notesPlaceholder:
      'Optional context for name changes, reissued documents, or prior rejection fixes.',
    targetTier: 'Target tier',
    tier0: 'Tier 0 demo',
    tier1: 'Tier 1 small-stake',
    tier2: 'Tier 2 withdrawals + premium tables',
    tier0Body: 'Demo access only. No higher-trust wallet actions or event unlocks.',
    tier1Body:
      'Unlocks small-stake play and the first layer of identity-backed account trust.',
    tier2Body:
      'Unlocks withdrawals, premium tables, and the strongest account recovery posture.',
    tierComplete: 'Unlocked',
    tierRequested: 'Requested',
    tierLocked: 'Locked',
    checkpointComplete: 'Ready',
    checkpointNeeded: 'Needed',
    nationalId: 'National ID',
    passport: 'Passport',
    driverLicense: 'Driver license',
    proofOfAddress: 'Proof of address',
    supportingDocument: 'Supporting document',
    frontDoc: 'Identity front',
    backDoc: 'Identity back',
    selfieDoc: 'Selfie',
    required: 'Required',
    optional: 'Optional',
    selectedFile: 'Selected file',
    noFileSelected: 'No file selected yet.',
    submit: 'Submit KYC packet',
    pendingLocked:
      'A KYC review is already pending. Wait for review to finish before resubmitting.',
    success: 'KYC submission created.',
    noDocs: 'No documents submitted yet.',
    noHistory: 'No review events yet.',
    openDocument: 'Open document',
    fileHint:
      'Accepted: JPG, PNG, WEBP, or PDF. Front document and selfie are required. Back side stays optional.',
    fileReadFailed: 'Failed to read the selected file.',
    filesRequired: 'Front document and selfie are required before submission.',
    documentExpiryRequired: 'Document expiry date is required.',
    loadFailed: 'Failed to load KYC profile.',
    submitFailed: 'Failed to submit KYC.',
    unknown: 'Unknown',
    riskFlagsTitle: 'Risk flags',
    noRiskFlags: 'No operational risk flags are attached to this profile.',
    rejectionTitle: 'Reviewer note',
    moreInfoTitle: 'More info requested',
    activePacketTitle: 'Current packet',
    activePacketDescription:
      'Use this to confirm what is already on file before replacing anything.',
    checkpointTitle: 'Packet checklist',
    checkpointDescription:
      'The page keeps the packet simple: legal identity, document proof, and a selfie match.',
    checkpointIdentity: 'Legal identity data filled',
    checkpointFront: 'Identity front uploaded',
    checkpointSelfie: 'Selfie uploaded',
    checkpointReview: 'No active pending lock',
    statusNotStarted: 'Not started',
    statusPending: 'Under review',
    statusApproved: 'Approved',
    statusRejected: 'Rejected',
    statusMoreInfo: 'More info required',
    reviewSubmitted: 'Submitted',
    reviewApproved: 'Approved',
    reviewRejected: 'Rejected',
    reviewMoreInfo: 'More info requested',
    reviewReverification: 'Reverification requested',
    documentExpiryLabel: 'Expires at',
    noneRequested: 'No request',
  },
  'zh-CN': {
    title: '身份认证',
    description:
      '只有在提现、活动权限或更高信任级别玩法需要时，才从轻量校验进入完整 KYC。',
    loading: '正在加载认证档案...',
    reviewDeskTitle: '审核台',
    reviewDeskDescription:
      '把当前等级、待处理申请、审核状态和运营风险标记集中到一个可审计页面里。',
    tierLadderTitle: '访问等级',
    tierLadderDescription:
      '每一级都会扩大钱包和活动权限。只要当前没有待审核锁定，就允许重新提交。',
    formTitle: '提交或刷新身份审核资料',
    formDescription:
      '首次完整提交身份包即可；只有当客服或风控要求补件时，才需要重新上传。',
    docsTitle: '已提交材料',
    docsDescription: '查看当前留档的文件，以及每份文件关联的审核元数据。',
    historyTitle: '审核时间线',
    historyDescription:
      '每一次状态变化都会记录在这里，让玩家知道权限为什么发生变化。',
    currentTier: '当前等级',
    requestedTier: '申请等级',
    status: '审核状态',
    docsCount: '材料数量',
    submissionVersion: '提交版本',
    submittedAt: '提交时间',
    reviewedAt: '审核时间',
    legalName: '真实姓名',
    legalNamePlaceholder: '与证件一致的完整姓名',
    documentType: '证件类型',
    documentNumberLast4: '证件号后 4 位',
    countryCode: '国家代码',
    countryCodePlaceholder: 'CN',
    documentExpiresAt: '证件到期日',
    notes: '给审核员的补充说明',
    notesPlaceholder: '可选，用于说明改名、证件重发或上次驳回后的修正内容。',
    targetTier: '目标等级',
    tier0: 'Tier 0 试玩',
    tier1: 'Tier 1 小额玩法',
    tier2: 'Tier 2 提现 + 高级牌桌',
    tier0Body: '仅可试玩，不开放更高信任级别的钱包动作和活动解锁。',
    tier1Body: '解锁小额玩法，并建立第一层带身份背书的账户信任。',
    tier2Body: '解锁提现、高级牌桌，以及更强的账户恢复防线。',
    tierComplete: '已解锁',
    tierRequested: '申请中',
    tierLocked: '未解锁',
    checkpointComplete: '已就绪',
    checkpointNeeded: '待补齐',
    nationalId: '身份证',
    passport: '护照',
    driverLicense: '驾照',
    proofOfAddress: '地址证明',
    supportingDocument: '补充材料',
    frontDoc: '证件正面',
    backDoc: '证件反面',
    selfieDoc: '手持自拍',
    required: '必填',
    optional: '可选',
    selectedFile: '已选文件',
    noFileSelected: '还没有选择文件。',
    submit: '提交 KYC 材料包',
    pendingLocked: '当前已有待审核的 KYC 申请，请等待审核完成后再重新提交。',
    success: 'KYC 申请已提交。',
    noDocs: '还没有提交任何材料。',
    noHistory: '还没有审核事件。',
    openDocument: '打开文件',
    fileHint:
      '支持 JPG、PNG、WEBP、PDF。证件正面和自拍为必填，证件反面保持可选。',
    fileReadFailed: '读取所选文件失败。',
    filesRequired: '提交前必须上传证件正面和自拍。',
    documentExpiryRequired: '必须填写证件到期日。',
    loadFailed: '加载 KYC 档案失败。',
    submitFailed: '提交 KYC 失败。',
    unknown: '未知',
    riskFlagsTitle: '风险标记',
    noRiskFlags: '当前档案没有附加运营风险标记。',
    rejectionTitle: '审核备注',
    moreInfoTitle: '需要补充资料',
    activePacketTitle: '当前材料包',
    activePacketDescription: '先确认系统里已经留存了什么，再决定是否替换材料。',
    checkpointTitle: '材料清单',
    checkpointDescription:
      '这个页面只保留最核心的三部分：法定身份、证件证明、自拍比对。',
    checkpointIdentity: '法定身份信息已填写',
    checkpointFront: '证件正面已上传',
    checkpointSelfie: '自拍已上传',
    checkpointReview: '当前没有待审核锁定',
    statusNotStarted: '未开始',
    statusPending: '审核中',
    statusApproved: '已通过',
    statusRejected: '已驳回',
    statusMoreInfo: '需要补充资料',
    reviewSubmitted: '已提交',
    reviewApproved: '已通过',
    reviewRejected: '已驳回',
    reviewMoreInfo: '要求补件',
    reviewReverification: '要求重新认证',
    documentExpiryLabel: '到期时间',
    noneRequested: '未申请',
  },
} as const;

const targetTierOptions: KycSubmitRequest['targetTier'][] = ['tier_1', 'tier_2'];
const documentTypeOptions: KycDocumentType[] = [
  'national_id',
  'passport',
  'driver_license',
];
const tierRanks: Record<KycTier, number> = {
  tier_0: 0,
  tier_1: 1,
  tier_2: 2,
};

const readFileAsBase64 = async (
  file: File,
  fallbackMessage: string,
): Promise<DraftDocument> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(fallbackMessage));
    reader.onload = () => {
      const raw = typeof reader.result === 'string' ? reader.result : '';
      const [, contentBase64 = ''] = raw.split(',', 2);
      resolve({
        kind: 'identity_front',
        fileName: file.name,
        mimeType: file.type as DraftDocument['mimeType'],
        sizeBytes: file.size,
        contentBase64,
        previewUrl: raw,
      });
    };
    reader.readAsDataURL(file);
  });

const toDateInputValue = (value: string | Date | null | undefined) => {
  if (!value) {
    return '';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return '';
  }

  return parsed.toISOString().slice(0, 10);
};

const formatDateTime = (
  locale: keyof typeof copy,
  fallback: string,
  value: string | Date | null | undefined,
) => {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return fallback;
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
};

const formatFileSize = (bytes: number | null | undefined) => {
  if (!bytes || bytes <= 0) {
    return '--';
  }

  if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toFixed(1)} MB`;
  }

  if (bytes >= 1_000) {
    return `${(bytes / 1_000).toFixed(1)} KB`;
  }

  return `${bytes} B`;
};

const tierLabel = (
  locale: keyof typeof copy,
  tier: KycTier | null | undefined,
) => {
  const c = copy[locale];
  if (tier === 'tier_1') return c.tier1;
  if (tier === 'tier_2') return c.tier2;
  return c.tier0;
};

const documentTypeLabel = (
  locale: keyof typeof copy,
  documentType: KycDocumentType,
) => {
  const c = copy[locale];
  if (documentType === 'passport') return c.passport;
  if (documentType === 'driver_license') return c.driverLicense;
  if (documentType === 'proof_of_address') return c.proofOfAddress;
  if (documentType === 'supporting_document') return c.supportingDocument;
  return c.nationalId;
};

const documentKindLabel = (
  locale: keyof typeof copy,
  kind: KycDocumentKind,
) => {
  const c = copy[locale];
  if (kind === 'identity_back') return c.backDoc;
  if (kind === 'selfie') return c.selfieDoc;
  if (kind === 'proof_of_address') return c.proofOfAddress;
  if (kind === 'supporting_document') return c.supportingDocument;
  return c.frontDoc;
};

const reviewActionLabel = (
  locale: keyof typeof copy,
  action: KycReviewAction,
) => {
  const c = copy[locale];
  if (action === 'approved') return c.reviewApproved;
  if (action === 'rejected') return c.reviewRejected;
  if (action === 'request_more_info') return c.reviewMoreInfo;
  if (action === 'reverification_requested') return c.reviewReverification;
  return c.reviewSubmitted;
};

const statusPresentation = (
  locale: keyof typeof copy,
  status: KycStatus,
) => {
  const c = copy[locale];

  if (status === 'approved') {
    return {
      label: c.statusApproved,
      badgeClassName: 'retro-badge retro-badge-green border-none',
      panelClassName:
        'border-emerald-300 bg-emerald-50 text-emerald-900',
    };
  }

  if (status === 'pending') {
    return {
      label: c.statusPending,
      badgeClassName: 'retro-badge retro-badge-gold border-none',
      panelClassName:
        'border-[var(--retro-gold)] bg-[#fff6d8] text-[var(--retro-ink)]',
    };
  }

  if (status === 'rejected') {
    return {
      label: c.statusRejected,
      badgeClassName: 'retro-badge retro-badge-red border-none',
      panelClassName: 'border-red-300 bg-red-50 text-red-900',
    };
  }

  if (status === 'more_info_required') {
    return {
      label: c.statusMoreInfo,
      badgeClassName: 'retro-badge retro-badge-violet border-none',
      panelClassName:
        'border-[var(--retro-violet)] bg-[rgba(97,88,255,0.1)] text-[var(--retro-ink)]',
    };
  }

  return {
    label: c.statusNotStarted,
    badgeClassName: 'retro-badge retro-badge-ink border-none',
    panelClassName:
      'border-[rgba(15,17,31,0.14)] bg-white/82 text-[var(--retro-ink)]',
  };
};

const formatRiskFlag = (flag: string) =>
  flag
    .split('_')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');

const selectClassName =
  'retro-field h-12 w-full appearance-none px-4 text-sm leading-6';
const textAreaClassName =
  'retro-field min-h-28 w-full px-4 py-3 text-sm leading-6 outline-none transition focus:border-[var(--retro-violet)] disabled:cursor-not-allowed disabled:opacity-60';
const fileInputClassName =
  'retro-field h-12 w-full cursor-pointer px-3 text-sm file:mr-3 file:border-0 file:bg-transparent file:font-semibold file:text-[var(--retro-ink)]';

export function KycVerificationPage() {
  const locale = useLocale() as keyof typeof copy;
  const c = copy[locale];

  const [profile, setProfile] = useState<KycUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [targetTier, setTargetTier] = useState<KycSubmitRequest['targetTier']>(
    'tier_1',
  );
  const [legalName, setLegalName] = useState('');
  const [documentType, setDocumentType] =
    useState<KycDocumentType>('national_id');
  const [documentNumberLast4, setDocumentNumberLast4] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [documentExpiresOn, setDocumentExpiresOn] = useState('');
  const [notes, setNotes] = useState('');
  const [frontDocument, setFrontDocument] = useState<DraftDocument | null>(null);
  const [backDocument, setBackDocument] = useState<DraftDocument | null>(null);
  const [selfieDocument, setSelfieDocument] = useState<DraftDocument | null>(null);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      setLoading(true);
      setError(null);

      try {
        const response = await browserUserApiClient.getKycProfile();
        if (!active) {
          return;
        }

        if (!response.ok) {
          setError(response.error?.message ?? c.loadFailed);
          setLoading(false);
          return;
        }

        const nextProfile = response.data;
        setProfile(nextProfile);
        setTargetTier(
          nextProfile.currentTier === 'tier_2'
            ? 'tier_2'
            : nextProfile.requestedTier === 'tier_2'
              ? 'tier_2'
              : 'tier_1',
        );
        setLegalName(nextProfile.legalName ?? '');
        setDocumentType(
          (nextProfile.documentType as KycDocumentType | null) ?? 'national_id',
        );
        setDocumentNumberLast4(nextProfile.documentNumberLast4 ?? '');
        setCountryCode(nextProfile.countryCode ?? '');
        setDocumentExpiresOn(
          toDateInputValue(
            nextProfile.documents.find((document) => document.kind !== 'selfie')
              ?.expiresAt ?? null,
          ),
        );
        setNotes(nextProfile.notes ?? '');
      } catch (nextError) {
        if (active) {
          setError(nextError instanceof Error ? nextError.message : c.loadFailed);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      active = false;
    };
  }, [c.loadFailed, locale]);

  async function handleFileChange(
    event: ChangeEvent<HTMLInputElement>,
    setter: (value: DraftDocument | null) => void,
    kind: DraftDocument['kind'],
  ) {
    const file = event.target.files?.[0];
    if (!file) {
      setter(null);
      return;
    }

    try {
      const draft = await readFileAsBase64(file, c.fileReadFailed);
      setter({ ...draft, kind });
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : c.fileReadFailed);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!frontDocument || !selfieDocument) {
      setError(c.filesRequired);
      return;
    }

    if (!documentExpiresOn) {
      setError(c.documentExpiryRequired);
      return;
    }

    setSubmitting(true);
    setError(null);
    setNotice(null);

    const documents: KycSubmitRequest['documents'] = [
      frontDocument,
      selfieDocument,
      ...(backDocument ? [backDocument] : []),
    ].map(({ previewUrl: _previewUrl, ...document }) => document);

    try {
      const response = await browserUserApiClient.submitKycProfile({
        targetTier,
        legalName: legalName.trim(),
        documentType,
        documentNumberLast4: documentNumberLast4.trim().toUpperCase(),
        countryCode: countryCode.trim().toUpperCase() || undefined,
        documentExpiresAt: `${documentExpiresOn}T23:59:59.999Z`,
        notes: notes.trim() || undefined,
        documents,
      });

      if (!response.ok) {
        setError(response.error?.message ?? c.submitFailed);
        setSubmitting(false);
        return;
      }

      setProfile(response.data);
      setFrontDocument(null);
      setBackDocument(null);
      setSelfieDocument(null);
      setNotice(c.success);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : c.submitFailed);
    } finally {
      setSubmitting(false);
    }
  }

  const statusMeta = statusPresentation(locale, profile?.status ?? 'not_started');
  const canSubmit = !loading && !!profile && profile.status !== 'pending';
  const formLocked = loading || !profile || profile.status === 'pending' || submitting;
  const requestedTierLabel = profile?.requestedTier
    ? tierLabel(locale, profile.requestedTier)
    : c.noneRequested;
  const selectedDocumentCount = [
    frontDocument,
    backDocument,
    selfieDocument,
  ].filter(Boolean).length;
  const liveDocumentCount = profile?.documents.length ?? 0;
  const identityComplete = legalName.trim().length >= 2 && documentNumberLast4.length === 4;
  const tierStages: Array<{ tier: KycTier; body: string }> = [
    { tier: 'tier_0', body: c.tier0Body },
    { tier: 'tier_1', body: c.tier1Body },
    { tier: 'tier_2', body: c.tier2Body },
  ];
  const packetChecks = [
    {
      label: c.checkpointIdentity,
      complete: identityComplete,
    },
    {
      label: c.checkpointFront,
      complete: Boolean(frontDocument) || profile?.documents.some((doc) => doc.kind === 'identity_front'),
    },
    {
      label: c.checkpointSelfie,
      complete: Boolean(selfieDocument) || profile?.documents.some((doc) => doc.kind === 'selfie'),
    },
    {
      label: c.checkpointReview,
      complete: profile?.status !== 'pending',
    },
  ];

  return (
    <div className="space-y-6">
      <Card className="retro-panel-featured overflow-hidden rounded-[1.95rem] border-none">
        <CardContent className="retro-ivory-surface relative overflow-hidden px-6 py-7 md:px-8 md:py-8">
          <div className="absolute inset-0 retro-dot-overlay opacity-25" />
          <div className="absolute inset-y-0 right-0 hidden w-40 bg-gradient-to-r from-transparent via-[rgba(255,213,61,0.08)] to-[rgba(97,88,255,0.16)] xl:block" />

          <div className="relative space-y-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-3">
                <Badge className="retro-badge retro-badge-gold border-none">
                  {c.reviewDeskTitle}
                </Badge>
                <div className="space-y-3">
                  <CardTitle className="text-[clamp(2.8rem,6vw,5rem)] font-black tracking-[-0.06em] text-[var(--retro-orange)]">
                    {c.title}
                  </CardTitle>
                  <CardDescription className="max-w-3xl text-base leading-8 text-[rgba(15,17,31,0.72)]">
                    {c.description}
                  </CardDescription>
                </div>
              </div>

              <div className="rounded-[1.5rem] border-2 border-[var(--retro-ink)] bg-white/82 px-5 py-4 shadow-[6px_6px_0px_0px_rgba(15,17,31,0.94)]">
                <p className="text-[0.68rem] font-black uppercase tracking-[0.22em] text-[rgba(15,17,31,0.54)]">
                  {c.status}
                </p>
                <div className="mt-3">
                  <Badge className={statusMeta.badgeClassName}>{statusMeta.label}</Badge>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[1.25rem] border border-[rgba(15,17,31,0.12)] bg-white/82 px-4 py-3 shadow-[4px_4px_0px_0px_rgba(15,17,31,0.08)]">
                <p className="text-[0.68rem] font-black uppercase tracking-[0.22em] text-[rgba(15,17,31,0.54)]">
                  {c.currentTier}
                </p>
                <p className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--retro-ink)]">
                  {tierLabel(locale, profile?.currentTier)}
                </p>
              </div>
              <div className="rounded-[1.25rem] border border-[rgba(15,17,31,0.12)] bg-white/82 px-4 py-3 shadow-[4px_4px_0px_0px_rgba(15,17,31,0.08)]">
                <p className="text-[0.68rem] font-black uppercase tracking-[0.22em] text-[rgba(15,17,31,0.54)]">
                  {c.requestedTier}
                </p>
                <p className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--retro-violet)]">
                  {requestedTierLabel}
                </p>
              </div>
              <div className="rounded-[1.25rem] border border-[rgba(15,17,31,0.12)] bg-white/82 px-4 py-3 shadow-[4px_4px_0px_0px_rgba(15,17,31,0.08)]">
                <p className="text-[0.68rem] font-black uppercase tracking-[0.22em] text-[rgba(15,17,31,0.54)]">
                  {c.docsCount}
                </p>
                <p className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--retro-orange)]">
                  {liveDocumentCount}
                </p>
              </div>
              <div className="rounded-[1.25rem] border border-[rgba(15,17,31,0.12)] bg-white/82 px-4 py-3 shadow-[4px_4px_0px_0px_rgba(15,17,31,0.08)]">
                <p className="text-[0.68rem] font-black uppercase tracking-[0.22em] text-[rgba(15,17,31,0.54)]">
                  {c.submissionVersion}
                </p>
                <p className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--retro-ink)]">
                  {profile?.submissionVersion ?? 0}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <DashboardFeedbackNotice tone="warning" testId="kyc-loading">
          {c.loading}
        </DashboardFeedbackNotice>
      ) : null}
      {notice ? <DashboardFeedbackNotice tone="success">{notice}</DashboardFeedbackNotice> : null}
      {error ? <DashboardFeedbackNotice tone="danger">{error}</DashboardFeedbackNotice> : null}

      {profile?.rejectionReason ? (
        <div
          className={cn(
            'rounded-[1.5rem] border-2 px-5 py-4 text-sm leading-7 shadow-[4px_4px_0px_0px_rgba(15,17,31,0.1)]',
            profile.status === 'more_info_required'
              ? 'border-[var(--retro-violet)] bg-[rgba(97,88,255,0.1)] text-[var(--retro-ink)]'
              : 'border-red-300 bg-red-50 text-red-900',
          )}
        >
          <p className="text-[0.75rem] font-black uppercase tracking-[0.22em]">
            {profile.status === 'more_info_required'
              ? c.moreInfoTitle
              : c.rejectionTitle}
          </p>
          <p className="mt-2">{profile.rejectionReason}</p>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.04fr,0.96fr]">
        <Card className="retro-panel rounded-[1.9rem] border-none">
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="text-[2rem] tracking-[-0.04em] text-[var(--retro-ink)]">
                  {c.formTitle}
                </CardTitle>
                <CardDescription className="max-w-2xl text-sm leading-7 text-[rgba(15,17,31,0.68)]">
                  {c.formDescription}
                </CardDescription>
              </div>
              <Badge className="retro-badge retro-badge-violet border-none">
                {selectedDocumentCount} / 3
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            {profile?.status === 'pending' ? (
              <DashboardFeedbackNotice tone="warning" testId="kyc-pending-lock">
                {c.pendingLocked}
              </DashboardFeedbackNotice>
            ) : null}

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="kyc-tier">{c.targetTier}</Label>
                  <select
                    id="kyc-tier"
                    className={selectClassName}
                    value={targetTier}
                    disabled={formLocked}
                    onChange={(event) =>
                      setTargetTier(event.target.value as KycSubmitRequest['targetTier'])
                    }
                  >
                    {targetTierOptions.map((tier) => (
                      <option key={tier} value={tier}>
                        {tierLabel(locale, tier)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="kyc-name">{c.legalName}</Label>
                  <Input
                    id="kyc-name"
                    className="retro-field h-12"
                    placeholder={c.legalNamePlaceholder}
                    value={legalName}
                    disabled={formLocked}
                    onChange={(event) => setLegalName(event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="kyc-doc-type">{c.documentType}</Label>
                  <select
                    id="kyc-doc-type"
                    className={selectClassName}
                    value={documentType}
                    disabled={formLocked}
                    onChange={(event) =>
                      setDocumentType(event.target.value as KycDocumentType)
                    }
                  >
                    {documentTypeOptions.map((option) => (
                      <option key={option} value={option}>
                        {documentTypeLabel(locale, option)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="kyc-doc-last4">{c.documentNumberLast4}</Label>
                  <Input
                    id="kyc-doc-last4"
                    className="retro-field h-12"
                    maxLength={4}
                    value={documentNumberLast4}
                    disabled={formLocked}
                    onChange={(event) =>
                      setDocumentNumberLast4(
                        event.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 4),
                      )
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="kyc-country">{c.countryCode}</Label>
                  <Input
                    id="kyc-country"
                    className="retro-field h-12"
                    maxLength={2}
                    placeholder={c.countryCodePlaceholder}
                    value={countryCode}
                    disabled={formLocked}
                    onChange={(event) =>
                      setCountryCode(event.target.value.toUpperCase().slice(0, 2))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="kyc-expiry">{c.documentExpiresAt}</Label>
                  <Input
                    id="kyc-expiry"
                    className="retro-field h-12"
                    type="date"
                    value={documentExpiresOn}
                    disabled={formLocked}
                    onChange={(event) => setDocumentExpiresOn(event.target.value)}
                  />
                </div>

                <div className="space-y-2 lg:col-span-2">
                  <Label htmlFor="kyc-notes">{c.notes}</Label>
                  <textarea
                    id="kyc-notes"
                    className={textAreaClassName}
                    placeholder={c.notesPlaceholder}
                    value={notes}
                    disabled={formLocked}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-3">
                {[
                  {
                    id: 'kyc-front',
                    label: c.frontDoc,
                    tone: 'retro-badge retro-badge-gold border-none',
                    required: true,
                    file: frontDocument,
                    setter: setFrontDocument,
                    kind: 'identity_front' as const,
                  },
                  {
                    id: 'kyc-back',
                    label: c.backDoc,
                    tone: 'retro-badge retro-badge-violet border-none',
                    required: false,
                    file: backDocument,
                    setter: setBackDocument,
                    kind: 'identity_back' as const,
                  },
                  {
                    id: 'kyc-selfie',
                    label: c.selfieDoc,
                    tone: 'retro-badge retro-badge-green border-none',
                    required: true,
                    file: selfieDocument,
                    setter: setSelfieDocument,
                    kind: 'selfie' as const,
                  },
                ].map((field) => (
                  <div
                    key={field.id}
                    className="rounded-[1.45rem] border border-[rgba(15,17,31,0.12)] bg-white/82 p-4 shadow-[4px_4px_0px_0px_rgba(15,17,31,0.08)]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-base font-semibold text-[var(--retro-ink)]">
                        {field.label}
                      </p>
                      <Badge className={field.tone}>
                        {field.required ? c.required : c.optional}
                      </Badge>
                    </div>

                    <div className="mt-4 space-y-3">
                      <Input
                        id={field.id}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        className={fileInputClassName}
                        disabled={formLocked}
                        onChange={(event) =>
                          void handleFileChange(event, field.setter, field.kind)
                        }
                      />
                      <div className="rounded-[1rem] border border-dashed border-[rgba(15,17,31,0.16)] bg-[rgba(255,255,255,0.65)] px-3 py-3 text-sm text-[rgba(15,17,31,0.68)]">
                        <p className="text-[0.7rem] font-black uppercase tracking-[0.18em] text-[rgba(15,17,31,0.52)]">
                          {c.selectedFile}
                        </p>
                        <p className="mt-2 font-medium text-[var(--retro-ink)]">
                          {field.file?.fileName ?? c.noFileSelected}
                        </p>
                        <p className="mt-1 text-xs text-[rgba(15,17,31,0.56)]">
                          {field.file ? formatFileSize(field.file.sizeBytes) : '--'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-4 rounded-[1.4rem] border border-[rgba(15,17,31,0.12)] bg-[rgba(255,255,255,0.72)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-2xl text-sm leading-7 text-[rgba(15,17,31,0.66)]">
                  {c.fileHint}
                </p>
                <Button
                  type="submit"
                  variant="arcade"
                  disabled={formLocked}
                  data-testid="kyc-submit-button"
                >
                  {submitting ? '...' : c.submit}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card
            className="retro-panel-dark relative overflow-hidden rounded-[1.85rem] border-none"
            data-testid="kyc-tier-ladder"
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,213,61,0.18),transparent_22%),radial-gradient(circle_at_bottom_left,rgba(97,88,255,0.22),transparent_28%)]" />
            <CardContent className="relative space-y-5 p-6">
              <div className="space-y-2">
                <p className="text-[1.9rem] font-black tracking-[-0.03em] text-white">
                  {c.tierLadderTitle}
                </p>
                <p className="max-w-xl text-sm leading-7 text-slate-300">
                  {c.tierLadderDescription}
                </p>
              </div>

              <div className="space-y-3">
                {tierStages.map((stage) => {
                  const currentRank = tierRanks[profile?.currentTier ?? 'tier_0'];
                  const stageRank = tierRanks[stage.tier];
                  const stageState =
                    currentRank >= stageRank
                      ? c.tierComplete
                      : profile?.requestedTier === stage.tier
                        ? c.tierRequested
                        : c.tierLocked;

                  return (
                    <div
                      key={stage.tier}
                      className={cn(
                        'rounded-[1.2rem] border-2 px-4 py-4',
                        currentRank >= stageRank
                          ? 'border-[rgba(255,213,61,0.35)] bg-[rgba(255,213,61,0.08)]'
                          : profile?.requestedTier === stage.tier
                            ? 'border-[rgba(97,88,255,0.45)] bg-[rgba(97,88,255,0.1)]'
                            : 'border-[#202745] bg-[rgba(255,255,255,0.04)]',
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-lg font-semibold text-white">
                            {tierLabel(locale, stage.tier)}
                          </p>
                          <p className="text-sm leading-6 text-slate-300">
                            {stage.body}
                          </p>
                        </div>
                        <Badge
                          className={
                            currentRank >= stageRank
                              ? 'retro-badge retro-badge-gold border-none'
                              : profile?.requestedTier === stage.tier
                                ? 'retro-badge retro-badge-violet border-none'
                                : 'retro-badge retro-badge-ink border-none'
                          }
                        >
                          {stageState}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card
            className="retro-panel rounded-[1.85rem] border-none"
            data-testid="kyc-review-desk"
          >
            <CardHeader className="space-y-2">
              <CardTitle className="text-[1.9rem] tracking-[-0.03em] text-[var(--retro-ink)]">
                {c.reviewDeskTitle}
              </CardTitle>
              <CardDescription className="text-sm leading-7 text-[rgba(15,17,31,0.68)]">
                {c.reviewDeskDescription}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[1.2rem] border border-[rgba(15,17,31,0.12)] bg-white/78 px-4 py-3">
                  <p className="text-[0.7rem] font-black uppercase tracking-[0.18em] text-[rgba(15,17,31,0.52)]">
                    {c.submissionVersion}
                  </p>
                  <p className="mt-2 text-xl font-black tracking-[-0.04em] text-[var(--retro-ink)]">
                    {profile?.submissionVersion ?? 0}
                  </p>
                </div>
                <div className="rounded-[1.2rem] border border-[rgba(15,17,31,0.12)] bg-white/78 px-4 py-3">
                  <p className="text-[0.7rem] font-black uppercase tracking-[0.18em] text-[rgba(15,17,31,0.52)]">
                    {c.status}
                  </p>
                  <div className="mt-2">
                    <Badge className={statusMeta.badgeClassName}>{statusMeta.label}</Badge>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.35rem] border border-[rgba(15,17,31,0.12)] bg-white/78 p-4">
                <div className="grid gap-3 text-sm text-[rgba(15,17,31,0.68)]">
                  <p>
                    <span className="font-semibold text-[var(--retro-ink)]">
                      {c.submittedAt}:
                    </span>{' '}
                    {formatDateTime(locale, c.unknown, profile?.submittedAt)}
                  </p>
                  <p>
                    <span className="font-semibold text-[var(--retro-ink)]">
                      {c.reviewedAt}:
                    </span>{' '}
                    {formatDateTime(locale, c.unknown, profile?.reviewedAt)}
                  </p>
                  <p>
                    <span className="font-semibold text-[var(--retro-ink)]">
                      {c.requestedTier}:
                    </span>{' '}
                    {requestedTierLabel}
                  </p>
                </div>
              </div>

              <div className="rounded-[1.35rem] border border-[rgba(15,17,31,0.12)] bg-white/78 p-4">
                <div className="space-y-2">
                  <p className="text-base font-semibold text-[var(--retro-ink)]">
                    {c.riskFlagsTitle}
                  </p>
                  {profile?.riskFlags.length ? (
                    <div className="flex flex-wrap gap-2">
                      {profile.riskFlags.map((flag) => (
                        <Badge
                          key={flag}
                          className="retro-badge retro-badge-red border-none"
                        >
                          {formatRiskFlag(flag)}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm leading-7 text-[rgba(15,17,31,0.62)]">
                      {c.noRiskFlags}
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-[1.35rem] border border-[rgba(15,17,31,0.12)] bg-white/78 p-4">
                <div className="space-y-2">
                  <p className="text-base font-semibold text-[var(--retro-ink)]">
                    {c.checkpointTitle}
                  </p>
                  <p className="text-sm leading-7 text-[rgba(15,17,31,0.62)]">
                    {c.checkpointDescription}
                  </p>
                  <div className="space-y-2 pt-1">
                    {packetChecks.map((check) => (
                      <div
                        key={check.label}
                        className="flex items-center justify-between gap-3 rounded-[1rem] border border-[rgba(15,17,31,0.1)] bg-white/72 px-3 py-3"
                      >
                        <span className="text-sm text-[var(--retro-ink)]">
                          {check.label}
                        </span>
                        <Badge
                          className={
                            check.complete
                              ? 'retro-badge retro-badge-green border-none'
                              : 'retro-badge retro-badge-ink border-none'
                          }
                        >
                          {check.complete ? c.checkpointComplete : c.checkpointNeeded}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card
          className="retro-panel rounded-[1.9rem] border-none"
          data-testid="kyc-documents-panel"
        >
          <CardHeader className="space-y-2">
            <CardTitle className="text-[1.9rem] tracking-[-0.03em] text-[var(--retro-ink)]">
              {c.docsTitle}
            </CardTitle>
            <CardDescription className="text-sm leading-7 text-[rgba(15,17,31,0.68)]">
              {c.docsDescription}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="rounded-[1.35rem] border border-[rgba(15,17,31,0.12)] bg-white/76 px-4 py-4">
              <p className="text-base font-semibold text-[var(--retro-ink)]">
                {c.activePacketTitle}
              </p>
              <p className="mt-2 text-sm leading-7 text-[rgba(15,17,31,0.62)]">
                {c.activePacketDescription}
              </p>
            </div>

            {profile?.documents.length ? (
              profile.documents.map((document) => (
                <div
                  key={document.id}
                  className="rounded-[1.35rem] border border-[rgba(15,17,31,0.12)] bg-white/78 px-4 py-4 text-sm text-[rgba(15,17,31,0.72)] shadow-[4px_4px_0px_0px_rgba(15,17,31,0.08)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-semibold text-[var(--retro-ink)]">
                        {document.fileName}
                      </p>
                      <p className="text-xs uppercase tracking-[0.18em] text-[rgba(15,17,31,0.5)]">
                        {documentKindLabel(locale, document.kind)}
                      </p>
                    </div>
                    <Badge className="retro-badge retro-badge-ink border-none">
                      {formatFileSize(document.sizeBytes)}
                    </Badge>
                  </div>

                  <div className="mt-3 grid gap-2 text-xs text-[rgba(15,17,31,0.58)]">
                    <p>
                      {c.documentType}: {documentTypeLabel(locale, profile.documentType ?? 'national_id')}
                    </p>
                    <p>
                      {c.documentExpiryLabel}:{' '}
                      {toDateInputValue(document.expiresAt) || '-'}
                    </p>
                    {document.storagePath ? (
                      <a
                        href={document.storagePath}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-[var(--retro-violet)] underline underline-offset-4"
                      >
                        {c.openDocument}
                      </a>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[1.35rem] border border-dashed border-[rgba(15,17,31,0.16)] bg-white/74 px-4 py-5 text-sm leading-7 text-[rgba(15,17,31,0.62)]">
                {c.noDocs}
              </div>
            )}
          </CardContent>
        </Card>

        <Card
          className="retro-panel rounded-[1.9rem] border-none"
          data-testid="kyc-history-panel"
        >
          <CardHeader className="space-y-2">
            <CardTitle className="text-[1.9rem] tracking-[-0.03em] text-[var(--retro-ink)]">
              {c.historyTitle}
            </CardTitle>
            <CardDescription className="text-sm leading-7 text-[rgba(15,17,31,0.68)]">
              {c.historyDescription}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {profile?.reviewEvents.length ? (
              profile.reviewEvents.map((event) => (
                <div
                  key={event.id}
                  className="rounded-[1.35rem] border border-[rgba(15,17,31,0.12)] bg-white/78 px-4 py-4 text-sm text-[rgba(15,17,31,0.72)] shadow-[4px_4px_0px_0px_rgba(15,17,31,0.08)]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Badge className={statusPresentation(locale, event.toStatus).badgeClassName}>
                      {reviewActionLabel(locale, event.action)}
                    </Badge>
                    <span className="text-xs uppercase tracking-[0.16em] text-[rgba(15,17,31,0.52)]">
                      {formatDateTime(locale, c.unknown, event.createdAt)}
                    </span>
                  </div>

                  <div className="mt-3 space-y-2">
                    <p className="font-semibold text-[var(--retro-ink)]">
                      {event.targetTier ? tierLabel(locale, event.targetTier) : c.noneRequested}
                    </p>
                    <p className="text-sm leading-7 text-[rgba(15,17,31,0.62)]">
                      {statusPresentation(locale, event.fromStatus).label} →{' '}
                      {statusPresentation(locale, event.toStatus).label}
                      {event.reason ? ` · ${event.reason}` : ''}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[1.35rem] border border-dashed border-[rgba(15,17,31,0.16)] bg-white/74 px-4 py-5 text-sm leading-7 text-[rgba(15,17,31,0.62)]">
                {c.noHistory}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
