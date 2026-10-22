import { computeHashes, type HashAlgorithm } from '@dude/crypto/hash-compute';
import { defineTextTool, utf8ByteLength, type ToolRunResult } from '../../kit';
import { defineOffThreadTask, isAbortError, runOffThread } from '../../kit/off-thread';
import { buildHashRows, COMPUTED_ALGORITHMS, INPUT_TOO_LARGE, MAX_INPUT_BYTES, type HashOutputFormat } from './hash-mobile';

/** Runs on the worker runtime: SHA-1/2 through the engine host's digest, MD5/SHA-3/BLAKE/CRC in pure JS. */
const hashTask = defineOffThreadTask((payload: { text: string; algorithms: readonly string[] }) => {
  'worklet';
  return computeHashes(payload.text, payload.algorithms as HashAlgorithm[]);
});

let cache: { text: string; digests: Map<string, string> } | null = null;

// The kit's controller aborts `signal` when a newer request supersedes this run: it is never dispatched if still queued, and its
// result is dropped if running.
async function run(input: string, options: { outputFormat?: unknown }, signal?: AbortSignal): Promise<ToolRunResult> {
  if (utf8ByteLength(input) > MAX_INPUT_BYTES) return { ok: false, error: INPUT_TOO_LARGE };
  const format: HashOutputFormat = options.outputFormat === 'base64' ? 'base64' : 'hex';
  if (cache?.text === input) return { ok: true, output: buildHashRows(cache.digests, format) };
  try {
    const outputs = await runOffThread(hashTask, { text: input, algorithms: COMPUTED_ALGORITHMS }, { signal });
    const digests = new Map(outputs.map(output => [output.algorithm as string, output.hex]));
    cache = { text: input, digests };
    return { ok: true, output: buildHashRows(digests, format) };
  } catch (error) {
    return { ok: false, error: isAbortError(error) ? 'Cancelled.' : error instanceof Error && error.message ? error.message : 'Could not compute the hashes.' };
  }
}

/**
 * Same engine as the web tool (`computeHashes`), executed on the off-thread worker runtime. Mobile computes every algorithm the
 * host supports instead of the web's per-algorithm checkboxes (the web `algorithms` key is not used); the `outputFormat` preference
 * (hex or base64) is mobile-only. XXH32/XXH64 need WebAssembly and are shown as unavailable.
 */
export default defineTextTool({
  toolId: 'hash',
  outputKind: 'kv',
  inputLabel: 'Text',
  sampleInput: 'abc',
  run: (input, options) => run(input, options),
  offThread: (input, options, _mode, signal) => run(input, options, signal),
  options: [
    { kind: 'select', id: 'outputFormat', label: 'Digest format', default: 'hex', choices: [{ value: 'hex', label: 'Hex' }, { value: 'base64', label: 'Base64' }] },
  ],
});
