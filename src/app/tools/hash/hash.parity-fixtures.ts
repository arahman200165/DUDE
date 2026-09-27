import type { PipelineValue } from '../../shared/models/pipeline-step.model';
export const fixtures: readonly { input: PipelineValue; expected: PipelineValue }[] = [
  { input: { type: 'text', value: 'hello' }, expected: { type: 'text', value: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824' } },
];
