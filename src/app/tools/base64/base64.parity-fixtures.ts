import type { PipelineValue } from '../../shared/models/pipeline-step.model';
export const fixtures: readonly { input: PipelineValue; expected: PipelineValue }[] = [
  { input: { type: 'text', value: 'SGVsbG8sIERVREUh' }, expected: { type: 'text', value: 'Hello, DUDE!' } },
];
