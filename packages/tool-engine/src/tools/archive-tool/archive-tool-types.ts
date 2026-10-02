export interface ArchiveEntry {
  readonly name: string;
  readonly data: Uint8Array;
}

export type ArchiveFormat = 'zip' | 'tar' | 'tar.gz';

export const ARCHIVE_FORMATS: Record<ArchiveFormat, string> = {
  zip: 'ZIP',
  tar: 'TAR',
  'tar.gz': 'TAR.GZ',
};

/** Infers the extract format from a chosen archive's file name; `null` keeps the current choice. */
export function archiveFormatFromName(name: string): ArchiveFormat | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'tar.gz';
  if (lower.endsWith('.tar')) return 'tar';
  if (lower.endsWith('.zip')) return 'zip';
  return null;
}
