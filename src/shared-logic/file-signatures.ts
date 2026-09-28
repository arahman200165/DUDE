/**
 * Hand-rolled magic-byte ("file signature") sniffing across a broad set of
 * common formats -- images, documents, archives, and executables. Deliberately
 * not a library -- a magic-byte lookup table is a well-known, bounded amount
 * of data, not the kind of fiddly logic the project reaches for a dependency
 * over (PRD §17).
 *
 * Known, disclosed limitations:
 * - ZIP-based formats (.docx/.xlsx/.pptx/.jar/.apk) share the exact same
 *   4-byte ZIP prefix and cannot be told apart by magic bytes alone --
 *   `identifyZipContainer` below disambiguates by scanning for internal
 *   filename markers instead.
 * - The 4-byte prefix 0xCAFEBABE is shared by Java class files and Mach-O fat
 *   binaries; both entries carry a `note` explaining the ambiguity rather than
 *   guessing.
 * - Plain text/JSON/CSV/tar (no reliable signature within the first bytes)
 *   have no entry here; `sniffFileType` correctly returns `null` for these.
 */

export interface FileSignature {
  readonly mime: string;
  readonly extension: string;
  readonly note?: string;
}

interface SignatureCheck {
  readonly offset: number;
  readonly bytes: readonly number[];
}

interface SignatureRule {
  readonly checks: readonly SignatureCheck[];
  readonly signature: FileSignature;
}

const SIGNATURE_RULES: readonly SignatureRule[] = [
  // --- Images ---
  { checks: [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }], signature: { mime: 'image/png', extension: 'png' } },
  { checks: [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }], signature: { mime: 'image/jpeg', extension: 'jpg' } },
  { checks: [{ offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] }], signature: { mime: 'image/gif', extension: 'gif' } }, // 'GIF8' -- covers GIF87a/89a
  {
    checks: [
      { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
      { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
    ],
    signature: { mime: 'image/webp', extension: 'webp' },
  },
  {
    checks: [
      { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
      { offset: 8, bytes: [0x57, 0x41, 0x56, 0x45] },
    ],
    signature: { mime: 'audio/wav', extension: 'wav' },
  },
  { checks: [{ offset: 0, bytes: [0x42, 0x4d] }], signature: { mime: 'image/bmp', extension: 'bmp' } },
  { checks: [{ offset: 0, bytes: [0x00, 0x00, 0x01, 0x00] }], signature: { mime: 'image/x-icon', extension: 'ico' } },
  { checks: [{ offset: 0, bytes: [0x49, 0x49, 0x2a, 0x00] }], signature: { mime: 'image/tiff', extension: 'tif' } }, // little-endian TIFF
  { checks: [{ offset: 0, bytes: [0x4d, 0x4d, 0x00, 0x2a] }], signature: { mime: 'image/tiff', extension: 'tif' } }, // big-endian TIFF

  // --- Audio ---
  { checks: [{ offset: 0, bytes: [0x66, 0x4c, 0x61, 0x43] }], signature: { mime: 'audio/flac', extension: 'flac' } }, // 'fLaC'
  { checks: [{ offset: 0, bytes: [0x4f, 0x67, 0x67, 0x53] }], signature: { mime: 'audio/ogg', extension: 'ogg' } }, // 'OggS'
  { checks: [{ offset: 0, bytes: [0x49, 0x44, 0x33] }], signature: { mime: 'audio/mpeg', extension: 'mp3' } }, // 'ID3' tag

  // --- Documents ---
  { checks: [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }], signature: { mime: 'application/pdf', extension: 'pdf' } }, // '%PDF'

  // --- Archives ---
  {
    checks: [{ offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] }],
    signature: { mime: 'application/zip', extension: 'zip', note: 'ZIP-family -- also matches .docx/.xlsx/.pptx/.jar/.apk and other ZIP-based formats' },
  },
  { checks: [{ offset: 0, bytes: [0x1f, 0x8b] }], signature: { mime: 'application/gzip', extension: 'gz' } },
  { checks: [{ offset: 0, bytes: [0x42, 0x5a, 0x68] }], signature: { mime: 'application/x-bzip2', extension: 'bz2' } }, // 'BZh'
  { checks: [{ offset: 0, bytes: [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00] }], signature: { mime: 'application/x-xz', extension: 'xz' } },
  { checks: [{ offset: 0, bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c] }], signature: { mime: 'application/x-7z-compressed', extension: '7z' } },
  { checks: [{ offset: 0, bytes: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00] }], signature: { mime: 'application/vnd.rar', extension: 'rar' } }, // RAR 1.5-4.0
  { checks: [{ offset: 0, bytes: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00] }], signature: { mime: 'application/vnd.rar', extension: 'rar' } }, // RAR 5.0+

  // --- Databases / bytecode / misc containers ---
  { checks: [{ offset: 0, bytes: [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66] }], signature: { mime: 'application/vnd.sqlite3', extension: 'sqlite' } }, // 'SQLite f'
  {
    checks: [{ offset: 0, bytes: [0xca, 0xfe, 0xba, 0xbe] }],
    signature: {
      mime: 'application/java-vm',
      extension: 'class',
      note: 'Shares its 4-byte prefix with Mach-O fat binaries -- bytes 4-7 disambiguate (a Java major version is a small positive number just like a fat-binary architecture count, so this is inherently ambiguous from the first 8 bytes alone)',
    },
  },
  { checks: [{ offset: 0, bytes: [0x00, 0x61, 0x73, 0x6d] }], signature: { mime: 'application/wasm', extension: 'wasm' } }, // '\0asm'

  // --- Executables / object files ---
  { checks: [{ offset: 0, bytes: [0x4d, 0x5a] }], signature: { mime: 'application/x-msdownload', extension: 'exe' } }, // 'MZ' -- DOS/PE header
  { checks: [{ offset: 0, bytes: [0x7f, 0x45, 0x4c, 0x46] }], signature: { mime: 'application/x-elf', extension: 'elf' } }, // ELF
  { checks: [{ offset: 0, bytes: [0xfe, 0xed, 0xfa, 0xce] }], signature: { mime: 'application/x-mach-binary', extension: '', note: '32-bit Mach-O, big-endian magic' } },
  { checks: [{ offset: 0, bytes: [0xce, 0xfa, 0xed, 0xfe] }], signature: { mime: 'application/x-mach-binary', extension: '', note: '32-bit Mach-O, little-endian magic' } },
  { checks: [{ offset: 0, bytes: [0xfe, 0xed, 0xfa, 0xcf] }], signature: { mime: 'application/x-mach-binary', extension: '', note: '64-bit Mach-O, big-endian magic' } },
  { checks: [{ offset: 0, bytes: [0xcf, 0xfa, 0xed, 0xfe] }], signature: { mime: 'application/x-mach-binary', extension: '', note: '64-bit Mach-O, little-endian magic' } },
];

