import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./timezone-offset-comparator.pipeline-step.js";

describe('timezone-offset-comparator pipeline step', () => {
  it('builds a monthly offset grid for a comma-separated zone list', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'America/New_York, Europe/London' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.output.type).toBe('table');
    const table = result.output.value as { columns: readonly string[]; rows: readonly (readonly unknown[])[] };
    expect(table.columns).toEqual(['Zone', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0][0]).toBe('America/New_York');
  });

  it('fails on an unknown timezone', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'Not/AZone' });
    expect(result.ok).toBe(false);
  });

  it('fails on an empty zone list', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '   ' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result.ok).toBe(false);
  });
});
