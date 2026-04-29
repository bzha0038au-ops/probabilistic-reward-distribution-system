import {
  SaasPublicStatusPageSchema,
  type SaasPublicStatusPage,
} from '@reward/shared-types/saas-status';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000';

const withTrailingSlash = (value: string) =>
  value.endsWith('/') ? value : `${value}/`;

export const buildBackendUrl = (path: string, baseUrl = API_BASE_URL) =>
  new URL(path.replace(/^\//, ''), withTrailingSlash(baseUrl)).toString();

export async function loadPublicSaasStatusPage(): Promise<{
  data: SaasPublicStatusPage | null;
  error: string | null;
}> {
  try {
    const response = await fetch(buildBackendUrl('/status/saas'), {
      headers: {
        accept: 'application/json',
      },
      next: {
        revalidate: 60,
      },
    });

    if (!response.ok) {
      throw new Error(`Backend returned HTTP ${response.status}.`);
    }

    const payload = (await response.json()) as
      | { ok?: boolean; data?: unknown }
      | null;

    if (!payload || payload.ok !== true) {
      throw new Error('Backend returned an invalid API envelope.');
    }

    const parsed = SaasPublicStatusPageSchema.safeParse(payload.data);
    if (!parsed.success) {
      throw new Error('Backend returned an invalid SaaS status payload.');
    }

    return {
      data: parsed.data,
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error
          ? error.message
          : 'Unable to load public SaaS status.',
    };
  }
}
