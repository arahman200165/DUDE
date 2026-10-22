import { computeHashes, type HashAlgorithm } from '@dude/crypto/hash-compute';
import { defineOffThreadTask } from '../../kit/off-thread';

/** Runs on the worker runtime: SHA-1/2 through the engine host's digest, MD5/SHA-3/BLAKE/CRC in pure JS. */
export const hashTask = defineOffThreadTask((payload: { text: string; algorithms: readonly string[] }) => {
  'worklet';
  return computeHashes(payload.text, payload.algorithms as HashAlgorithm[]);
});
