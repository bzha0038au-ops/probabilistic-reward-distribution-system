// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { KycUserProfile } from '@reward/shared-types/kyc';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '@/components/i18n-provider';
import { getMessages } from '@/lib/i18n/messages';
import { KycVerificationPage } from './kyc-verification-page';

const messages = getMessages('en');

const browserUserApiClientMock = vi.hoisted(() => ({
  getKycProfile: vi.fn(),
  submitKycProfile: vi.fn(),
}));

vi.mock('@/lib/api/user-client', () => ({
  browserUserApiClient: browserUserApiClientMock,
}));

const ok = <T,>(data: T) => ({
  ok: true as const,
  data,
});

const buildProfile = (overrides?: Partial<KycUserProfile>): KycUserProfile => ({
  id: 7,
  userId: 42,
  currentTier: 'tier_0',
  requestedTier: 'tier_1',
  status: 'more_info_required',
  submissionVersion: 3,
  legalName: 'Avery Stone',
  documentType: 'passport',
  documentNumberLast4: '7F4A',
  countryCode: 'AU',
  notes: 'Re-uploaded after expiry mismatch.',
  rejectionReason: 'Please upload a clearer selfie for facial matching.',
  submittedData: null,
  riskFlags: ['withdrawal_review', 'manual_document_check'],
  freezeRecordId: null,
  reviewedByAdminId: 5,
  submittedAt: '2026-05-01T09:00:00.000Z',
  reviewedAt: '2026-05-02T10:15:00.000Z',
  createdAt: '2026-04-20T09:00:00.000Z',
  updatedAt: '2026-05-02T10:15:00.000Z',
  documents: [
    {
      id: 11,
      profileId: 7,
      userId: 42,
      submissionVersion: 3,
      kind: 'identity_front',
      label: null,
      fileName: 'passport-front.png',
      mimeType: 'image/png',
      sizeBytes: 245000,
      storagePath: 'https://example.com/passport-front.png',
      createdAt: '2026-05-01T09:00:00.000Z',
      expiresAt: '2028-04-30T00:00:00.000Z',
      metadata: null,
    },
    {
      id: 12,
      profileId: 7,
      userId: 42,
      submissionVersion: 3,
      kind: 'selfie',
      label: null,
      fileName: 'selfie.png',
      mimeType: 'image/png',
      sizeBytes: 187000,
      storagePath: 'https://example.com/selfie.png',
      createdAt: '2026-05-01T09:00:00.000Z',
      expiresAt: null,
      metadata: null,
    },
  ],
  reviewEvents: [
    {
      id: 91,
      profileId: 7,
      userId: 42,
      submissionVersion: 3,
      action: 'submitted',
      fromStatus: 'not_started',
      toStatus: 'pending',
      targetTier: 'tier_1',
      actorAdminId: null,
      actorAdminEmail: null,
      reason: null,
      metadata: null,
      createdAt: '2026-05-01T09:00:00.000Z',
    },
    {
      id: 92,
      profileId: 7,
      userId: 42,
      submissionVersion: 3,
      action: 'request_more_info',
      fromStatus: 'pending',
      toStatus: 'more_info_required',
      targetTier: 'tier_1',
      actorAdminId: 5,
      actorAdminEmail: 'risk@example.com',
      reason: 'Selfie needs better lighting.',
      metadata: null,
      createdAt: '2026-05-02T10:15:00.000Z',
    },
  ],
  ...overrides,
});

function renderPage() {
  return render(
    <I18nProvider locale="en" messages={messages}>
      <KycVerificationPage />
    </I18nProvider>,
  );
}

describe('KycVerificationPage', () => {
  beforeEach(() => {
    browserUserApiClientMock.submitKycProfile.mockResolvedValue(
      ok(buildProfile({ status: 'pending' })),
    );
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the review desk, current documents, and timeline after loading the profile', async () => {
    browserUserApiClientMock.getKycProfile.mockResolvedValue(ok(buildProfile()));

    renderPage();

    await waitFor(() => {
      const reviewDesk = screen.getByTestId('kyc-review-desk');
      expect(reviewDesk.textContent).toContain('More info required');
    });

    expect(screen.getByTestId('kyc-documents-panel').textContent).toContain(
      'passport-front.png',
    );
    expect(screen.getByTestId('kyc-history-panel').textContent).toContain(
      'Selfie needs better lighting.',
    );
    expect(screen.getByTestId('kyc-tier-ladder').textContent).toContain(
      'Tier 1 small-stake',
    );
  });

  it('locks resubmission when the profile is already pending review', async () => {
    browserUserApiClientMock.getKycProfile.mockResolvedValue(
      ok(
        buildProfile({
          status: 'pending',
          rejectionReason: null,
          riskFlags: [],
        }),
      ),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('kyc-pending-lock').textContent).toContain(
        'A KYC review is already pending.',
      );
    });

    expect(screen.getByTestId('kyc-submit-button').getAttribute('disabled')).not.toBeNull();
  });
});
