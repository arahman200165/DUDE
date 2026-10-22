import { decodeBase64, encodeBase64 } from '@dude/crypto/base64-codec';
import { defineTextTool, type ToolRunResult } from '../../kit';

const toResult = (result: ReturnType<typeof encodeBase64>): ToolRunResult =>
  result.ok ? { ok: true, output: result.value } : { ok: false, error: result.error };

/** Same engine and persisted `mode` key as the web tool; Swap moves the output into the input like the web Swap. */
export default defineTextTool({
  toolId: 'base64',
  // Main thread: 256 KiB encodes in about 66 ms (512 KiB reached 104 ms) on the Phase 31I API 29/36 emulator measurements.
  maxInputBytes: 256 * 1024,
  modeKey: 'mode',
  swap: true,
  modes: [
    { id: 'encode', label: 'Encode', run: input => toResult(encodeBase64(input)) },
    { id: 'decode', label: 'Decode', run: input => toResult(decodeBase64(input)) },
  ],
});
