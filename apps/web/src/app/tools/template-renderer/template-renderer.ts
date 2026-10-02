import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { BusyIndicator, BusyIndicatorStatus } from '../../shared/components/busy-indicator/busy-indicator';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { CodeSandboxHost } from '../../shared/code-sandbox/code-sandbox-host';
import { buildTemplateRenderCode } from "@dude/tool-engine/tools/template-renderer/template-render";
import { loadEjsRuntimeSource } from "@dude/tool-engine/tools/template-renderer/ejs-runtime";

const DEFAULT_TEMPLATE = 'Hello <%= name %>!\n<% for (const item of items) { %>\n- <%= item %>\n<% } %>';
const DEFAULT_CONTEXT = '{\n  "name": "World",\n  "items": ["one", "two", "three"]\n}';
const DEFAULT_TIMEOUT_MS = 3000;

type Outcome = { kind: 'result'; value: string } | { kind: 'error'; message: string } | { kind: 'terminated'; reason: string };

@Component({
  selector: 'app-template-renderer',
  imports: [ToolShell, ErrorPanel, BusyIndicator, CodeSandboxHost],
  templateUrl: './template-renderer.html',
})
export class TemplateRenderer {
  private readonly persistence = inject(PersistenceService);

  protected readonly template = this.persistence.signal('template-renderer', 'template', 'session', DEFAULT_TEMPLATE);
  protected readonly context = this.persistence.signal('template-renderer', 'context', 'session', DEFAULT_CONTEXT);

  private readonly sandboxHost = viewChild.required(CodeSandboxHost);

  protected readonly running = signal(false);
  protected readonly outcome = signal<Outcome | null>(null);

  protected readonly status = computed<BusyIndicatorStatus>(() => {
    if (this.running()) return 'running';
    const outcome = this.outcome();
    if (!outcome) return 'idle';
    if (outcome.kind === 'error') return 'error';
    if (outcome.kind === 'terminated') return outcome.reason === 'cancelled' ? 'cancelled' : 'error';
    return 'done';
  });

  protected onTemplateChange(event: Event): void {
    this.template.set((event.target as HTMLTextAreaElement).value);
  }

  protected onContextChange(event: Event): void {
    this.context.set((event.target as HTMLTextAreaElement).value);
  }

  protected async render(): Promise<void> {
    this.outcome.set(null);

    let ejsRuntimeSource: string;
    try {
      ejsRuntimeSource = await loadEjsRuntimeSource();
    } catch (err) {
      this.outcome.set({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      return;
    }

    const built = buildTemplateRenderCode(this.template(), this.context(), ejsRuntimeSource);
    if (!built.ok) {
      this.outcome.set({ kind: 'error', message: built.error });
      return;
    }

    this.running.set(true);
    this.sandboxHost().run(built.code, DEFAULT_TIMEOUT_MS, (event) => {
      switch (event.kind) {
        case 'log':
          return;
        case 'result': {
          this.running.set(false);
          let value = event.value ?? '';
          try {
            value = JSON.parse(value) as string;
          } catch {
            // fall through with the raw value
          }
          this.outcome.set({ kind: 'result', value });
          return;
        }
        case 'error':
          this.running.set(false);
          this.outcome.set({ kind: 'error', message: event.message });
          return;
        case 'terminated':
          this.running.set(false);
          this.outcome.set({ kind: 'terminated', reason: event.reason });
          return;
      }
    });
  }

  protected clear(): void {
    this.template.set('');
    this.context.set('');
    this.outcome.set(null);
  }
}
