import { processJson, type JsonIndent, type JsonMode } from '@dude/tool-engine/tools/json/json-format';
import { defineOffThreadTask } from '../../kit/off-thread';

/** Runs on the worker runtime. Validate returns no output text, so the input does not cross the boundary twice. */
export const formatTask = defineOffThreadTask((payload: { input: string; mode: JsonMode; indent: JsonIndent }) => {
  'worklet';
  const result = processJson(payload.input, payload.mode, payload.indent);
  return result.ok && payload.mode === 'validate' ? { ok: true as const, output: '' } : result;
});
