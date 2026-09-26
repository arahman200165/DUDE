import type { FileAssociations } from '../src/app/core/platform/electron-bridge';

/** Treat the installer-written marker as advisory data, never as live default-app state. */
export function parseFileAssociations(value: unknown): FileAssociations | null {
  if (!value || typeof value !== 'object') return null;
  const { schemaVersion, candidateExtensions } = value as Record<string, unknown>;
  if (schemaVersion !== 1 || !Array.isArray(candidateExtensions) || candidateExtensions.length > 30) return null;
  if (candidateExtensions.some((extension) => typeof extension !== 'string' || !/^\.[a-z0-9]+$/.test(extension))) return null;
  if (new Set(candidateExtensions).size !== candidateExtensions.length) return null;
  return { candidateExtensions };
}