function matchesCheck(bytes: Uint8Array, check: SignatureCheck): boolean {
  if (bytes.length < check.offset + check.bytes.length) return false;
  for (let i = 0; i < check.bytes.length; i++) {
    if (bytes[check.offset + i] !== check.bytes[i]) return false;
  }
  return true;
}

export function sniffFileType(bytes: Uint8Array): FileSignature | null {
  for (const rule of SIGNATURE_RULES) {
    if (rule.checks.every((check) => matchesCheck(bytes, check))) return rule.signature;
  }
  return null;
}

/**
 * Best-effort disambiguation for ZIP-family containers: local file header
 * filenames are stored as plain, uncompressed bytes immediately after each
 * header, so a handful of well-known internal paths can be found with a raw
 * substring scan -- no need for a full ZIP central-directory parser.
 */
const ZIP_CONTAINER_MARKERS: readonly { readonly marker: string; readonly format: string }[] = [
  { marker: 'word/document.xml', format: 'docx' },
  { marker: 'xl/workbook.xml', format: 'xlsx' },
  { marker: 'ppt/presentation.xml', format: 'pptx' },
  { marker: 'AndroidManifest.xml', format: 'apk' },
  { marker: 'META-INF/MANIFEST.MF', format: 'jar' },
  { marker: 'mimetypeapplication/vnd.oasis.opendocument.text', format: 'odt' },
  { marker: 'mimetypeapplication/vnd.oasis.opendocument.spreadsheet', format: 'ods' },
  { marker: 'mimetypeapplication/vnd.oasis.opendocument.presentation', format: 'odp' },
  { marker: '[Content_Types].xml', format: 'ooxml (unspecified)' },
];

export function identifyZipContainer(bytes: Uint8Array): string | null {
  let text = '';
  for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);

  for (const { marker, format } of ZIP_CONTAINER_MARKERS) {
    if (text.includes(marker)) return format;
  }
  return null;
}
