/**
 * Magic-byte sniffing moved to `packages/shared-types/src/shared/file-signatures.ts` in Phase 29 (Milestone 529),
 * when Tree Search's native type filter in the fs worker became a second consumer.
 */
export { identifyZipContainer, sniffFileType, type FileSignature } from "../file-signatures.js";
