import { Component, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { CodeEditor } from '../../../shared/components/code-editor/code-editor';
import { CollabHistoryDrawer, collabTextPreview } from '../../../shared/components/collab-history-drawer/collab-history-drawer';
import { CodeSandboxHost } from '../../../shared/code-sandbox/code-sandbox-host';
import { ErrorPanel } from '../../../shared/components/error-panel/error-panel';
import { DudeDataType } from "@dude/shared-types/shared/models/tool-io.model";
import { PipelineValue, PipelineStepResult } from "@dude/contracts/shared/models/pipeline-step.model";
import { UserScriptStoreService } from '../../../core/pipeline/user-script-store.service';
import { OpenEditorMerge } from '../../../core/sync/open-editor-merge';
import { CollabTextSession } from '../../../core/collab/collab-text-session';
import { RemoteChangeNotice } from '../../../shared/components/remote-change-notice/remote-change-notice';
import { runUserScriptStep } from "@dude/tool-engine/core/pipeline/user-script-step";
import { UserScriptDefinition, createUserScript } from "@dude/domain/core/pipeline/pipeline.model";

const ALL_TYPES: readonly DudeDataType[] = ['text', 'json', 'bytes', 'file', 'table', 'url', 'http-response'];

@Component({
  selector: 'app-script-editor',
  imports: [ErrorPanel, RouterLink, CodeSandboxHost, RemoteChangeNotice, CodeEditor, CollabHistoryDrawer],
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

  /**
   * The body of a saved script is collaborative (PD-099): while the Hub accepts it (the `pipelines` category is on) it is the
   * shared `user-script:<id>` document and every keystroke is live. Pages, standalone, an unsaved script or a refusal keep the
   * plain body and Save; a desktop that loses its Hub keeps editing locally and returns to the live body once that is saved.
   */
  protected readonly collab = new CollabTextSession({
    docKey: () => this.liveDocKey(),
    textName: 'body',
    keepLocally: (text) => this.updateField('body', text),
    canPromote: () => (this.store.getById(this.script().id)?.body ?? '') === this.script().body,
  });

  /**
   * Another device's changes to this script apply live to the open form (PD-113). While the body is live it is kept current by
   * the shared document, so it is left out here; otherwise a body edited on both sides is a conflict (notice, local draft
   * untouched), never an overwrite.
   */
  protected readonly remote = new OpenEditorMerge<UserScriptDefinition>({
    entityType: 'user-script',
    entityId: () => this.script().id,
    stored: () => this.store.getById(this.script().id),
    draft: () => this.script(),
    setDraft: (value) => this.script.set(value),
    ignore: () => (this.collab.mode() === 'local' ? ['updatedAt'] : ['updatedAt', 'body']),
  });

  /** Version history of the live body (PD-105), offered only while the body is live. */
  protected readonly historyOpen = signal(false);
  protected readonly historyStatus = signal('');
  protected readonly historyDoc = computed(() => (this.collab.mode() === 'live' ? this.liveDocKey() : null));
  protected readonly historyPreview = collabTextPreview('body');

  protected readonly testInput = signal('');
  protected readonly testRunning = signal(false);
  protected readonly testResult = signal<PipelineStepResult | null>(null);

  protected readonly canSave = computed(() => this.script().name.trim() !== '' && this.script().produces.length > 0);

  constructor() {
    // History belongs to the live body: leaving live mode closes it.
    effect(() => {
      if (this.historyDoc() === null) untracked(() => this.historyOpen.set(false));
    });
    // The form's body follows the shared text, so Save and Test always use what everyone sees.
    effect(() => {
      if (this.collab.mode() === 'local') return;
      const text = this.collab.text();
      untracked(() => {
        if (this.collab.binding() !== null && this.script().body !== text) this.script.update((current) => ({ ...current, body: text }));
      });
    });
  }

  /** The shared document of a saved script's body, or null for an unsaved one. */
  private liveDocKey(): string | null {
    const id = this.script().id;
    return this.saved() && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? `user-script:${id}` : null;
  }

  protected openHistory(): void {
    this.historyStatus.set('');
    this.historyOpen.set(true);
  }

  /** The Hub applied the restore as a new edit; the live body receives it through the shared document by itself. */
  protected onHistoryRestored(): void {
    this.historyOpen.set(false);
    this.historyStatus.set('Restored an earlier version of the body. Everyone with this script open sees it now.');
  }

  /** The script exists in the store (a new one becomes collaborative after its first save). */
  private saved(): boolean {
    return this.store.getById(this.script().id) !== undefined;
  }

  private initScript(): UserScriptDefinition {
    const id = this.route.snapshot.paramMap.get('id');
    const existing = id ? this.store.getById(id) : undefined;
    return existing ?? createUserScript('Untitled script');
  }

  protected updateField<K extends keyof UserScriptDefinition>(key: K, value: UserScriptDefinition[K]): void {
    this.script.update((current) => ({ ...current, [key]: value }));
  }

  /** The editor's text changed: live, it is the shared text (a no-op when the bound editor already wrote it); otherwise the form. */
  protected onBodyChange(value: string): void {
    if (!this.collab.setText(value)) this.updateField('body', value);
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
    const saved = this.script();
    void this.store.save(saved).then((result) => {
      if (result.ok) this.remote.markSaved(saved);
    });
    if (this.scriptId() !== this.script().id) {
      void this.router.navigate(['/pipelines/scripts', this.script().id], { replaceUrl: true });
    }
  }

  /** Imported via a bundle (Phase 26 Item 14): blocked in pipelines until this explicit review. */
  protected markReviewed(): void {
    this.store.markReviewed(this.script().id);
    const reviewed = this.store.getById(this.script().id);
    if (reviewed) {
      this.script.set(reviewed);
      this.remote.markSaved(reviewed);
    }
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
