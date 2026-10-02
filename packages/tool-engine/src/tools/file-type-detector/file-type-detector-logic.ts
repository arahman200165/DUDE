import { bytesToHex } from "../../shared/utils/byte-codec.js";
import { FileSignature, identifyZipContainer, sniffFileType } from "@dude/shared-types/shared/utils/file-signatures";

export interface FileTypeReport {
  readonly fileName: string;
  readonly fileSize: number;
  readonly declaredMime: string | null;
  readonly detected: FileSignature | null;
  readonly matchedBytesHex: string;
  readonly containerFormat: string | null;
  readonly declaredExtension: string | null;
  readonly extensionMismatch: boolean;
}

const PREFIX_LENGTH = 16;

/** Extensions treated as equivalent to a signature's canonical extension when checking for a mismatch. */
const EXTENSION_ALIASES: Record<string, readonly string[]> = {
  jpg: ['jpg', 'jpeg', 'jpe'],
  tif: ['tif', 'tiff'],
  ico: ['ico'],
};

function declaredExtensionOf(fileName: string): string | null {
  const dot = fileName.lastIndexOf('.');
  if (dot < 0 || dot === fileName.length - 1) return null;
  return fileName.slice(dot + 1).toLowerCase();
}

function extensionsMatch(declared: string, canonical: string): boolean {
  if (declared === canonical) return true;
  const aliases = EXTENSION_ALIASES[canonical];
  return aliases ? aliases.includes(declared) : false;
}

export function detectFileType(bytes: Uint8Array, fileName: string, declaredMime: string | null): FileTypeReport {
  const detected = sniffFileType(bytes);
  const containerFormat = detected?.mime === 'application/zip' ? identifyZipContainer(bytes) : null;
  const declaredExtension = declaredExtensionOf(fileName);

  const canonicalExtension = containerFormat && containerFormat !== 'ooxml (unspecified)' ? containerFormat : detected?.extension || null;

  const extensionMismatch =
    detected !== null && declaredExtension !== null && canonicalExtension !== null && canonicalExtension !== '' && !extensionsMatch(declaredExtension, canonicalExtension);

  return {
    fileName,
    fileSize: bytes.length,
    declaredMime: declaredMime || null,
    detected,
    matchedBytesHex: bytesToHex(bytes.slice(0, PREFIX_LENGTH))
      .match(/.{1,2}/g)
      ?.join(' ') ?? '',
    containerFormat,
    declaredExtension,
    extensionMismatch,
  };
}
