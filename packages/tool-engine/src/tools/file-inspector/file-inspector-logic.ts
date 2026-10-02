import { classifyEntropy, EntropyVerdict, shannonEntropy } from "../../shared/utils/byte-entropy.js";
import { extractAsciiStrings } from "../../shared/utils/binary-strings.js";
import { FileSignature, identifyZipContainer, sniffFileType } from "@dude/shared-types/shared/utils/file-signatures";

export interface FileInspectorReport {
  readonly fileName: string;
  readonly fileSize: number;
  readonly declaredMime: string | null;
  readonly detectedSignature: FileSignature | null;
  readonly containerFormat: string | null;
  readonly entropy: number;
  readonly entropyVerdict: EntropyVerdict;
  readonly sampleStrings: readonly string[];
}

const SAMPLE_STRING_COUNT = 10;
const MIN_SAMPLE_STRING_LENGTH = 4;

export function inspectFile(bytes: Uint8Array, fileName: string, declaredMime: string | null): FileInspectorReport {
  const detectedSignature = sniffFileType(bytes);
  const containerFormat = detectedSignature?.mime === 'application/zip' ? identifyZipContainer(bytes) : null;
  const entropy = shannonEntropy(bytes);

  return {
    fileName,
    fileSize: bytes.length,
    declaredMime,
    detectedSignature,
    containerFormat,
    entropy,
    entropyVerdict: classifyEntropy(entropy),
    sampleStrings: extractAsciiStrings(bytes, MIN_SAMPLE_STRING_LENGTH)
      .slice(0, SAMPLE_STRING_COUNT)
      .map((s) => s.text),
  };
}
