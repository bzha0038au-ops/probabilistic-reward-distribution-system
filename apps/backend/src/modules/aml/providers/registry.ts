import type { AmlProviderKey } from '@reward/shared-types/aml';

import type { AmlProvider } from './contract';
import { mockAmlProvider } from './mock';

const AML_PROVIDER_REGISTRY = new Map<AmlProviderKey, AmlProvider>(
  [mockAmlProvider].map((provider) => [provider.key, provider])
);

export const listRegisteredAmlProviderKeys = () =>
  Array.from(AML_PROVIDER_REGISTRY.keys()).sort();

export const getRegisteredAmlProvider = (key: AmlProviderKey) =>
  AML_PROVIDER_REGISTRY.get(key) ?? null;
