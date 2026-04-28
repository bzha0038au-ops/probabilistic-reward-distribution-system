import {
  legalDocumentAcceptances,
  legalDocumentPublications,
  legalDocuments,
  users,
} from "@reward/database";
import { eq } from "@reward/database/orm";
import {
  CONFIG_ADMIN_PERMISSION_KEYS,
  buildAdminCookieHeaders,
  describeIntegrationSuite,
  enrollAdminMfa,
  expect,
  getApp,
  getDb,
  grantAdminPermissions,
  itIntegration as it,
  loginAdmin,
  seedAdminAccount,
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
});
