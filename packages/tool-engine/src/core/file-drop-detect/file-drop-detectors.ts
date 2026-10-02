/**
 * Curated magic-byte/format detector registry for Smart File Drop (`DUDE_PRD.md` §21 Phase 24
 * Item 4) — a hand-maintained array, mirroring `core/paste-detect/paste-detectors.ts`'s shape and
 * rationale exactly: only a deliberately curated subset of tools has a signature unambiguous
 * enough to detect from bytes alone. See `AGENTS.md` in this directory.
 */
import { FileDropDetector } from "@dude/domain/core/file-drop-detect/file-drop-detectors.model";

const IMAGE_MIME_PREFIX = 'image/';

export const FILE_DROP_DETECTORS: readonly FileDropDetector[] = [
  {
    toolId: 'sqlite-viewer',
    test: (ctx) => (ctx.sniffed?.mime === 'application/vnd.sqlite3' ? 0.95 : null),
  },
  {
    toolId: 'elf-header-viewer',
    test: (ctx) => (ctx.sniffed?.mime === 'application/x-elf' ? 0.95 : null),
  },
  {
    toolId: 'pe-header-viewer',
    test: (ctx) => (ctx.sniffed?.mime === 'application/x-msdownload' ? 0.9 : null),
  },
  {
    // Slightly lower confidence: file-signatures.ts documents this 4-byte prefix as ambiguous with
    // a Java class file's own magic bytes.
    toolId: 'macho-header-viewer',
    test: (ctx) => (ctx.sniffed?.mime === 'application/x-mach-binary' ? 0.85 : null),
  },
  {
    // Excluded when the ZIP container is actually a known Office/OpenDocument format -- those
    // aren't what a user dropping a file wants "Archive Creator / Extractor" for.
    toolId: 'archive-tool',
    test: (ctx) => {
      const archiveMimes = new Set([
        'application/zip',
        'application/gzip',
        'application/x-bzip2',
        'application/x-xz',
        'application/x-7z-compressed',
        'application/vnd.rar',
      ]);
      if (!ctx.sniffed || !archiveMimes.has(ctx.sniffed.mime)) return null;
      if (ctx.containerFormat && ctx.containerFormat !== 'ooxml (unspecified)') return null;
      return 0.85;
    },
  },
  {
    toolId: 'image-metadata-inspector',
    test: (ctx) => (ctx.sniffed?.mime.startsWith(IMAGE_MIME_PREFIX) ? 0.8 : null),
  },
  {
    // EXIF is a JPEG/TIFF convention, not every image format.
    toolId: 'exif-viewer',
    test: (ctx) => (ctx.sniffed?.mime === 'image/jpeg' || ctx.sniffed?.mime === 'image/tiff' ? 0.75 : null),
  },
  {
    toolId: 'qr-code-scanner',
    test: (ctx) => (ctx.sniffed?.mime.startsWith(IMAGE_MIME_PREFIX) ? 0.4 : null),
  },
  {
    toolId: 'barcode-reader',
    test: (ctx) => (ctx.sniffed?.mime.startsWith(IMAGE_MIME_PREFIX) ? 0.4 : null),
  },
  {
    // Generic "what is this file" fallback -- any recognized signature, lower priority than a
    // format-specific viewer for the same file.
    toolId: 'file-type-detector',
    test: (ctx) => (ctx.sniffed ? 0.5 : null),
  },
  {
    // Universal fallbacks: every file, recognized or not, can be hashed or Base64-encoded.
    toolId: 'file-hash',
    test: () => 0.3,
  },
  {
    toolId: 'file-base64',
    test: () => 0.3,
  },
];
