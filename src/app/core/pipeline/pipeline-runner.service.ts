import { Injectable, inject, signal } from '@angular/core';
import { PipelineStep, PipelineStepContext, PipelineStepResult, PipelineValue } from '../../shared/models/pipeline-step.model';
import { WorkerClientService } from '../workers/worker-client.service';
import { Pipeline, PipelineStepRef } from './pipeline.model';
import { PipelineRun, PipelineStepRun } from './pipeline-run';
import { validatePipelineChain } from './pipeline-validation';

/**
 * Resolves a step reference (tool or script) to its callable `PipelineStep`. The runner is
 * deliberately ignorant of *how* this happens — a tool step resolves via `loadPipelineStep`, a
 * script step needs a live sandboxed-execution surface the caller owns (see `core/pipeline/AGENTS.md`).
 */
export type PipelineStepResolver = (ref: PipelineStepRef) => Promise<PipelineStep | undefined>;

/**
 * Platform/offline gate (Phase 26 Item 13): a reason the step can't run here and now (e.g.
 * offline with its runtime uncached), or `undefined`. Surfaced as a pre-flight `blocked` issue
 * rather than a mid-chain failure. See `PipelineStepGateService`.
 */
export type PipelineStepGate = (ref: PipelineStepRef, step: PipelineStep | undefined) => string | undefined;

/**
 * Cap on a single intermediate value (Phase 26 Item 13). Binary values travel as base64 inside
 * plain JSON, so a large file chained through several steps can exhaust a browser tab's memory. The
 * run fails with a clear error instead. Identical on web and desktop, so a pipeline never behaves
 * differently by platform.
 */
export const MAX_PIPELINE_VALUE_CHARS = 64 * 1024 * 1024;

/** Approximate serialized size of a value, in UTF-16 chars. `Infinity` if unserializable. */
export function pipelineValueSize(value: PipelineValue): number {
  switch (value.type) {
    case 'text':
    case 'url':
    case 'bytes':
      return value.value.length;
    case 'file':
      return value.value.base64.length;
    default:
      try {
        return JSON.stringify(value.value)?.length ?? 0;
      } catch {
        return Infinity;
      }
  }
}

function sizeError(what: string, size: number): PipelineStepResult {
  const mb = (chars: number) => `${(chars / 1024 / 1024).toFixed(0)} MB`;
  return {
    ok: false,
    error: {
      message: `${what} is too large for a pipeline (${Number.isFinite(size) ? `~${mb(size)}` : 'unmeasurable'}; limit ${mb(MAX_PIPELINE_VALUE_CHARS)}). Run the tool directly instead.`,
      kind: 'invalid-input',
    },
  };
}

/**
 * Sequential pipeline execution (PRD §21 Item 2) — no branching/fan-out, matching the
 * linear-chain-only v1 scope. Mirrors `WorkerJob`'s signals-based handle shape.
 */
@Injectable({ providedIn: 'root' })
export class PipelineRunnerService {
  private readonly workers = inject(WorkerClientService);

