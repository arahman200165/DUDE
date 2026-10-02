import { describe, expect, it } from 'vitest';
import { pipelineStep } from './dom-tree-viewer.pipeline-step';

describe('dom-tree-viewer pipeline step', () => {
  it('builds a tree of elements from HTML', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '<div><span>hi</span></div>' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = (result.output as { value: { nodes: readonly { label: string; children?: readonly unknown[] }[] } }).value;
      expect(value.nodes).toHaveLength(1);
      expect(value.nodes[0].label).toBe('div');
      expect(value.nodes[0].children).toHaveLength(1);
    }
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '   ' });
    expect(result.ok).toBe(false);
  });

  it('includes an attribute summary for elements with attributes', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '<div id="app" class="x"></div>' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = (result.output as { value: { nodes: readonly { valueLabel: string }[] } }).value;
      expect(value.nodes[0].valueLabel).toBe(' id="app" class="x"');
    }
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'DOM Tree Viewer expects text input.', kind: 'invalid-input' } });
  });
});
