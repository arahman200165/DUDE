import { unzipSync, zipSync } from 'fflate';
import { ArchiveEntry } from "./archive-tool-types.js";

export function createZip(entries: readonly ArchiveEntry[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const entry of entries) files[entry.name] = entry.data;
  return zipSync(files);
}

export function extractZip(bytes: Uint8Array): readonly ArchiveEntry[] {
  const files = unzipSync(bytes);
  return Object.entries(files).map(([name, data]) => ({ name, data }));
}
