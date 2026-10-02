import { Injectable, inject } from '@angular/core';
import { ToolRegistryService } from '../registry/tool-registry.service';
import { PipelineStep } from "@dude/contracts/shared/models/pipeline-step.model";
import { loadPipelineStep, validatePipelineStepIo } from './pipeline-step-loader';

/**
 * Eagerly resolves every tool's pipeline step once and caches the result, so the builder UI
 * (the "add step" picker, in particular) never repeats 277 dynamic-import attempts per render.
 * A tool with no `<id>.pipeline-step.ts` caches as `undefined` — "not pipeline-eligible," not
 * an error (see `core/pipeline/AGENTS.md`).
 */
@Injectable({ providedIn: 'root' })
export class PipelineStepRegistryService {
  private readonly registry = inject(ToolRegistryService);
  private readonly cache = new Map<string, PipelineStep | undefined>();
  private loadingPromise: Promise<void> | null = null;

  async ensureLoaded(): Promise<void> {
    if (!this.loadingPromise) this.loadingPromise = this.loadAll();
    await this.loadingPromise;
  }

  get(toolId: string): PipelineStep | undefined {
    return this.cache.get(toolId);
  }

  eligibleToolIds(): readonly string[] {
    return [...this.cache.entries()].filter(([, step]) => step !== undefined).map(([id]) => id);
  }

  private async loadAll(): Promise<void> {
    await Promise.all(
      this.registry.getAll().map(async (definition) => {
        const step = await loadPipelineStep(definition.id);
        if (step) validatePipelineStepIo(definition, step);
        this.cache.set(definition.id, step);
      }),
    );
  }
}
