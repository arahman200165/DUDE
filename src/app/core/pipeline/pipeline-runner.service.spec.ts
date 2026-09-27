import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PipelineStep, PipelineStepResult, PipelineValue } from '../../shared/models/pipeline-step.model';
import { Pipeline, createPipeline, createToolStep } from './pipeline.model';
import { MAX_PIPELINE_VALUE_CHARS, PipelineRunnerService, pipelineValueSize } from './pipeline-runner.service';

function stepThatReturns(accepts: PipelineStep['accepts'], output: PipelineValue): PipelineStep {
  return { accepts, produces: [output.type], async run(): Promise<PipelineStepResult> {
    return { ok: true, output };
  } };
}

function failingStep(accepts: PipelineStep['accepts'], produces: PipelineStep['produces']): PipelineStep {
  return { accepts, produces, async run(): Promise<PipelineStepResult> {
    return { ok: false, error: { message: 'boom', kind: 'execution-error' } };
  } };
}

async function waitForTerminal(run: { status: () => string }): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (['succeeded', 'failed', 'blocked', 'cancelled'].includes(run.status())) return;
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('PipelineRunnerService', () => {
  let service: PipelineRunnerService;
  let pipeline: Pipeline;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PipelineRunnerService);
    pipeline = createPipeline('Test');
  });

  it('runs a compatible chain to completion', async () => {
    const stepA = createToolStep('a');
    const stepB = createToolStep('b');
    pipeline = { ...pipeline, steps: [stepA, stepB] };

    const steps: Record<string, PipelineStep> = {
      a: stepThatReturns(['text'], { type: 'json', value: { hi: true } }),
      b: stepThatReturns(['json'], { type: 'text', value: 'done' }),
    };

    const run = service.runPipeline(pipeline, { type: 'text', value: 'input' }, async (ref) =>
      ref.kind === 'tool' ? steps[ref.toolId] : undefined,
    );

    await waitForTerminal(run);

    expect(run.status()).toBe('succeeded');
    expect(run.finalOutput()).toBe('done');
    expect(run.stepResults().every((result) => result.status === 'done')).toBe(true);
  });

  it('blocks (without executing) when the static chain is incompatible', async () => {
    const stepA = createToolStep('a');
    const stepB = createToolStep('b');
    pipeline = { ...pipeline, steps: [stepA, stepB] };

    const steps: Record<string, PipelineStep> = {
      a: stepThatReturns(['text'], { type: 'text', value: 'x' }),
      b: { accepts: ['table'], produces: ['table'], async run() { throw new Error('should never run'); } },
    };

    const run = service.runPipeline(pipeline, { type: 'text', value: 'input' }, async (ref) =>
      ref.kind === 'tool' ? steps[ref.toolId] : undefined,
    );

    await waitForTerminal(run);

    expect(run.status()).toBe('blocked');
  });

  it('halts the chain and skips remaining steps on a step failure', async () => {
    const stepA = createToolStep('a');
    const stepB = createToolStep('b');
    pipeline = { ...pipeline, steps: [stepA, stepB] };

    const steps: Record<string, PipelineStep> = {
      a: failingStep(['text'], ['text']),
      b: stepThatReturns(['text'], { type: 'text', value: 'unreachable' }),
    };

    const run = service.runPipeline(pipeline, { type: 'text', value: 'input' }, async (ref) =>
      ref.kind === 'tool' ? steps[ref.toolId] : undefined,
    );

    await waitForTerminal(run);

    expect(run.status()).toBe('failed');
    expect(run.stepResults()[0].status).toBe('error');
    expect(run.stepResults()[1].status).toBe('skipped');
  });

  it('cancel() stops the run', async () => {
    const stepA = createToolStep('a');
    pipeline = { ...pipeline, steps: [stepA] };

    const run = service.runPipeline(pipeline, { type: 'text', value: 'input' }, async () =>
      stepThatReturns(['text'], { type: 'text', value: 'x' }),
    );
    run.cancel();

    await waitForTerminal(run);
    expect(run.status()).toBe('cancelled');
  });
});

