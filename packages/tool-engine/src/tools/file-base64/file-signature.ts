/**
 * Hand-rolled magic-byte ("file signature") sniffing for a fixed set of
 * common formats. Deliberately not a library — this is a well-known small
 * lookup table, not the kind of fiddly logic the project reaches for a
 * dependency over (see `dude-conventions` memory / PRD §17).
 *
 * Known, disclosed limitations:
 * - ZIP-based formats (.docx/.xlsx/.pptx/.jar/.apk) share the exact same
 *   4-byte ZIP prefix and cannot be told apart by magic bytes alone without
 *   inspecting the archive's internal file listing (out of scope here).
 * - Plain text/JSON/CSV have no magic bytes at all; `sniffFileType` correctly
 *   returns `null` for these rather than guessing.
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
  {
    checks: [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
    signature: { mime: 'image/png', extension: 'png' },
  },
  {
    checks: [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
    signature: { mime: 'image/jpeg', extension: 'jpg' },
  },
  {
    checks: [{ offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] }], // 'GIF8' — covers both GIF87a and GIF89a
    signature: { mime: 'image/gif', extension: 'gif' },
  },
  {
    // RIFF????WEBP — the WEBP marker lives at byte 8, not byte 0; bytes 0-3
    // ('RIFF') alone are shared with WAV/AVI, so both checks are required.
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
  {
    checks: [{ offset: 0, bytes: [0x42, 0x4d] }],
    signature: { mime: 'image/bmp', extension: 'bmp' },
  },
  {
    checks: [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }], // '%PDF'
    signature: { mime: 'application/pdf', extension: 'pdf' },
  },
  {
    checks: [{ offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] }],
    signature: {
      mime: 'application/zip',
      extension: 'zip',
      note: 'ZIP-family — also matches .docx/.xlsx/.pptx/.jar and other ZIP-based formats',
    },
  },
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
