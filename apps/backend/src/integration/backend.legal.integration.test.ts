import {
  authSessions,
  authTokens,
  cryptoWithdrawAddresses,
  dataDeletionRequests,
  dataRightsAudits,
  fiatPayoutMethods,
  kycDocuments,
  kycProfiles,
  kycReviewEvents,
  legalDocumentAcceptances,
  legalDocumentPublications,
  legalDocuments,
  notificationDeliveries,
  payoutMethods,
  users,
} from "@reward/database";
import { desc, eq } from "@reward/database/orm";
import {
  CONFIG_ADMIN_PERMISSION_KEYS,
  buildAdminCookieHeaders,
  buildUserAuthHeaders,
  describeIntegrationSuite,
  enrollAdminMfa,
  expect,
  getApp,
  getDb,
  grantAdminPermissions,
  itIntegration as it,
  loginAdmin,
  loginUser,
  registerUser,
  seedAdminAccount,
  verifyUserContacts,
} from "./integration-test-support";

let legalAdminSequence = 0;

const publishLegalDocument = async (params: {
  slug: string;
  html: string;
}) => {
  legalAdminSequence += 1;
  const requester = await seedAdminAccount({
    email: `legal-requester-${legalAdminSequence}@example.com`,
  });
  const approver = await seedAdminAccount({
    email: `legal-approver-${legalAdminSequence}@example.com`,
  });
  await grantAdminPermissions(requester.admin.id, CONFIG_ADMIN_PERMISSION_KEYS);
  await grantAdminPermissions(approver.admin.id, CONFIG_ADMIN_PERMISSION_KEYS);

  const requesterSession = await loginAdmin(requester.user.email, requester.password);
  const approverSession = await enrollAdminMfa({
    email: approver.user.email,
    password: approver.password,
  });

  const createResponse = await getApp().inject({
    method: "POST",
    url: "/admin/legal/documents",
    headers: buildAdminCookieHeaders(requesterSession.token),
    payload: {
      documentKey: params.slug,
      locale: "zh-CN",
      title: params.slug,
      htmlContent: params.html,
      isRequired: true,
    },
  });

  expect(createResponse.statusCode).toBe(201);
  const createdDocument = createResponse.json().data as {
    id: number;
    documentKey: string;
    version: number;
  };

  const draftResponse = await getApp().inject({
    method: "POST",
    url: `/admin/legal/documents/${createdDocument.id}/publish-drafts`,
    headers: buildAdminCookieHeaders(requesterSession.token),
    payload: {
      rolloutPercent: 100,
      reason: "integration-test",
    },
  });

  expect(draftResponse.statusCode).toBe(201);
  const draft = draftResponse.json().data as { id: number };

  const submitResponse = await getApp().inject({
    method: "POST",
    url: `/admin/control-center/change-requests/${draft.id}/submit`,
    headers: buildAdminCookieHeaders(requesterSession.token),
    payload: {
      confirmationText: `SUBMIT ${draft.id}`,
    },
  });
  expect(submitResponse.statusCode).toBe(200);

  const approveResponse = await getApp().inject({
    method: "POST",
    url: `/admin/control-center/change-requests/${draft.id}/approve`,
    headers: buildAdminCookieHeaders(approverSession.token),
    payload: {},
  });
  expect(approveResponse.statusCode).toBe(200);

  const publishResponse = await getApp().inject({
    method: "POST",
    url: `/admin/control-center/change-requests/${draft.id}/publish`,
    headers: buildAdminCookieHeaders(approverSession.token),
    payload: {
      confirmationText: `PUBLISH ${draft.id}`,
      totpCode: approverSession.totpCode,
    },
  });
  expect(publishResponse.statusCode).toBe(200);

  const [publication] = await getDb()
    .select({
      activatedAt: legalDocumentPublications.activatedAt,
      isActive: legalDocumentPublications.isActive,
    })
    .from(legalDocumentPublications)
    .where(eq(legalDocumentPublications.documentId, createdDocument.id))
    .limit(1);

  expect(publication?.isActive).toBe(true);

  return {
    id: createdDocument.id,
    slug: createdDocument.documentKey,
    version: String(createdDocument.version),
    effectiveAt: publication?.activatedAt.toISOString() ?? new Date().toISOString(),
    isCurrent: true,
  } satisfies {
    id: number;
    slug: string;
    version: string;
    effectiveAt: string;
    isCurrent: boolean;
  };
};

