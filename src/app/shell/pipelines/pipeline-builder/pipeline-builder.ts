import { Component, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { CodeSandboxHost } from '../../../shared/code-sandbox/code-sandbox-host';
import { ErrorPanel } from '../../../shared/components/error-panel/error-panel';
import { ToolDefinition } from '../../../shared/models/tool-definition.model';
import { DudeDataType } from '../../../shared/models/tool-io.model';
import { PipelineStep, PipelineValue } from '../../../shared/models/pipeline-step.model';
import { ToolRegistryService } from '../../../core/registry/tool-registry.service';
import { searchTools } from '../../../core/registry/tool-search';
import { PipelineStoreService } from '../../../core/pipeline/pipeline-store.service';
import { PipelineStepRegistryService } from '../../../core/pipeline/pipeline-step-registry.service';
import { UserScriptStoreService } from '../../../core/pipeline/user-script-store.service';
import { runUserScriptStep } from '../../../core/pipeline/user-script-step';
import { PipelineRunnerService } from '../../../core/pipeline/pipeline-runner.service';
import { PipelineConfirmationService } from '../../../core/pipeline/pipeline-confirmation.service';
import { PipelineSuggestionHandoffService } from '../../../core/pipeline/pipeline-suggestion-handoff.service';
import { PipelineRun } from '../../../core/pipeline/pipeline-run';
import { canChain } from '../../../core/pipeline/pipeline-compatibility';
import { validatePipelineChain } from '../../../core/pipeline/pipeline-validation';
import {
  Pipeline,
  PipelineStepRef,
  UserScriptDefinition,
  createPipeline,
  createScriptStep,
  createToolStep,
} from '../../../core/pipeline/pipeline.model';

const INITIAL_INPUT_TYPE = 'text' as const;

@Component({
  selector: 'app-pipeline-builder',
  imports: [ErrorPanel, NgTemplateOutlet, DecimalPipe, RouterLink, CodeSandboxHost],
  templateUrl: './pipeline-builder.html',
})
export class PipelineBuilder {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly store = inject(PipelineStoreService);
  private readonly registry = inject(ToolRegistryService);
  private readonly stepRegistry = inject(PipelineStepRegistryService);
  private readonly scriptStore = inject(UserScriptStoreService);
  private readonly runner = inject(PipelineRunnerService);
  private readonly confirmation = inject(PipelineConfirmationService);
  private deepLinkRunPrompted = false;
  private readonly suggestionHandoff = inject(PipelineSuggestionHandoffService);
  private readonly sandboxHost = viewChild.required(CodeSandboxHost);

  protected readonly pipelineId = toSignal(this.route.paramMap.pipe(map((params) => params.get('id'))), {
    initialValue: this.route.snapshot.paramMap.get('id'),
  });

  protected readonly pipeline = signal<Pipeline>(this.initPipeline());
  protected readonly resolvedSteps = signal<Readonly<Record<string, PipelineStep | undefined>>>({});
  protected readonly registryReady = signal(false);

  protected readonly inputText = signal('');
  protected readonly run = signal<PipelineRun | null>(null);

  protected readonly pickerInsertAt = signal<number | null>(null);
  protected readonly pickerQuery = signal('');

  protected readonly validation = computed(() =>
    validatePipelineChain(
      INITIAL_INPUT_TYPE,
      this.pipeline().steps.map((step) => ({ stepId: step.stepId, step: this.resolvedSteps()[step.stepId] })),
    ),
  );

  protected readonly canRun = computed(() => this.registryReady() && this.validation().valid && this.pipeline().steps.length > 0);

  protected readonly pickerResults = computed(() => {
    if (!this.registryReady()) {
      return { compatible: [] as ToolDefinition[], incompatible: [] as ToolDefinition[], scripts: [] as UserScriptDefinition[] };
    }

    const insertAt = this.pickerInsertAt();
    if (insertAt === null) return { compatible: [], incompatible: [], scripts: [] };

    const upstreamProduces = this.upstreamProducesAt(insertAt);
    const candidates = searchTools(this.registry.getAll(), this.pickerQuery());

    const compatible: ToolDefinition[] = [];
    const incompatible: ToolDefinition[] = [];

    for (const definition of candidates) {
      const step = this.stepRegistry.get(definition.id);
      if (!step) continue; // not pipeline-eligible yet

      if (upstreamProduces === null || canChain({ accepts: [], produces: upstreamProduces }, step)) {
        compatible.push(definition);
      } else {
        incompatible.push(definition);
      }
    }

    const scripts = this.scriptStore.scripts().filter((script) => {
      const query = this.pickerQuery().trim().toLowerCase();
      if (query && !script.name.toLowerCase().includes(query)) return false;
      return upstreamProduces === null || canChain({ accepts: [], produces: upstreamProduces }, script);
    });

    return { compatible: compatible.slice(0, 30), incompatible: incompatible.slice(0, 10), scripts };
  });

  /** Resolves a step reference to its callable `PipelineStep`, whether backed by a tool or a saved script. */
  private resolveStepRef = async (ref: PipelineStepRef): Promise<PipelineStep | undefined> => {
    if (ref.kind === 'tool') return this.stepRegistry.get(ref.toolId);

    const scriptDef = this.scriptStore.getById(ref.scriptId);
    if (!scriptDef) return undefined;

    return {
      accepts: scriptDef.accepts,
      produces: scriptDef.produces,
      run: (input: PipelineValue) => runUserScriptStep(this.sandboxHost(), scriptDef, input),
    };
  };

  constructor() {
    effect(() => {
      const steps = this.pipeline().steps;
      const scriptsLoaded = this.scriptStore.scripts(); // read for reactivity: re-resolve when the script library changes
      void this.stepRegistry.ensureLoaded().then(async () => {
        const resolved: Record<string, PipelineStep | undefined> = {};
        for (const step of steps) {
          resolved[step.stepId] = await this.resolveStepRef(step);
        }
        this.resolvedSteps.set(resolved);
        this.registryReady.set(true);
      });
      void scriptsLoaded;
    });

    // A run deep link opens this editor first. Resolving steps only prepares the preview; the
    // runner is reachable solely from the confirmation dialog's explicit Run click.
    effect(() => {
      if (!this.registryReady() || this.deepLinkRunPrompted) return;
      if (this.route.snapshot.queryParamMap.get('confirmRun') !== '1') return;
      this.deepLinkRunPrompted = true;
      if (!this.canRun()) return;
      this.confirmation.confirm(this.confirmation.summarize(this.pipeline()), () => this.runPipeline());
    });

    // Unified Recents (DUDE_PRD.md §21 Phase 24 Item 13) reads a pipeline's own `lastRunAt` --
    // previously declared in the model but never actually populated anywhere. Persists once a run
    // reaches a terminal state, not on every status tick. `persist()` itself reads/writes
    // `this.pipeline`, so it must run `untracked` -- otherwise this effect would retrigger itself
    // the instant its own `persist()` call updates the very signal it just read.
    effect(() => {
      const run = this.run();
      if (!run) return;
      const status = run.status();
      if (status === 'idle' || status === 'running') return;
      untracked(() => this.persist({ ...this.pipeline(), lastRunAt: new Date().toISOString(), lastRunStatus: status }));
    });
  }

  private initPipeline(): Pipeline {
    const id = this.route.snapshot.paramMap.get('id');
    const existing = id ? this.store.getById(id) : undefined;
    if (existing) return existing;

    // Pipeline Suggestions' "Save as pipeline" (DUDE_PRD.md §21 Phase 24 Item 10) hands off a
    // suggested tool-id sequence via this one-shot, in-memory-only offer -- consumed at most once,
    // exactly like Smart Paste's PasteHandoffService.
    const suggested = this.suggestionHandoff.consume();
    const pipeline = createPipeline('Untitled pipeline');
    if (!suggested) return pipeline;

    return { ...pipeline, steps: suggested.map((toolId) => createToolStep(toolId, this.registry.getById(toolId)?.title)) };
  }

  /** The type(s) available just before array index `insertAt` — null means "unfiltered" (the very first step). */
  private upstreamProducesAt(insertAt: number): readonly DudeDataType[] | null {
    if (insertAt === 0) return null;
    const previous = this.pipeline().steps[insertAt - 1];
    return this.resolvedSteps()[previous.stepId]?.produces ?? null;
  }

  private persist(next: Pipeline): void {
    this.pipeline.set(next);
    this.store.save(next);
    if (this.pipelineId() !== next.id) {
      void this.router.navigate(['/pipelines', next.id], { replaceUrl: true });
    }
  }

  protected rename(name: string): void {
    this.persist({ ...this.pipeline(), name });
  }

  protected openPicker(insertAt: number): void {
    this.pickerInsertAt.set(insertAt);
    this.pickerQuery.set('');
  }

  protected closePicker(): void {
    this.pickerInsertAt.set(null);
  }

  protected addStep(toolId: string): void {
    const insertAt = this.pickerInsertAt();
    if (insertAt === null) return;

    const steps = [...this.pipeline().steps];
    steps.splice(insertAt, 0, createToolStep(toolId, this.registry.getById(toolId)?.title));
    this.persist({ ...this.pipeline(), steps });
    this.closePicker();
  }

  protected addScriptStep(scriptId: string): void {
    const insertAt = this.pickerInsertAt();
    if (insertAt === null) return;

    const steps = [...this.pipeline().steps];
    steps.splice(insertAt, 0, createScriptStep(scriptId));
    this.persist({ ...this.pipeline(), steps });
    this.closePicker();
  }

  protected removeStep(stepId: string): void {
    this.persist({ ...this.pipeline(), steps: this.pipeline().steps.filter((step) => step.stepId !== stepId) });
  }

  protected moveStep(stepId: string, direction: -1 | 1): void {
    const steps = [...this.pipeline().steps];
    const index = steps.findIndex((step) => step.stepId === stepId);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= steps.length) return;

    [steps[index], steps[target]] = [steps[target], steps[index]];
    this.persist({ ...this.pipeline(), steps });
  }

  protected stepLabel(ref: PipelineStepRef): string {
    if (ref.kind === 'script') return ref.label ?? this.scriptStore.getById(ref.scriptId)?.name ?? 'Script step (missing)';
    return ref.label ?? this.registry.getById(ref.toolId)?.title ?? ref.toolId;
  }

  protected runPipeline(): void {
    const initialInput: PipelineValue = { type: INITIAL_INPUT_TYPE, value: this.inputText() };
    const run = this.runner.runPipeline(this.pipeline(), initialInput, this.resolveStepRef);
    this.run.set(run);
  }

  protected formatOutput(output: unknown): string {
    if (typeof output === 'string') return output;
    return JSON.stringify(output, null, 2);
  }
}
