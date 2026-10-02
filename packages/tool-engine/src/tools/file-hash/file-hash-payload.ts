import { HashAlgorithm } from "@dude/crypto/hash-compute";

export interface FileHashPayload {
  readonly buffer: ArrayBuffer;
  readonly algorithms: readonly HashAlgorithm[];
}
