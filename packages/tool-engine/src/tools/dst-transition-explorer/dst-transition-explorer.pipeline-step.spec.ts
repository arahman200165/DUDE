import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./dst-transition-explorer.pipeline-step.js";

describe('dst-transition-explorer pipeline step', () => {
  it('lists DST transitions for a known timezone as a table', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'America/New_York' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.output.type).toBe('table');
    const table = result.output.value as { columns: readonly string[]; rows: readonly (readonly unknown[])[] };
    expect(table.columns).toContain('Direction');
    expect(table.rows.length).toBeGreaterThan(0);
  });

  it('fails on an unknown timezone', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'Not/AZone' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result.ok).toBe(false);
  });
});
