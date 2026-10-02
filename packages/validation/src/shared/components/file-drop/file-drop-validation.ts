import type { ReadableFilePort } from "@dude/contracts/file-ports";
type File = Pick<ReadableFilePort, 'name' | 'type' | 'size'>;
/**
 * Pure validation helpers for `FileDrop`, kept framework-free so they're
 * trivially testable without a DOM/TestBed.
 */

export function matchesAccept(file: File, accept: string | undefined): boolean {
  const patterns = (accept ?? '')
    .split(',')
    .map((pattern) => pattern.trim().toLowerCase())
    .filter(Boolean);
  if (patterns.length === 0) return true;

  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();

  return patterns.some((pattern) => {
    if (pattern.startsWith('.')) return name.endsWith(pattern);
    if (pattern.endsWith('/*')) return type.startsWith(pattern.slice(0, -1));
    return type === pattern;
  });
}

export function exceedsMaxSize(file: File, maxSizeBytes: number | undefined): boolean {
  return maxSizeBytes !== undefined && file.size > maxSizeBytes;
}
