import { PipelineStep } from '../../shared/models/pipeline-step.model';
import { runQuickRun, textEligibleQuickRunToolIds } from './quick-run';

function fakeStep(accepts: readonly ('text' | 'json')[], output = 'ok'): PipelineStep {
  return {
    accepts,
    produces: ['text'],
    run: async () => ({ ok: true, output: { type: 'text', value: output } }),
  };
}

function fakeRegistry(steps: Record<string, PipelineStep | undefined>) {
  return {
    eligibleToolIds: () => Object.entries(steps).filter(([, step]) => step !== undefined).map(([id]) => id),
    get: (id: string) => steps[id],
  } as unknown as import('./pipeline-step-registry.service').PipelineStepRegistryService;
}

describe('textEligibleQuickRunToolIds', () => {
  it('keeps only steps that accept a text input', () => {
    const registry = fakeRegistry({
      'text-tool': fakeStep(['text']),
      'json-only-tool': fakeStep(['json']),
    });

    expect(textEligibleQuickRunToolIds(registry)).toEqual(['text-tool']);
  });
});

describe('runQuickRun', () => {
  it('runs a resolved step with a text-typed payload', async () => {
    const step = fakeStep(['text'], 'transformed');

    const result = await runQuickRun(step, 'input value');

    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'transformed' } });
  });

  it('returns undefined when no step was resolved', async () => {
    expect(await runQuickRun(undefined, 'input')).toBeUndefined();
  });
});
