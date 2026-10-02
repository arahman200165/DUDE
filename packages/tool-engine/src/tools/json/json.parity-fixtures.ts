import type { PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
export const fixtures: readonly { input: PipelineValue; expected: PipelineValue }[] = [
  { input: { type: 'text', value: '{"a":1,"b":[true,null]}' }, expected: { type: 'json', value: { a: 1, b: [true, null] } } },
];