  runPipeline(pipeline: Pipeline, initialInput: PipelineValue, resolveStep: PipelineStepResolver, gate?: PipelineStepGate): PipelineRun {
    const statusSignal = signal<'idle' | 'running' | 'succeeded' | 'failed' | 'blocked' | 'cancelled'>('idle');
    const currentStepIndexSignal = signal<number | null>(null);
    const stepResultsSignal = signal<readonly PipelineStepRun[]>(
      pipeline.steps.map(
        (step): PipelineStepRun => ({
          stepId: step.stepId,
          status: 'pending',
          output: null,
          outputType: null,
          error: null,
          durationMs: null,
        }),
      ),
    );
    const finalOutputSignal = signal<unknown | null>(null);
    // One controller per run: `cancel()` aborts the in-flight step (a worker-offloaded step is
    // terminated outright) instead of waiting for it to finish, which is all the old flag could do.
    const abort = new AbortController();
    const context: PipelineStepContext = {
      signal: abort.signal,
      offload: (createWorker, payload) => this.workers.runAsync(createWorker, payload, abort.signal),
    };
    const aborted = new Promise<'aborted'>((resolve) => abort.signal.addEventListener('abort', () => resolve('aborted'), { once: true }));

    const patchStep = (index: number, patch: Partial<PipelineStepRun>) => {
      stepResultsSignal.update((results) => results.map((result, i) => (i === index ? { ...result, ...patch } : result)));
    };

    void (async () => {
      const resolutions = await Promise.all(
        pipeline.steps.map(async (ref) => {
          const step = await resolveStep(ref);
          return { stepId: ref.stepId, step, blockedReason: gate?.(ref, step) };
        }),
      );

      const validation = validatePipelineChain(initialInput.type, resolutions);
      if (!validation.valid) {
        statusSignal.set('blocked');
        for (const issue of validation.issues) {
          const index = pipeline.steps.findIndex((step) => step.stepId === issue.stepId);
          if (index !== -1) patchStep(index, { status: 'error', error: issue.message });
        }
        return;
      }

      statusSignal.set('running');
      let currentInput = initialInput;
      const inputSize = pipelineValueSize(initialInput);
      if (inputSize > MAX_PIPELINE_VALUE_CHARS) {
        const error = sizeError('The input', inputSize);
        patchStep(0, { status: 'error', error: error.ok ? null : error.error.message });
        for (let skip = 1; skip < resolutions.length; skip++) patchStep(skip, { status: 'skipped' });
        statusSignal.set('failed');
        return;
      }

      for (let index = 0; index < resolutions.length; index++) {
        if (abort.signal.aborted) {
          statusSignal.set('cancelled');
          return;
        }

        currentStepIndexSignal.set(index);
        patchStep(index, { status: 'running' });

        const step = resolutions[index].step;
        if (!step) continue; // unreachable when validation passed — every resolution has a step

        const startedAt = performance.now();
        const outcome = await Promise.race([
          step.run(currentInput, context).catch(
            (error: unknown): PipelineStepResult => ({
              ok: false,
              error: { message: error instanceof Error ? error.message : String(error), kind: 'execution-error' },
            }),
          ),
          aborted,
        ]);
        const durationMs = performance.now() - startedAt;

        if (outcome === 'aborted' || abort.signal.aborted) {
          patchStep(index, { status: 'skipped', durationMs });
          statusSignal.set('cancelled');
          return;
        }
        const outputSize = outcome.ok ? pipelineValueSize(outcome.output) : 0;
        const result = outputSize > MAX_PIPELINE_VALUE_CHARS ? sizeError("This step's output", outputSize) : outcome;

        if (!result.ok) {
          patchStep(index, { status: 'error', error: result.error.message, durationMs });
          for (let skip = index + 1; skip < resolutions.length; skip++) patchStep(skip, { status: 'skipped' });
          statusSignal.set('failed');
          return;
        }

        const next = resolutions[index + 1]?.step;
        if (next && !next.accepts.includes(result.output.type)) {
          patchStep(index, { status: 'done', output: result.output.value, outputType: result.output.type, durationMs });
          patchStep(index + 1, {
            status: 'error',
            error: `Step produced '${result.output.type}' this run, but the next step only accepts [${next.accepts.join(', ')}].`,
          });
          for (let skip = index + 2; skip < resolutions.length; skip++) patchStep(skip, { status: 'skipped' });
          statusSignal.set('failed');
          return;
        }

        patchStep(index, { status: 'done', output: result.output.value, outputType: result.output.type, durationMs });
        currentInput = result.output;
      }

      finalOutputSignal.set(currentInput.value);
      statusSignal.set('succeeded');
    })();

    return {
      status: statusSignal,
      currentStepIndex: currentStepIndexSignal,
      stepResults: stepResultsSignal,
      finalOutput: finalOutputSignal,
      cancel: () => abort.abort(),
    };
  }
}
