import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./json-ld-tester.pipeline-step.js";

const VALID_ARTICLE = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Hello',
  author: 'Me',
  datePublished: '2024-01-01',
};

describe('json-ld-tester pipeline step', () => {
  it('validates a well-formed JSON-LD block from text', async () => {
    const result = await pipelineStep.run({ type: 'text', value: JSON.stringify(VALID_ARTICLE) });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = (result.output as { value: { findings: readonly { severity: string }[] } }).value;
      expect(value.findings.some((f) => f.severity === 'error')).toBe(false);
    }
  });

  it('accepts an already-parsed json value', async () => {
    const result = await pipelineStep.run({ type: 'json', value: VALID_ARTICLE });
    expect(result.ok).toBe(true);
  });

  it('flags a missing required property', async () => {
    const result = await pipelineStep.run({ type: 'text', value: JSON.stringify({ '@context': 'https://schema.org', '@type': 'Article' }) });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const value = (result.output as { value: { findings: readonly { severity: string }[] } }).value;
      expect(value.findings.some((f) => f.severity === 'error')).toBe(true);
    }
  });

  it('fails on malformed json text', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '{not json' });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'table', value: { columns: [], rows: [] } });
    expect(result.ok).toBe(false);
  });
});
