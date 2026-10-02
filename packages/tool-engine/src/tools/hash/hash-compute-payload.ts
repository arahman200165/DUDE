import { HashAlgorithm } from "@dude/crypto/hash-compute";

export interface HashComputePayload {
  readonly text: string;
  readonly algorithms: readonly HashAlgorithm[];
}
