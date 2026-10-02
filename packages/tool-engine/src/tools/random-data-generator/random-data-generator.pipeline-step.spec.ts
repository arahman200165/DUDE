import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./random-data-generator.pipeline-step.js";

describe('random-data-generator pipeline step', () => {
  it('generates a table of default fake data fields, ignoring the input value', async () => {
    const result = await pipelineStep.run({ type: 'json', value: { anything: true } });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.output.type).toBe('table');
    const table = result.output.value as { columns: readonly string[]; rows: readonly (readonly string[])[] };
    expect(table.columns).toEqual(['Full Name', 'Email', 'Phone Number', 'Street Address', 'City']);
    expect(table.rows).toHaveLength(10);
  });

  it('ignores non-json input value shape too, since generation never reads it', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'ignored' });
    expect(result.ok).toBe(true);
  });
});