const fetchCurrentLegalDocuments = async () => {
  const response = await getApp().inject({
    method: "GET",
    url: "/legal/current",
  });

  expect(response.statusCode).toBe(200);
  return response.json().data as {
    items: Array<{ id: number; slug: string; version: string }>;
  };
};

describeIntegrationSuite("backend legal integration", () => {
  it("publishes a current legal document through the change-request flow", async () => {
    const published = await publishLegalDocument({
      slug: "terms-of-service",
      html: "<h1>Terms</h1><p>Version one</p>",
    });

    expect(published).toMatchObject({
      slug: "terms-of-service",
      version: "1",
      isCurrent: true,
    });

    const [document] = await getDb()
      .select({
        id: legalDocuments.id,
        documentKey: legalDocuments.documentKey,
        version: legalDocuments.version,
      })
      .from(legalDocuments)
      .where(eq(legalDocuments.id, published.id))
      .limit(1);

    expect(document).toMatchObject({
      documentKey: "terms-of-service",
      version: 1,
    });

    const [publication] = await getDb()
      .select({
        documentId: legalDocumentPublications.documentId,
        isActive: legalDocumentPublications.isActive,
      })
      .from(legalDocumentPublications)
      .where(eq(legalDocumentPublications.documentId, published.id))
      .limit(1);

    expect(publication).toMatchObject({
      documentId: published.id,
      isActive: true,
    });
  });

  it("requires accepting current legal documents during registration", async () => {
    await publishLegalDocument({
      slug: "terms-of-service",
      html: "<h1>Terms</h1><p>Registration gate</p>",
    });

    const response = await getApp().inject({
      method: "POST",
      url: "/auth/register",
      headers: {
        "content-type": "application/json",
      },
      payload: {
        email: "legal-blocked@example.com",
        password: "secret-123",
        birthDate: "1990-01-01",
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("LEGAL_ACCEPTANCE_REQUIRED");
  });

  it("records legal acceptances at registration and blocks outdated sessions until reacceptance", async () => {
    const firstTermsDocument = await publishLegalDocument({
      slug: "terms-of-service",
      html: "<h1>Terms</h1><p>Version one</p>",
    });
    await publishLegalDocument({
      slug: "privacy-policy",
      html: "<h1>Privacy</h1><p>Version one</p>",
    });

    const currentLegalDocuments = await fetchCurrentLegalDocuments();
    const registerResponse = await getApp().inject({
      method: "POST",
      url: "/auth/register",
      headers: {
        "content-type": "application/json",
      },
      payload: {
        email: "legal-user@example.com",
        password: "secret-123",
        birthDate: "1990-01-01",
        legalAcceptances: currentLegalDocuments.items.map((document) => ({
          slug: document.slug,
          version: document.version,
        })),
      },
    });

    expect(registerResponse.statusCode).toBe(201);

    const [user] = await getDb()
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "legal-user@example.com"))
      .limit(1);

    expect(user?.id).toBeTruthy();

    const acceptanceRows = await getDb()
      .select({
        documentId: legalDocumentAcceptances.documentId,
        publicationId: legalDocumentAcceptances.publicationId,
        source: legalDocumentAcceptances.source,
        userId: legalDocumentAcceptances.userId,
      })
      .from(legalDocumentAcceptances)
      .where(eq(legalDocumentAcceptances.userId, user!.id));

    expect(acceptanceRows).toHaveLength(2);
    expect(
      acceptanceRows.find((row) => row.documentId === firstTermsDocument.id),
    ).toMatchObject({
      documentId: firstTermsDocument.id,
      source: "register",
      userId: user!.id,
    });

    const loginResponse = await getApp().inject({
      method: "POST",
      url: "/auth/user/session",
      headers: {
        "content-type": "application/json",
      },
      payload: {
        email: "legal-user@example.com",
        password: "secret-123",
      },
    });

    expect(loginResponse.statusCode).toBe(200);
    expect(loginResponse.json().data.legal).toMatchObject({
      requiresAcceptance: false,
    });
    const userToken = loginResponse.json().data.token as string;

    const walletBeforeUpgrade = await getApp().inject({
      method: "GET",
      url: "/wallet",
      headers: {
        authorization: `Bearer ${userToken}`,
      },
    });

    expect(walletBeforeUpgrade.statusCode).toBe(200);

    const secondTermsDocument = await publishLegalDocument({
      slug: "terms-of-service",
      html: "<h1>Terms</h1><p>Version two</p>",
    });

    expect(secondTermsDocument.version).toBe("2");

    const currentSessionResponse = await getApp().inject({
      method: "GET",
      url: "/auth/user/session",
      headers: {
        authorization: `Bearer ${userToken}`,
      },
    });

    expect(currentSessionResponse.statusCode).toBe(200);
    expect(currentSessionResponse.json().data.legal).toMatchObject({
      requiresAcceptance: true,
    });

    const walletAfterUpgrade = await getApp().inject({
      method: "GET",
      url: "/wallet",
      headers: {
        authorization: `Bearer ${userToken}`,
      },
    });

    expect(walletAfterUpgrade.statusCode).toBe(403);
    expect(walletAfterUpgrade.json().error.code).toBe(
      "LEGAL_ACCEPTANCE_REQUIRED",
    );

    const communityAfterUpgrade = await getApp().inject({
      method: "GET",
      url: "/community/threads",
      headers: {
        authorization: `Bearer ${userToken}`,
      },
    });

    expect(communityAfterUpgrade.statusCode).toBe(403);
    expect(communityAfterUpgrade.json().error.code).toBe(
      "LEGAL_ACCEPTANCE_REQUIRED",
    );

    const pendingDocuments = await fetchCurrentLegalDocuments();
    const acceptResponse = await getApp().inject({
      method: "POST",
      url: "/legal/acceptances",
      headers: {
        authorization: `Bearer ${userToken}`,
        "content-type": "application/json",
      },
      payload: {
        acceptances: pendingDocuments.items.map((document) => ({
          slug: document.slug,
          version: document.version,
        })),
      },
    });

    expect(acceptResponse.statusCode).toBe(200);
    expect(acceptResponse.json().data).toMatchObject({
      requiresAcceptance: false,
    });

    const walletAfterAcceptance = await getApp().inject({
      method: "GET",
      url: "/wallet",
      headers: {
        authorization: `Bearer ${userToken}`,
      },
    });

    expect(walletAfterAcceptance.statusCode).toBe(200);

    const communityAfterAcceptance = await getApp().inject({
      method: "GET",
      url: "/community/threads",
      headers: {
        authorization: `Bearer ${userToken}`,
      },
    });

    expect(communityAfterAcceptance.statusCode).toBe(200);

    const updatedAcceptances = await getDb()
      .select({
        documentId: legalDocumentAcceptances.documentId,
        source: legalDocumentAcceptances.source,
      })
      .from(legalDocumentAcceptances)
      .where(eq(legalDocumentAcceptances.userId, user!.id));

    expect(
      updatedAcceptances.find(
        (acceptance) => acceptance.documentId === secondTermsDocument.id,
      ),
    ).toMatchObject({
      documentId: secondTermsDocument.id,
      source: "user",
    });
  });

  it("queues, approves, and pseudo-anonymizes a user deletion request while writing legal audit rows", async () => {
    const adminEmail = "legal-data-rights-admin@example.com";
    const userEmail = "legal-data-rights-user@example.com";
    const userPassword = "secret-123";

    const { admin, password } = await seedAdminAccount({ email: adminEmail });
    await grantAdminPermissions(admin.id, CONFIG_ADMIN_PERMISSION_KEYS);
    const adminSession = await enrollAdminMfa({
      email: adminEmail,
      password,
    });

    const user = await registerUser(userEmail, userPassword);
    const verifiedUser = await verifyUserContacts(user.id, {
      email: true,
      phone: true,
    });
    expect(verifiedUser?.phone).toBeTruthy();

    const userSession = await loginUser(userEmail, userPassword);
    const now = new Date();

    const [bankPayoutMethod] = await getDb()
      .insert(payoutMethods)
      .values({
        userId: user.id,
        methodType: "bank_account",
        channelType: "fiat",
        assetType: "fiat",
        displayName: "Primary Payroll",
        isDefault: true,
        status: "active",
        metadata: { source: "integration" },
        updatedAt: now,
      })
      .returning();

    const [cryptoPayoutMethod] = await getDb()
      .insert(payoutMethods)
      .values({
        userId: user.id,
        methodType: "crypto_address",
        channelType: "crypto",
        assetType: "token",
        assetCode: "USDT",
        network: "ETH",
        displayName: "Treasury Wallet",
        status: "active",
        metadata: { source: "integration" },
        updatedAt: now,
      })
      .returning();

    await getDb().insert(fiatPayoutMethods).values({
      payoutMethodId: bankPayoutMethod.id,
      accountName: "Delete Me",
      bankName: "Example Bank",
      accountNoMasked: "****4321",
      routingCode: "110000",
      brand: "VISA",
      accountLast4: "4321",
      currency: "USD",
      createdAt: now,
      updatedAt: now,
    });

    await getDb().insert(cryptoWithdrawAddresses).values({
      payoutMethodId: cryptoPayoutMethod.id,
      chain: "ethereum",
      network: "ETH",
      token: "USDT",
      address: "0xdelete000000000000000000000000000000000001",
      label: "Personal wallet",
      createdAt: now,
      updatedAt: now,
    });

    const [existingKycProfile] = await getDb()
      .select({
        id: kycProfiles.id,
      })
      .from(kycProfiles)
      .where(eq(kycProfiles.userId, user.id))
      .limit(1);

    expect(existingKycProfile?.id).toBeTruthy();

    const [kycProfile] = await getDb()
      .update(kycProfiles)
      .set({
        currentTier: "tier_2",
        status: "approved",
        legalName: "Delete Me",
        documentType: "passport",
        documentNumberLast4: "4242",
        countryCode: "AU",
        submittedData: {
          legalName: "Delete Me",
          passportNumber: "A1234567",
        },
        submittedAt: now,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(eq(kycProfiles.id, existingKycProfile!.id))
      .returning();

    await getDb().insert(kycDocuments).values({
      profileId: kycProfile.id,
      userId: user.id,
      submissionVersion: 1,
      kind: "identity_front",
      fileName: "passport.png",
      mimeType: "image/png",
      storagePath: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
      metadata: { countryCode: "AU" },
      createdAt: now,
    });

    await getDb().insert(kycReviewEvents).values({
      profileId: kycProfile.id,
      userId: user.id,
      submissionVersion: 1,
      action: "approved",
      fromStatus: "pending",
      toStatus: "approved",
      targetTier: "tier_2",
      reason: "verified",
      metadata: { reviewerNote: "matched selfie" },
      createdAt: now,
    });

    await getDb().insert(authTokens).values({
      userId: user.id,
      email: userEmail,
      phone: verifiedUser?.phone ?? null,
      tokenType: "password_reset",
      tokenHash: "legal-data-rights-token-hash",
      metadata: { delivery: "email" },
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      createdAt: now,
    });

    await getDb().insert(notificationDeliveries).values({
      kind: "password_reset",
      channel: "email",
      recipient: userEmail,
      recipientKey: userEmail.toLowerCase(),
      provider: "mock",
      subject: "Reset your password",
      payload: { email: userEmail },
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    const createRequestResponse = await getApp().inject({
      method: "POST",
      url: "/legal/data-deletion-requests",
      headers: {
        ...buildUserAuthHeaders(userSession.token),
        "content-type": "application/json",
      },
      payload: {
        reason: "Please erase my profile data.",
      },
    });

    expect(createRequestResponse.statusCode).toBe(201);
    const createdRequest = createRequestResponse.json().data as {
      id: number;
      status: string;
      userId: number;
    };
    expect(createdRequest).toMatchObject({
      status: "pending_review",
      userId: user.id,
    });

    const queueResponse = await getApp().inject({
      method: "GET",
      url: "/admin/legal/data-deletion-requests",
      headers: buildAdminCookieHeaders(adminSession.token),
    });

    expect(queueResponse.statusCode).toBe(200);
    expect(queueResponse.json().data).toMatchObject({
      pendingCount: 1,
      items: [
        expect.objectContaining({
          id: createdRequest.id,
          userId: user.id,
          status: "pending_review",
        }),
      ],
    });

    const approveResponse = await getApp().inject({
      method: "POST",
      url: `/admin/legal/data-deletion-requests/${createdRequest.id}/approve`,
      headers: buildAdminCookieHeaders(adminSession.token),
      payload: {
        reviewNotes: "Retain ledger rows, remove direct identifiers.",
        totpCode: adminSession.totpCode,
      },
    });

    expect(approveResponse.statusCode).toBe(200);
    expect(approveResponse.json().data).toMatchObject({
      id: createdRequest.id,
      status: "completed",
      reviewDecision: "approved",
      completedByAdminId: admin.id,
    });

    const [updatedUser] = await getDb()
      .select({
        email: users.email,
        phone: users.phone,
        birthDate: users.birthDate,
        registrationCountryCode: users.registrationCountryCode,
        countryTier: users.countryTier,
        countryResolvedAt: users.countryResolvedAt,
        emailVerifiedAt: users.emailVerifiedAt,
        phoneVerifiedAt: users.phoneVerifiedAt,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    expect(updatedUser?.email).toContain("@privacy.invalid");
    expect(updatedUser?.phone).toBeNull();
    expect(updatedUser?.birthDate).toBeNull();
    expect(updatedUser?.registrationCountryCode).toBeNull();
    expect(updatedUser?.countryTier).toBe("unknown");
    expect(updatedUser?.countryResolvedAt).toBeNull();
    expect(updatedUser?.emailVerifiedAt).toBeNull();
    expect(updatedUser?.phoneVerifiedAt).toBeNull();

    const [requestRow] = await getDb()
      .select({
        status: dataDeletionRequests.status,
        reviewDecision: dataDeletionRequests.reviewDecision,
        completedAt: dataDeletionRequests.completedAt,
        resultSummary: dataDeletionRequests.resultSummary,
      })
      .from(dataDeletionRequests)
      .where(eq(dataDeletionRequests.id, createdRequest.id))
      .limit(1);

    expect(requestRow?.status).toBe("completed");
    expect(requestRow?.reviewDecision).toBe("approved");
    expect(requestRow?.completedAt).toBeTruthy();
    expect(requestRow?.resultSummary).toMatchObject({
      authSessionsRevoked: 1,
      authTokensRedacted: 2,
      notificationsRedacted: 1,
      payoutMethodsRedacted: 2,
    });

    const [revokedSession] = await getDb()
      .select({
        status: authSessions.status,
        revokedReason: authSessions.revokedReason,
        ip: authSessions.ip,
        userAgent: authSessions.userAgent,
      })
      .from(authSessions)
      .where(eq(authSessions.userId, user.id))
      .orderBy(desc(authSessions.createdAt))
      .limit(1);

    expect(revokedSession).toMatchObject({
      status: "revoked",
      revokedReason: "data_deletion_request",
      ip: null,
      userAgent: null,
    });

    const redactedTokens = await getDb()
      .select({
        email: authTokens.email,
        phone: authTokens.phone,
        consumedAt: authTokens.consumedAt,
        metadata: authTokens.metadata,
      })
      .from(authTokens)
      .where(eq(authTokens.userId, user.id));

    expect(redactedTokens).toHaveLength(2);
    expect(redactedTokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: null,
          phone: null,
          metadata: null,
        }),
        expect.objectContaining({
          email: null,
          phone: null,
          metadata: null,
        }),
      ]),
    );
    for (const redactedToken of redactedTokens) {
      expect(redactedToken.consumedAt).toBeTruthy();
    }

    const [redactedKycProfile] = await getDb()
      .select({
        legalName: kycProfiles.legalName,
        documentType: kycProfiles.documentType,
        documentNumberLast4: kycProfiles.documentNumberLast4,
        submittedData: kycProfiles.submittedData,
      })
      .from(kycProfiles)
      .where(eq(kycProfiles.userId, user.id))
      .limit(1);

    expect(redactedKycProfile).toMatchObject({
      legalName: null,
      documentType: null,
      documentNumberLast4: null,
      submittedData: null,
    });

    const [redactedKycDocument] = await getDb()
      .select({
        fileName: kycDocuments.fileName,
        storagePath: kycDocuments.storagePath,
        metadata: kycDocuments.metadata,
      })
      .from(kycDocuments)
      .where(eq(kycDocuments.userId, user.id))
      .limit(1);

    expect(redactedKycDocument?.fileName).toBe("redacted-document");
    expect(redactedKycDocument?.storagePath).toContain("redacted://data-rights");
    expect(redactedKycDocument?.metadata).toBeNull();

    const fiatMethodRows = await getDb()
      .select({
        displayName: payoutMethods.displayName,
        status: payoutMethods.status,
        isDefault: payoutMethods.isDefault,
        accountName: fiatPayoutMethods.accountName,
        bankName: fiatPayoutMethods.bankName,
        accountNoMasked: fiatPayoutMethods.accountNoMasked,
      })
      .from(payoutMethods)
      .leftJoin(
        fiatPayoutMethods,
        eq(fiatPayoutMethods.payoutMethodId, payoutMethods.id),
      )
      .where(eq(payoutMethods.userId, user.id))
      .orderBy(payoutMethods.id);

    expect(fiatMethodRows[0]).toMatchObject({
      displayName: "Deleted payout method",
      status: "inactive",
      isDefault: false,
      accountName: "Deleted user",
      bankName: null,
      accountNoMasked: null,
    });

    const [redactedCryptoAddress] = await getDb()
      .select({
        address: cryptoWithdrawAddresses.address,
        label: cryptoWithdrawAddresses.label,
      })
      .from(cryptoWithdrawAddresses)
      .where(eq(cryptoWithdrawAddresses.payoutMethodId, cryptoPayoutMethod.id))
      .limit(1);

    expect(redactedCryptoAddress?.address).toContain("redacted-address-");
    expect(redactedCryptoAddress?.label).toBeNull();

    const [redactedNotification] = await getDb()
      .select({
        recipient: notificationDeliveries.recipient,
        recipientKey: notificationDeliveries.recipientKey,
        subject: notificationDeliveries.subject,
        payload: notificationDeliveries.payload,
      })
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.subject, "Redacted notification"))
      .limit(1);

    expect(redactedNotification).toMatchObject({
      subject: "Redacted notification",
      payload: {
        redacted: true,
        requestId: createdRequest.id,
      },
    });
    expect(redactedNotification?.recipient).toContain("@privacy.invalid");
    expect(redactedNotification?.recipientKey).toContain("@privacy.invalid");

    const auditRows = await getDb()
      .select({
        action: dataRightsAudits.action,
      })
      .from(dataRightsAudits)
      .where(eq(dataRightsAudits.requestId, createdRequest.id))
      .orderBy(dataRightsAudits.id);

    expect(auditRows.map((row) => row.action)).toEqual([
      "requested",
      "approved",
      "completed",
    ]);

    const walletAfterDeletion = await getApp().inject({
      method: "GET",
      url: "/wallet",
      headers: buildUserAuthHeaders(userSession.token),
    });

    expect(walletAfterDeletion.statusCode).toBe(401);
  });
});
