import { createHash } from "node:crypto";

import {
  configChangeRequests,
  legalDocumentAcceptances,
  legalDocumentPublications,
  legalDocuments,
} from "@reward/database";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  sql,
} from "@reward/database/orm";
import { API_ERROR_CODES } from "@reward/shared-types/api";
import type {
  CurrentLegalAcceptanceState,
  CurrentLegalDocument,
  LegalDocumentAdminRecord,
  LegalAcceptanceInput,
  LegalCurrentDocument,
  LegalPublication,
  LegalReleaseMode,
} from "@reward/shared-types/legal";

import { db, type DbClient, type DbTransaction } from "../../db";
import {
  conflictError,
  notFoundError,
  persistenceError,
  unprocessableEntityError,
} from "../../shared/errors";

type DbExecutor = DbClient | DbTransaction;

type LegalDocumentRow = typeof legalDocuments.$inferSelect;
type LegalPublicationRow = typeof legalDocumentPublications.$inferSelect;

const DEFAULT_LOCALE = "zh-CN";
const QUEUED_CHANGE_REQUEST_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
] as const;

const normalizeOptionalText = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
};

const normalizeDocumentKey = (value: string) => value.trim().toLowerCase();

const toLegalDocumentRecord = (row: LegalDocumentRow) => ({
  id: row.id,
  documentKey: row.documentKey,
  locale: row.locale,
  title: row.title,
  version: row.version,
  htmlContent: row.htmlContent,
  summary: normalizeOptionalText(row.summary),
  changeNotes: normalizeOptionalText(row.changeNotes),
  isRequired: row.isRequired,
  createdByAdminId: row.createdByAdminId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toLegalPublicationRecord = (row: LegalPublicationRow): LegalPublication => ({
  id: row.id,
  documentId: row.documentId,
  documentKey: row.documentKey,
  locale: row.locale,
  releaseMode: row.releaseMode as LegalReleaseMode,
  rolloutPercent: row.rolloutPercent,
  fallbackPublicationId: row.fallbackPublicationId ?? null,
  rollbackFromPublicationId: row.rollbackFromPublicationId ?? null,
  changeRequestId: row.changeRequestId ?? null,
  publishedByAdminId: row.publishedByAdminId,
  isActive: row.isActive,
  activatedAt: row.activatedAt,
  supersededAt: row.supersededAt ?? null,
  supersededByPublicationId: row.supersededByPublicationId ?? null,
});

const toCurrentLegalDocument = (
  document: LegalCurrentDocument,
): CurrentLegalDocument => ({
  id: document.id,
  slug: document.documentKey,
  version: String(document.version),
  effectiveAt: new Date(document.publication.activatedAt).toISOString(),
  html: document.htmlContent,
});

const resolveAudienceKey = (params: {
  userId?: number | null;
  audienceId?: string | null;
}) => {
  if (params.userId) {
    return `user:${params.userId}`;
  }

  const audienceId = params.audienceId?.trim();
  return audienceId ? `audience:${audienceId}` : null;
};

const resolveBucket = (documentKey: string, audienceKey: string) => {
  const digest = createHash("sha256")
    .update(`${documentKey}:${audienceKey}`)
    .digest("hex");
  return Number.parseInt(digest.slice(0, 8), 16) % 100;
};

const readDocumentRow = async (
  executor: DbExecutor,
  documentId: number,
): Promise<LegalDocumentRow | null> => {
  const [row] = await executor
    .select()
    .from(legalDocuments)
    .where(eq(legalDocuments.id, documentId))
    .limit(1);

  return row ?? null;
};

const assertDocumentExists = (
  document: LegalDocumentRow | null,
  documentId: number,
): LegalDocumentRow => {
  if (!document) {
    throw notFoundError(`Legal document ${documentId} not found.`, {
      code: API_ERROR_CODES.LEGAL_DOCUMENT_NOT_FOUND,
    });
  }

  return document;
};

const readQueuedPublishRequestCount = async (
  executor: DbExecutor,
  documentId: number,
) => {
  const [row] = await executor
    .select({ total: sql<number>`count(*)::int` })
    .from(configChangeRequests)
    .where(
      and(
        eq(configChangeRequests.changeType, "legal_document_publish"),
        eq(configChangeRequests.targetType, "legal_document"),
        eq(configChangeRequests.targetId, documentId),
        inArray(configChangeRequests.status, [...QUEUED_CHANGE_REQUEST_STATUSES]),
      ),
    )
    .limit(1);

  return Number(row?.total ?? 0);
};

const assertDocumentMutable = async (
  executor: DbExecutor,
  document: LegalDocumentRow,
) => {
  const [publication, queuedCount] = await Promise.all([
    executor
      .select({ id: legalDocumentPublications.id })
      .from(legalDocumentPublications)
      .where(eq(legalDocumentPublications.documentId, document.id))
      .limit(1),
    readQueuedPublishRequestCount(executor, document.id),
  ]);

  if (publication[0]) {
    throw conflictError("Published legal document versions are immutable.", {
      code: API_ERROR_CODES.LEGAL_DOCUMENT_IMMUTABLE,
    });
  }

  if (queuedCount > 0) {
    throw conflictError(
      "This legal document already has a queued publish request.",
      {
        code: API_ERROR_CODES.LEGAL_DOCUMENT_PUBLISH_ALREADY_QUEUED,
      },
    );
  }
};

const readActivePublications = async (
  executor: DbExecutor,
  documentKey: string,
  locale: string,
) =>
  executor
    .select()
    .from(legalDocumentPublications)
    .where(
      and(
        eq(legalDocumentPublications.documentKey, documentKey),
        eq(legalDocumentPublications.locale, locale),
        eq(legalDocumentPublications.isActive, true),
      ),
    )
    .orderBy(
      desc(legalDocumentPublications.activatedAt),
      desc(legalDocumentPublications.id),
    );

const resolvePublicationForAudience = (
  publications: LegalPublicationRow[],
  audienceKey: string | null,
) => {
  if (publications.length === 0) {
    return null;
  }

  const grayPublication =
    publications.find(
      (publication) =>
        publication.releaseMode === "gray" && publication.rolloutPercent < 100,
    ) ?? null;
  if (!grayPublication) {
    return publications[0] ?? null;
  }

  const fallbackPublication =
    publications.find(
      (publication) => publication.id === grayPublication.fallbackPublicationId,
    ) ??
    publications.find((publication) => publication.id !== grayPublication.id) ??
    null;

  if (!fallbackPublication) {
    return grayPublication;
  }

  if (!audienceKey) {
    return fallbackPublication;
  }

  return resolveBucket(grayPublication.documentKey, audienceKey) <
    grayPublication.rolloutPercent
    ? grayPublication
    : fallbackPublication;
};

export async function readActiveLegalPublicationAuditState(
  executor: DbExecutor,
  params: {
    documentKey: string;
    locale: string;
  },
) {
  const activePublications = await readActivePublications(
    executor,
    params.documentKey,
    params.locale,
  );
  const grayPublication =
    activePublications.find((publication) => publication.releaseMode === "gray") ??
    null;
  const publication = grayPublication ?? activePublications[0] ?? null;

  if (!publication) {
    return null;
  }

  const document = await readDocumentRow(executor, publication.documentId);
  if (!document) {
    return null;
  }

  return {
    resource: "legal_document_publication" as const,
    targetId: publication.documentId,
    state: {
      documentId: publication.documentId,
      documentKey: publication.documentKey,
      locale: publication.locale,
      title: document.title,
      version: document.version,
      releaseMode: publication.releaseMode,
      rolloutPercent: publication.rolloutPercent,
      publicationId: publication.id,
      fallbackPublicationId: publication.fallbackPublicationId ?? null,
      rollbackFromPublicationId: publication.rollbackFromPublicationId ?? null,
      isActive: publication.isActive,
    } satisfies Record<string, unknown>,
  };
}

const readDocumentRowsByIds = async (
  executor: DbExecutor,
  documentIds: number[],
) => {
  if (documentIds.length === 0) {
    return [];
  }

  return executor
    .select()
    .from(legalDocuments)
    .where(inArray(legalDocuments.id, documentIds));
};

export async function listLegalDocumentsForAdmin(
  executor: DbExecutor = db,
): Promise<LegalDocumentAdminRecord[]> {
  const [documentRows, publicationRows, acceptanceRows, queuedRows] =
    await Promise.all([
      executor
        .select()
        .from(legalDocuments)
        .orderBy(
          asc(legalDocuments.documentKey),
          asc(legalDocuments.locale),
          desc(legalDocuments.version),
          desc(legalDocuments.id),
        ),
      executor
        .select()
        .from(legalDocumentPublications)
        .orderBy(
          desc(legalDocumentPublications.activatedAt),
          desc(legalDocumentPublications.id),
        ),
      executor
        .select({
          documentId: legalDocumentAcceptances.documentId,
          acceptanceCount: sql<number>`count(*)::int`,
          latestAcceptedAt: sql<Date | null>`max(${legalDocumentAcceptances.acceptedAt})`,
        })
        .from(legalDocumentAcceptances)
        .groupBy(legalDocumentAcceptances.documentId),
      executor
        .select({
          documentId: configChangeRequests.targetId,
          total: sql<number>`count(*)::int`,
        })
        .from(configChangeRequests)
        .where(
          and(
            eq(configChangeRequests.changeType, "legal_document_publish"),
            eq(configChangeRequests.targetType, "legal_document"),
            inArray(configChangeRequests.status, [...QUEUED_CHANGE_REQUEST_STATUSES]),
          ),
        )
        .groupBy(configChangeRequests.targetId),
    ]);

  const latestPublicationByDocumentId = new Map<number, LegalPublicationRow>();
  const activePublicationByDocumentId = new Map<number, LegalPublicationRow>();
  for (const publication of publicationRows) {
    if (!latestPublicationByDocumentId.has(publication.documentId)) {
      latestPublicationByDocumentId.set(publication.documentId, publication);
    }

    if (publication.isActive) {
      activePublicationByDocumentId.set(publication.documentId, publication);
    }
  }

  const acceptanceByDocumentId = new Map<
    number,
    { acceptanceCount: number; latestAcceptedAt: Date | null }
  >();
  for (const row of acceptanceRows) {
    acceptanceByDocumentId.set(row.documentId, {
      acceptanceCount: Number(row.acceptanceCount ?? 0),
      latestAcceptedAt: row.latestAcceptedAt ?? null,
    });
  }

  const queuedCountByDocumentId = new Map<number, number>();
  for (const row of queuedRows) {
    if (row.documentId) {
      queuedCountByDocumentId.set(row.documentId, Number(row.total ?? 0));
    }
  }

  return documentRows.map((row) => {
    const acceptance = acceptanceByDocumentId.get(row.id);
    return {
      ...toLegalDocumentRecord(row),
      activePublication: activePublicationByDocumentId.has(row.id)
        ? toLegalPublicationRecord(activePublicationByDocumentId.get(row.id)!)
        : null,
      latestPublication: latestPublicationByDocumentId.has(row.id)
        ? toLegalPublicationRecord(latestPublicationByDocumentId.get(row.id)!)
        : null,
      acceptanceCount: acceptance?.acceptanceCount ?? 0,
      latestAcceptedAt: acceptance?.latestAcceptedAt ?? null,
      queuedChangeRequestCount: queuedCountByDocumentId.get(row.id) ?? 0,
    };
  });
}

export async function createLegalDocument(payload: {
  adminId: number;
  documentKey: string;
  locale?: string | null;
  title: string;
  htmlContent: string;
  summary?: string | null;
  changeNotes?: string | null;
  isRequired?: boolean;
}) {
  return db.transaction(async (tx) => {
    const documentKey = normalizeDocumentKey(payload.documentKey);
    const locale = payload.locale?.trim() || DEFAULT_LOCALE;

    const [latestVersion] = await tx
      .select({ version: legalDocuments.version })
      .from(legalDocuments)
      .where(
        and(
          eq(legalDocuments.documentKey, documentKey),
          eq(legalDocuments.locale, locale),
        ),
      )
      .orderBy(desc(legalDocuments.version), desc(legalDocuments.id))
      .limit(1);

    const [created] = await tx
      .insert(legalDocuments)
      .values({
        documentKey,
        locale,
        title: payload.title.trim(),
        version: (latestVersion?.version ?? 0) + 1,
        htmlContent: payload.htmlContent,
        summary: normalizeOptionalText(payload.summary),
        changeNotes: normalizeOptionalText(payload.changeNotes),
        isRequired: payload.isRequired ?? true,
        createdByAdminId: payload.adminId,
      })
      .returning();

    if (!created) {
      throw persistenceError("Failed to create legal document.");
    }

    return toLegalDocumentRecord(created);
  });
}

export async function updateLegalDocument(payload: {
  documentId: number;
  title?: string;
  htmlContent?: string;
  summary?: string | null;
  changeNotes?: string | null;
  isRequired?: boolean;
}) {
  return db.transaction(async (tx) => {
    const document = assertDocumentExists(
      await readDocumentRow(tx, payload.documentId),
      payload.documentId,
    );
    await assertDocumentMutable(tx, document);

    const [updated] = await tx
      .update(legalDocuments)
      .set({
        ...(payload.title !== undefined ? { title: payload.title.trim() } : {}),
        ...(payload.htmlContent !== undefined
          ? { htmlContent: payload.htmlContent }
          : {}),
        ...(payload.summary !== undefined
          ? { summary: normalizeOptionalText(payload.summary) }
          : {}),
        ...(payload.changeNotes !== undefined
          ? { changeNotes: normalizeOptionalText(payload.changeNotes) }
          : {}),
        ...(payload.isRequired !== undefined
          ? { isRequired: payload.isRequired }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(legalDocuments.id, payload.documentId))
      .returning();

    if (!updated) {
      throw persistenceError("Failed to update legal document.");
    }

    return toLegalDocumentRecord(updated);
  });
}

export async function deleteLegalDocument(documentId: number) {
  return db.transaction(async (tx) => {
    const document = assertDocumentExists(
      await readDocumentRow(tx, documentId),
      documentId,
    );
    await assertDocumentMutable(tx, document);

    const [deleted] = await tx
      .delete(legalDocuments)
      .where(eq(legalDocuments.id, documentId))
      .returning();

    return deleted ? toLegalDocumentRecord(deleted) : null;
  });
}

export type LegalDocumentPublishChangePayload = {
  documentId: number;
  documentKey: string;
  locale: string;
  title: string;
  version: number;
  rolloutPercent: number;
};

export async function buildLegalDocumentPublishPayload(
  executor: DbExecutor,
  params: {
    documentId: number;
    rolloutPercent: number;
  },
): Promise<LegalDocumentPublishChangePayload> {
  const document = assertDocumentExists(
    await readDocumentRow(executor, params.documentId),
    params.documentId,
  );

  const queuedCount = await readQueuedPublishRequestCount(executor, document.id);
  if (queuedCount > 0) {
    throw conflictError(
      "This legal document already has a queued publish request.",
      {
        code: API_ERROR_CODES.LEGAL_DOCUMENT_PUBLISH_ALREADY_QUEUED,
      },
    );
  }

  if (params.rolloutPercent < 100) {
    const activePublications = await readActivePublications(
      executor,
      document.documentKey,
      document.locale,
    );
    const fallbackPublication =
      activePublications.find((publication) => publication.releaseMode !== "gray") ??
      null;

    if (!fallbackPublication) {
      throw unprocessableEntityError(
        "Gray rollout requires an already active fallback version.",
        {
          code: API_ERROR_CODES.LEGAL_DOCUMENT_GRAY_REQUIRES_FALLBACK,
        },
      );
    }
  }

  return {
    documentId: document.id,
    documentKey: document.documentKey,
    locale: document.locale,
    title: document.title,
    version: document.version,
    rolloutPercent: params.rolloutPercent,
  };
}

export async function publishLegalDocumentVersion(
  executor: DbExecutor,
  params: LegalDocumentPublishChangePayload & {
    adminId: number;
    changeRequestId?: number | null;
    activatedAt?: Date;
  },
) {
  const document = assertDocumentExists(
    await readDocumentRow(executor, params.documentId),
    params.documentId,
  );
  const activePublications = await readActivePublications(
    executor,
    document.documentKey,
    document.locale,
  );
  const activeDocumentRows = await readDocumentRowsByIds(
    executor,
    Array.from(new Set(activePublications.map((publication) => publication.documentId))),
  );
  const activeDocumentsById = new Map(
    activeDocumentRows.map((row) => [row.id, row] as const),
  );

  const latestActivePublication = activePublications[0] ?? null;
  const latestActiveDocument = latestActivePublication
    ? activeDocumentsById.get(latestActivePublication.documentId) ?? null
    : null;
  const fallbackPublication =
    activePublications.find((publication) => publication.releaseMode !== "gray") ??
    latestActivePublication ??
    null;

  if (
    params.rolloutPercent === 100 &&
    activePublications.some(
      (publication) =>
        publication.documentId === document.id && publication.releaseMode !== "gray",
    )
  ) {
    throw conflictError("This legal version is already the active full release.", {
      code: API_ERROR_CODES.LEGAL_DOCUMENT_ALREADY_ACTIVE,
    });
  }

  if (
    params.rolloutPercent < 100 &&
    activePublications.some(
      (publication) =>
        publication.documentId === document.id &&
        publication.releaseMode === "gray" &&
        publication.rolloutPercent === params.rolloutPercent,
    )
  ) {
    throw conflictError("This legal version is already active in gray rollout.", {
      code: API_ERROR_CODES.LEGAL_DOCUMENT_ALREADY_ACTIVE,
    });
  }

  if (params.rolloutPercent < 100 && !fallbackPublication) {
    throw unprocessableEntityError(
      "Gray rollout requires an already active fallback version.",
      {
        code: API_ERROR_CODES.LEGAL_DOCUMENT_GRAY_REQUIRES_FALLBACK,
      },
    );
  }

  const releaseMode: LegalReleaseMode =
    params.rolloutPercent < 100
      ? "gray"
      : latestActiveDocument && document.version < latestActiveDocument.version
        ? "rollback"
        : "stable";
  const now = params.activatedAt ?? new Date();

  const [created] = await executor
    .insert(legalDocumentPublications)
    .values({
      documentId: document.id,
      documentKey: document.documentKey,
      locale: document.locale,
      releaseMode,
      rolloutPercent: params.rolloutPercent,
      fallbackPublicationId:
        releaseMode === "gray" ? fallbackPublication?.id ?? null : null,
      rollbackFromPublicationId:
        releaseMode === "rollback" ? latestActivePublication?.id ?? null : null,
      changeRequestId: params.changeRequestId ?? null,
      publishedByAdminId: params.adminId,
      isActive: true,
      activatedAt: now,
    })
    .returning();

  if (!created) {
    throw persistenceError("Failed to publish legal document.");
  }

  const supersededIds =
    releaseMode === "gray"
      ? activePublications
          .filter((publication) => publication.id !== fallbackPublication?.id)
          .map((publication) => publication.id)
      : activePublications.map((publication) => publication.id);

  if (supersededIds.length > 0) {
    await executor
      .update(legalDocumentPublications)
      .set({
        isActive: false,
        supersededAt: now,
        supersededByPublicationId: created.id,
      })
      .where(inArray(legalDocumentPublications.id, supersededIds));
  }

  return toLegalPublicationRecord(created);
}

export async function listCurrentLegalDocuments(params: {
  executor?: DbExecutor;
  documentKey?: string | null;
  locale?: string | null;
  audienceId?: string | null;
  userId?: number | null;
}): Promise<LegalCurrentDocument[]> {
  const executor = params.executor ?? db;
  const locale = params.locale?.trim() || DEFAULT_LOCALE;
  const audienceKey = resolveAudienceKey({
    userId: params.userId ?? null,
    audienceId: params.audienceId ?? null,
  });

  const activePublications = await executor
    .select()
    .from(legalDocumentPublications)
    .where(
      and(
        eq(legalDocumentPublications.locale, locale),
        eq(legalDocumentPublications.isActive, true),
        ...(params.documentKey
          ? [eq(legalDocumentPublications.documentKey, params.documentKey.trim())]
          : []),
      ),
    )
    .orderBy(
      asc(legalDocumentPublications.documentKey),
      desc(legalDocumentPublications.activatedAt),
      desc(legalDocumentPublications.id),
    );

  if (activePublications.length === 0) {
    return [];
  }

  const publicationsByKey = new Map<string, LegalPublicationRow[]>();
  for (const publication of activePublications) {
    const existing = publicationsByKey.get(publication.documentKey) ?? [];
    existing.push(publication);
    publicationsByKey.set(publication.documentKey, existing);
  }

  const selectedPublications = Array.from(publicationsByKey.values())
    .map((publications) => resolvePublicationForAudience(publications, audienceKey))
    .filter((publication): publication is LegalPublicationRow => Boolean(publication));
  const documentRows = await readDocumentRowsByIds(
    executor,
    Array.from(new Set(selectedPublications.map((publication) => publication.documentId))),
  );
  const documentsById = new Map(documentRows.map((row) => [row.id, row] as const));

  const acceptanceRows =
    params.userId && selectedPublications.length > 0
      ? await executor
          .select()
          .from(legalDocumentAcceptances)
          .where(
            and(
              eq(legalDocumentAcceptances.userId, params.userId),
              inArray(
                legalDocumentAcceptances.documentId,
                selectedPublications.map((publication) => publication.documentId),
              ),
            ),
          )
      : [];
  const acceptanceByDocumentId = new Map(
    acceptanceRows.map((row) => [row.documentId, row] as const),
  );

  const currentDocuments: LegalCurrentDocument[] = [];
  for (const publication of selectedPublications) {
    const document = documentsById.get(publication.documentId);
    if (!document) {
      continue;
    }

    currentDocuments.push({
      ...toLegalDocumentRecord(document),
      publication: toLegalPublicationRecord(publication),
      acceptedAt: acceptanceByDocumentId.get(document.id)?.acceptedAt ?? null,
    });
  }

  return currentDocuments;
}

export async function acceptLegalDocument(params: {
  userId: number;
  documentId: number;
  ip?: string | null;
  userAgent?: string | null;
  source?: string | null;
}) {
  return db.transaction(async (tx) => {
    const document = assertDocumentExists(
      await readDocumentRow(tx, params.documentId),
      params.documentId,
    );
    const activePublications = await readActivePublications(
      tx,
      document.documentKey,
      document.locale,
    );
    const publication = resolvePublicationForAudience(activePublications, `user:${params.userId}`);

    if (!publication || publication.documentId !== document.id) {
      throw conflictError(
        "This legal version is not the current version for the user.",
        {
          code: API_ERROR_CODES.LEGAL_DOCUMENT_NOT_CURRENT_FOR_USER,
        },
      );
    }

    const [accepted] = await tx
      .insert(legalDocumentAcceptances)
      .values({
        documentId: document.id,
        publicationId: publication.id,
        userId: params.userId,
        source: params.source?.trim() || "user",
        ip: normalizeOptionalText(params.ip),
        userAgent: normalizeOptionalText(params.userAgent),
        acceptedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          legalDocumentAcceptances.userId,
          legalDocumentAcceptances.documentId,
        ],
        set: {
          publicationId: publication.id,
          source: params.source?.trim() || "user",
          ip: normalizeOptionalText(params.ip),
          userAgent: normalizeOptionalText(params.userAgent),
          acceptedAt: new Date(),
        },
      })
      .returning();

    if (!accepted) {
      throw persistenceError("Failed to record legal acceptance.");
    }

    return {
      id: accepted.id,
      documentId: accepted.documentId,
      publicationId: accepted.publicationId ?? null,
      userId: accepted.userId,
      source: accepted.source,
      ip: normalizeOptionalText(accepted.ip),
      userAgent: normalizeOptionalText(accepted.userAgent),
      acceptedAt: accepted.acceptedAt,
    };
  });
}

export async function getCurrentEffectiveLegalDocuments(
  executor: DbExecutor = db,
) {
  const documents = await listCurrentLegalDocuments({ executor });
  return documents.filter((document) => document.isRequired).map(toCurrentLegalDocument);
}

export async function getCurrentLegalDocumentsResponse(
  executor: DbExecutor = db,
) {
  const items = await getCurrentEffectiveLegalDocuments(executor);
  return { items };
}

export const assertCurrentLegalAcceptances = (params: {
  currentDocuments: CurrentLegalDocument[];
  providedAcceptances: LegalAcceptanceInput[];
}) => {
  const providedKeys = new Set(
    params.providedAcceptances.map(
      (acceptance) =>
        `${acceptance.slug.trim().toLowerCase()}::${acceptance.version.trim()}`,
    ),
  );

  const missingDocuments = params.currentDocuments.filter(
    (document) =>
      !providedKeys.has(
        `${document.slug.trim().toLowerCase()}::${document.version.trim()}`,
      ),
  );

  if (missingDocuments.length > 0) {
    throw conflictError("Current legal documents must be accepted.", {
      code: API_ERROR_CODES.LEGAL_ACCEPTANCE_REQUIRED,
    });
  }
};

export async function recordLegalAcceptancesInTransaction(
  executor: DbExecutor,
  params: {
    userId: number;
    documents: CurrentLegalDocument[];
    source?: string | null;
    ip?: string | null;
    userAgent?: string | null;
  },
) {
  if (params.documents.length === 0) {
    return [];
  }

  const documentRows = await executor
    .select()
    .from(legalDocuments)
    .where(
      inArray(
        legalDocuments.id,
        params.documents.map((document) => document.id),
      ),
    );
  const documentsById = new Map(documentRows.map((row) => [row.id, row] as const));

  const acceptedRows = [];
  const source = params.source?.trim() || "register";
  for (const currentDocument of params.documents) {
    const document = documentsById.get(currentDocument.id);
    if (!document) {
      continue;
    }

    const activePublications = await readActivePublications(
      executor,
      document.documentKey,
      document.locale,
    );
    const publication =
      activePublications.find(
        (candidate) => candidate.documentId === document.id,
      ) ?? null;

    const [accepted] = await executor
      .insert(legalDocumentAcceptances)
      .values({
        documentId: document.id,
        publicationId: publication?.id ?? null,
        userId: params.userId,
        source,
        ip: normalizeOptionalText(params.ip),
        userAgent: normalizeOptionalText(params.userAgent),
        acceptedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          legalDocumentAcceptances.userId,
          legalDocumentAcceptances.documentId,
        ],
        set: {
          publicationId: publication?.id ?? null,
          source,
          ip: normalizeOptionalText(params.ip),
          userAgent: normalizeOptionalText(params.userAgent),
          acceptedAt: new Date(),
        },
      })
      .returning();

    if (accepted) {
      acceptedRows.push(accepted);
    }
  }

  return acceptedRows;
}

export async function getCurrentLegalAcceptanceStateForUser(
  userId: number,
): Promise<CurrentLegalAcceptanceState> {
  const currentDocuments = (await listCurrentLegalDocuments({ userId })).filter(
    (document) => document.isRequired,
  );
  const items = currentDocuments.map((document) => ({
    id: document.id,
    slug: document.documentKey,
    version: String(document.version),
    effectiveAt: new Date(document.publication.activatedAt).toISOString(),
    accepted: document.acceptedAt !== null,
    acceptedAt: document.acceptedAt
      ? new Date(document.acceptedAt).toISOString()
      : null,
  }));

  return {
    requiresAcceptance: items.some((item) => !item.accepted),
    items,
  };
}

export async function acceptCurrentLegalDocuments(params: {
  userId: number;
  acceptances: LegalAcceptanceInput[];
  ip?: string | null;
  userAgent?: string | null;
}) {
  const currentDocuments = (await listCurrentLegalDocuments({
    userId: params.userId,
  }))
    .filter((document) => document.isRequired)
    .map(toCurrentLegalDocument);

  assertCurrentLegalAcceptances({
    currentDocuments,
    providedAcceptances: params.acceptances,
  });

  await db.transaction(async (tx) => {
    await recordLegalAcceptancesInTransaction(tx, {
      userId: params.userId,
      documents: currentDocuments,
      source: "user",
      ip: params.ip,
      userAgent: params.userAgent,
    });
  });

  return getCurrentLegalAcceptanceStateForUser(params.userId);
}

export async function getLegalDocumentById(
  documentId: number,
  executor: DbExecutor = db,
) {
  const document = assertDocumentExists(
    await readDocumentRow(executor, documentId),
    documentId,
  );

  return toLegalDocumentRecord(document);
}
