import { describe, expect, it } from 'vitest';
import { loadPipelineStep } from './pipeline-step-loader';

describe('loadPipelineStep', () => {
  it('resolves a pipeline-eligible tool by convention', async () => {
    const step = await loadPipelineStep('base64');
    expect(step).toBeDefined();
    expect(step?.accepts).toEqual(['text']);
    expect(step?.produces).toEqual(['text']);
  });

  it('resolves a different pipeline-eligible tool', async () => {
    const step = await loadPipelineStep('jwt');
    expect(step).toBeDefined();
    expect(step?.produces).toEqual(['json']);
  });

  it('returns undefined for a tool with no pipeline-step file', async () => {
    const step = await loadPipelineStep('this-tool-does-not-exist');
    expect(step).toBeUndefined();
  });
});
