import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./epoch-timeline-visualizer.pipeline-step.js";

describe('epoch-timeline-visualizer pipeline step', () => {
  it('parses labeled timestamp lines into markers', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '1700000000 | Launch\n1701820800 | GA' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.output.type).toBe('json');
    const value = result.output.value as { markers: readonly { label: string }[] };
    expect(value.markers.map((m) => m.label)).toEqual(['Launch', 'GA']);
  });

  it('fails on an unparseable timestamp line', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not-a-timestamp' });
    expect(result.ok).toBe(false);
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '   ' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({
      ok: false,
      error: { message: 'Epoch Timeline Visualizer expects text input.', kind: 'invalid-input' },
    });
  });
});
