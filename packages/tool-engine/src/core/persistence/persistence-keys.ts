export const NAMESPACE_PREFIX = 'dude:v1';

export function buildToolPrefix(toolId: string): string {
  return `${NAMESPACE_PREFIX}:${toolId}:`;
}

export function buildStorageKey(toolId: string, key: string): string {
  return `${buildToolPrefix(toolId)}${key}`;
}

export function buildConsentPrefix(toolId: string): string {
  return `${NAMESPACE_PREFIX}:__consent__:${toolId}:`;
}

export function buildConsentKey(toolId: string, key: string): string {
  return `${buildConsentPrefix(toolId)}${key}`;
}
