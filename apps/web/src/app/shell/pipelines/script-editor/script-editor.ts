import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { CodeSandboxHost } from '../../../shared/code-sandbox/code-sandbox-host';
import { ErrorPanel } from '../../../shared/components/error-panel/error-panel';
import { DudeDataType } from "@dude/shared-types/shared/models/tool-io.model";
import { PipelineValue, PipelineStepResult } from "@dude/contracts/shared/models/pipeline-step.model";
import { UserScriptStoreService } from '../../../core/pipeline/user-script-store.service';
import { runUserScriptStep } from "@dude/tool-engine/core/pipeline/user-script-step";
import { UserScriptDefinition, createUserScript } from "@dude/domain/core/pipeline/pipeline.model";

const ALL_TYPES: readonly DudeDataType[] = ['text', 'json', 'bytes', 'file', 'table', 'url', 'http-response'];

@Component({
  selector: 'app-script-editor',
  imports: [ErrorPanel, RouterLink, CodeSandboxHost],
  templateUrl: './script-editor.html',
})
export class ScriptEditor {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly store = inject(UserScriptStoreService);
  private readonly sandboxHost = viewChild.required(CodeSandboxHost);

  protected readonly allTypes = ALL_TYPES;

  protected readonly scriptId = toSignal(this.route.paramMap.pipe(map((params) => params.get('id'))), {
    initialValue: this.route.snapshot.paramMap.get('id'),
  });

  protected readonly script = signal<UserScriptDefinition>(this.initScript());

  protected readonly testInput = signal('');
  protected readonly testRunning = signal(false);
  protected readonly testResult = signal<PipelineStepResult | null>(null);

  protected readonly canSave = computed(() => this.script().name.trim() !== '' && this.script().produces.length > 0);

  private initScript(): UserScriptDefinition {
    const id = this.route.snapshot.paramMap.get('id');
    const existing = id ? this.store.getById(id) : undefined;
    return existing ?? createUserScript('Untitled script');
  }

  protected updateField<K extends keyof UserScriptDefinition>(key: K, value: UserScriptDefinition[K]): void {
    this.script.update((current) => ({ ...current, [key]: value }));
  }

  protected toggleAccepts(type: DudeDataType): void {
    const current = this.script().accepts;
    const next = current.includes(type) ? current.filter((t) => t !== type) : [...current, type];
    this.updateField('accepts', next);
  }

  protected setProduces(type: DudeDataType): void {
    this.updateField('produces', [type]);
  }

  protected save(): void {
    this.store.save(this.script());
    if (this.scriptId() !== this.script().id) {
      void this.router.navigate(['/pipelines/scripts', this.script().id], { replaceUrl: true });
    }
  }

  /** Imported via a bundle (Phase 26 Item 14): blocked in pipelines until this explicit review. */
  protected markReviewed(): void {
    this.store.markReviewed(this.script().id);
    const reviewed = this.store.getById(this.script().id);
    if (reviewed) this.script.set(reviewed);
  }

  private buildTestValue(): PipelineValue {
    const type = this.script().accepts[0] ?? 'text';
    const raw = this.testInput();
    if (type === 'text' || type === 'bytes' || type === 'url') return { type, value: raw };
    try {
      return { type, value: JSON.parse(raw || 'null') } as PipelineValue;
    } catch {
      return { type: 'json', value: raw };
    }
  }

  protected runTest(): void {
    this.testRunning.set(true);
    this.testResult.set(null);
    const input = this.buildTestValue();
    void runUserScriptStep(this.sandboxHost(), this.script(), input).then((result) => {
      this.testResult.set(result);
      this.testRunning.set(false);
    });
  }

  protected formatTestOutput(): string {
    const result = this.testResult();
    if (!result?.ok) return '';
    return typeof result.output.value === 'string' ? result.output.value : JSON.stringify(result.output.value, null, 2);
  }
}
