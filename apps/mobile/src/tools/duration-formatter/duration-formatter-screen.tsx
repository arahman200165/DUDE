import { defineTextTool } from '../../kit';
import { durationRows } from './duration-formatter-mobile';

// The manifest declares no persisted preferences (`preferences: 'none'`), so there are no options; the input is in memory only.
export default defineTextTool({
  toolId: 'duration-formatter',
  run: input => durationRows(input),
  sampleInput: '1d 2h 30m',
  outputKind: 'kv',
  inputLabel: 'Duration (1d 2h 30m, 90s, or PT1H30M)',
  outputLabel: 'Representations',
});