describe('PipelineRunnerService: browser-safe execution (Phase 26 Item 13)', () => {
  let service: PipelineRunnerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PipelineRunnerService);
  });

  it('passes an abort signal and a worker offload to every step', async () => {
    let seen: { signal?: AbortSignal; offload?: unknown } | undefined;
    const step: PipelineStep = {
      accepts: ['text'],
      produces: ['text'],
      async run(input, context) {
        seen = context;
        return { ok: true, output: input };
      },
    };
    const pipeline = { ...createPipeline('P'), steps: [createToolStep('a')] };
    const run = service.runPipeline(pipeline, { type: 'text', value: 'x' }, async () => step);
    await waitForTerminal(run);

    expect(seen?.signal).toBeInstanceOf(AbortSignal);
    expect(typeof seen?.offload).toBe('function');
  });

  it('cancel() aborts a step mid-run instead of waiting for it to finish', async () => {
    let signal: AbortSignal | undefined;
    const hanging: PipelineStep = {
      accepts: ['text'],
      produces: ['text'],
      run: (_input, context) => {
        signal = context?.signal;
        return new Promise(() => undefined);
      },
    };
    const pipeline = { ...createPipeline('P'), steps: [createToolStep('a'), createToolStep('b')] };
    const run = service.runPipeline(pipeline, { type: 'text', value: 'x' }, async () => hanging);
    for (let i = 0; i < 10 && run.status() !== 'running'; i++) await new Promise((resolve) => setTimeout(resolve, 0));
    expect(run.status()).toBe('running');

    run.cancel();
    await waitForTerminal(run);

    expect(run.status()).toBe('cancelled');
    expect(signal?.aborted).toBe(true);
    expect(run.stepResults().map((result) => result.status)).toEqual(['skipped', 'pending']);
  });

  it('turns a throwing step into a failed step rather than an unhandled rejection', async () => {
    const throwing: PipelineStep = { accepts: ['text'], produces: ['text'], run: () => Promise.reject(new Error('worker crashed')) };
    const pipeline = { ...createPipeline('P'), steps: [createToolStep('a')] };
    const run = service.runPipeline(pipeline, { type: 'text', value: 'x' }, async () => throwing);
    await waitForTerminal(run);

    expect(run.status()).toBe('failed');
    expect(run.stepResults()[0].error).toBe('worker crashed');
  });

  it('fails clearly when a step output exceeds the intermediate size cap', async () => {
    const huge = stepThatReturns(['text'], { type: 'text', value: 'x'.repeat(MAX_PIPELINE_VALUE_CHARS + 1) });
    const pipeline = { ...createPipeline('P'), steps: [createToolStep('a'), createToolStep('b')] };
    const run = service.runPipeline(pipeline, { type: 'text', value: 'x' }, async () => huge);
    await waitForTerminal(run);

    expect(run.status()).toBe('failed');
    expect(run.stepResults()[0].error).toMatch(/too large for a pipeline/);
    expect(run.stepResults()[1].status).toBe('skipped');
  });

  it('blocks up front, without running anything, when the gate reports a reason', async () => {
    const step = { ...stepThatReturns(['text'], { type: 'text', value: 'y' }), run: vi.fn() };
    const pipeline = { ...createPipeline('P'), steps: [createToolStep('a')] };
    const run = service.runPipeline(pipeline, { type: 'text', value: 'x' }, async () => step, () => 'Offline: runtime not cached');
    await waitForTerminal(run);

    expect(run.status()).toBe('blocked');
    expect(run.stepResults()[0].error).toBe('Offline: runtime not cached');
    expect(step.run).not.toHaveBeenCalled();
  });

  it('measures intermediate values by their serialized size', () => {
    expect(pipelineValueSize({ type: 'text', value: 'abc' })).toBe(3);
    expect(pipelineValueSize({ type: 'file', value: { name: 'a', mimeType: 'x', base64: 'AAAA' } })).toBe(4);
    expect(pipelineValueSize({ type: 'json', value: { a: 1 } })).toBe(7);
    expect(pipelineValueSize({ type: 'json', value: { big: 1n } as unknown })).toBe(Infinity);
  });
});
