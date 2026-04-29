'use client';

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import type {
  KycDocumentType,
  KycSubmitDocument,
  KycSubmitRequest,
  KycTier,
  KycUserProfile,
} from '@reward/shared-types/kyc';

import { useLocale } from '@/components/i18n-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { browserUserApiClient } from '@/lib/api/user-client';

type DraftDocument = KycSubmitDocument & {
  previewUrl: string;
};

const copy = {
  en: {
    title: 'KYC verification',
    description:
      'Submit identity documents for tier-based gameplay and withdrawal access.',
    loading: 'Loading verification profile...',
    tierTitle: 'Current verification tier',
    formTitle: 'Submit or resubmit KYC',
    formDescription:
      'Tier 1 unlocks small-stake real-money play. Tier 2 unlocks withdrawals and future multiplayer tables.',
    currentTier: 'Current tier',
    requestedTier: 'Requested tier',
    status: 'Review status',
    legalName: 'Legal name',
    documentType: 'Document type',
    documentNumberLast4: 'Document number last 4',
    countryCode: 'Country code',
    documentExpiresAt: 'Document expiry date',
    notes: 'Reviewer notes',
    targetTier: 'Target tier',
    tier0: 'Tier 0 demo',
    tier1: 'Tier 1 small-stake',
    tier2: 'Tier 2 withdraw + multiplayer',
    nationalId: 'National ID',
    passport: 'Passport',
    driverLicense: 'Driver license',
    frontDoc: 'Identity front',
    backDoc: 'Identity back',
    selfieDoc: 'Selfie',
    submit: 'Submit KYC',
    pendingLocked: 'A KYC review is already pending. Wait for admin review before resubmitting.',
    historyTitle: 'Review timeline',
    docsTitle: 'Current submission',
    noDocs: 'No documents submitted yet.',
    noHistory: 'No review events yet.',
    success: 'KYC submission created.',
    fileHint: 'Accepts JPG, PNG, WEBP, or PDF. Back side is optional.',
    documentExpiryRequired: 'Document expiry date is required.',
    documentExpiryLabel: 'Expires at',
  },
  'zh-CN': {
    title: 'KYC 实名认证',
    description: '提交身份材料，按认证等级解锁玩法范围与提现能力。',
    loading: '正在加载 KYC 档案...',
    tierTitle: '当前认证等级',
    formTitle: '提交 / 重新提交 KYC',
    formDescription:
      'Tier 1 解锁小额真钱玩法，Tier 2 解锁提现和后续多人真钱桌。',
    currentTier: '当前等级',
    requestedTier: '申请等级',
    status: '审核状态',
    legalName: '真实姓名',
    documentType: '证件类型',
    documentNumberLast4: '证件号后 4 位',
    countryCode: '国家代码',
    documentExpiresAt: '证件到期日',
    notes: '补充说明',
    targetTier: '目标等级',
    tier0: 'Tier 0 试玩',
    tier1: 'Tier 1 小额玩法',
    tier2: 'Tier 2 提现 + 多人',
    nationalId: '身份证',
    passport: '护照',
    driverLicense: '驾照',
    frontDoc: '证件正面',
    backDoc: '证件反面',
    selfieDoc: '手持自拍',
    submit: '提交 KYC',
    pendingLocked: '当前已有待审核的 KYC 申请，请等待后台处理后再重提。',
    historyTitle: '审核时间线',
    docsTitle: '当前提交材料',
    noDocs: '还没有提交材料。',
    noHistory: '还没有审核事件。',
    success: 'KYC 申请已提交。',
    fileHint: '支持 JPG、PNG、WEBP、PDF。证件反面可选。',
    documentExpiryRequired: '必须填写证件到期日。',
    documentExpiryLabel: '到期时间',
  },
} as const;

const targetTierOptions: KycSubmitRequest['targetTier'][] = ['tier_1', 'tier_2'];
const documentTypeOptions: KycDocumentType[] = [
  'national_id',
  'passport',
  'driver_license',
];

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
  return c.nationalId;
};

