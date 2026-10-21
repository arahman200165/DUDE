import { flattenJson, type FlattenDirection } from '@dude/tool-engine/tools/json-flatten/json-flatten-transform';
import { defineTextTool, type TextToolMode, type ToolRunResult } from '../../kit';

/**
 * Same engine and same persisted key (`direction`) as web. Inputs are small enough to run on the main thread (web only
 * moves a Worker in above 50,000 characters). The web tool has no delimiter option (the engine always uses dot/bracket
 * paths), so none is offered here. Swap moves the output into the input; the direction is changed with the segment (the
 * kit's swap does not flip modes).
 */
const run = (direction: FlattenDirection) => (input: string): ToolRunResult => {
  const result = flattenJson(input, direction);
  return result.ok ? { ok: true, output: result.output } : { ok: false, error: result.error.message };
};

const modes: readonly TextToolMode[] = [
  { id: 'flatten', label: 'Flatten', run: run('flatten') },
  { id: 'unflatten', label: 'Unflatten', run: run('unflatten') },
];

export default defineTextTool({
  toolId: 'json-flatten',
  modeKey: 'direction',
  modes,
  swap: true,
  inputLabel: 'JSON',
  outputLabel: 'Result',
  sampleInput: '{"a":{"b":1,"c":[2,3]}}',
});