const readFileAsBase64 = async (file: File): Promise<DraftDocument> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file.'));
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
    void loadProfile();
  }, []);

  async function loadProfile() {
    setLoading(true);
    setError(null);
    const response = await browserUserApiClient.getKycProfile();
    if (!response.ok) {
      setError(response.error?.message ?? 'Failed to load KYC profile.');
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
    setLoading(false);
  }

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
      const draft = await readFileAsBase64(file);
      setter({ ...draft, kind });
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to read file.');
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!frontDocument || !selfieDocument) {
      setError('Front document and selfie are required.');
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
      setError(response.error?.message ?? 'Failed to submit KYC.');
      setSubmitting(false);
      return;
    }

    setProfile(response.data);
    setNotice(c.success);
    setSubmitting(false);
  }

  const canSubmit = profile?.status !== 'pending';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{c.title}</CardTitle>
          <CardDescription>{c.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? <p className="text-sm text-slate-500">{c.loading}</p> : null}
          {notice ? (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              {notice}
            </div>
          ) : null}
          {error ? (
            <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
              {error}
            </div>
          ) : null}

          {profile ? (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-slate-200 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  {c.currentTier}
                </p>
                <p className="mt-2 font-semibold text-slate-950">
                  {tierLabel(locale, profile.currentTier)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  {c.requestedTier}
                </p>
                <p className="mt-2 font-semibold text-slate-950">
                  {tierLabel(locale, profile.requestedTier)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  {c.status}
                </p>
                <div className="mt-2">
                  <Badge>{profile.status}</Badge>
                </div>
              </div>
            </div>
          ) : null}

          {profile?.rejectionReason ? (
            <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
              {profile.rejectionReason}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{c.formTitle}</CardTitle>
          <CardDescription>{c.formDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          {!canSubmit ? (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              {c.pendingLocked}
            </div>
          ) : null}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="kyc-tier">{c.targetTier}</Label>
                <select
                  id="kyc-tier"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={targetTier}
                  disabled={!canSubmit || submitting}
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
                  value={legalName}
                  disabled={!canSubmit || submitting}
                  onChange={(event) => setLegalName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="kyc-doc-type">{c.documentType}</Label>
                <select
                  id="kyc-doc-type"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={documentType}
                  disabled={!canSubmit || submitting}
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
                  maxLength={4}
                  value={documentNumberLast4}
                  disabled={!canSubmit || submitting}
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
                  maxLength={2}
                  value={countryCode}
                  disabled={!canSubmit || submitting}
                  onChange={(event) =>
                    setCountryCode(event.target.value.toUpperCase().slice(0, 2))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="kyc-expiry">{c.documentExpiresAt}</Label>
                <Input
                  id="kyc-expiry"
                  type="date"
                  value={documentExpiresOn}
                  disabled={!canSubmit || submitting}
                  onChange={(event) => setDocumentExpiresOn(event.target.value)}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="kyc-notes">{c.notes}</Label>
                <textarea
                  id="kyc-notes"
                  className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={notes}
                  disabled={!canSubmit || submitting}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="kyc-front">{c.frontDoc}</Label>
                <Input
                  id="kyc-front"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  disabled={!canSubmit || submitting}
                  onChange={(event) =>
                    void handleFileChange(event, setFrontDocument, 'identity_front')
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="kyc-back">{c.backDoc}</Label>
                <Input
                  id="kyc-back"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  disabled={!canSubmit || submitting}
                  onChange={(event) =>
                    void handleFileChange(event, setBackDocument, 'identity_back')
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="kyc-selfie">{c.selfieDoc}</Label>
                <Input
                  id="kyc-selfie"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  disabled={!canSubmit || submitting}
                  onChange={(event) =>
                    void handleFileChange(event, setSelfieDocument, 'selfie')
                  }
                />
              </div>
            </div>

            <p className="text-xs text-slate-500">{c.fileHint}</p>

            <Button type="submit" disabled={!canSubmit || submitting}>
              {submitting ? '...' : c.submit}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{c.docsTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {profile?.documents.length ? (
            profile.documents.map((document) => (
              <div
                key={document.id}
                className="rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate-950">{document.fileName}</span>
                  <Badge variant="outline">{document.kind}</Badge>
                </div>
                <div className="mt-2">
                  <a
                    href={document.storagePath ?? '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-cyan-700 underline"
                  >
                    Open document
                  </a>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {c.documentExpiryLabel}: {toDateInputValue(document.expiresAt) || '-'}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">{c.noDocs}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{c.historyTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {profile?.reviewEvents.length ? (
            profile.reviewEvents.map((event) => (
              <div
                key={event.id}
                className="rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge>{event.action}</Badge>
                  <span>{new Date(String(event.createdAt)).toLocaleString()}</span>
                </div>
                <p className="mt-2">
                  {tierLabel(locale, event.targetTier)}
                  {event.reason ? ` · ${event.reason}` : ''}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">{c.noHistory}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
