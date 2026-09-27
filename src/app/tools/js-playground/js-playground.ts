import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { BusyIndicator, BusyIndicatorStatus } from '../../shared/components/busy-indicator/busy-indicator';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { CodeSandboxHost } from '../../shared/code-sandbox/code-sandbox-host';
import { OpenTextFile, OpenedTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { SaveTextFile } from '../../shared/components/save-text-file/save-text-file';
import { recordImportedFileFlags } from '../../core/text-file-input/imported-file-flags';
import { EMPTY_JS_PLAYGROUND_STATE, JsPlaygroundState, applySandboxEvent } from './js-playground-session';

const DEFAULT_SNIPPET = "console.log('Hello from the JS Playground!');\n1 + 1;";
const DEFAULT_TIMEOUT_MS = 3000;

@Component({
  selector: 'app-js-playground',
  imports: [ToolShell, ErrorPanel, BusyIndicator, CodeSandboxHost, OpenTextFile, TextFileDrop, SaveTextFile],
  templateUrl: './js-playground.html',
})
export class JsPlayground {
  private readonly persistence = inject(PersistenceService);

  protected readonly importedTypeScript = signal(sessionStorage.getItem('dude:desktop:typescript-notice') === 'true');
  protected readonly code = this.persistence.signal('js-playground', 'code', 'session', DEFAULT_SNIPPET);
  protected readonly timeoutMs = this.persistence.signal('js-playground', 'timeoutMs', 'local', DEFAULT_TIMEOUT_MS);

  private readonly sandboxHost = viewChild.required(CodeSandboxHost);
  private activeRun: { requestId: string; cancel(): void } | null = null;

  protected readonly state = signal<JsPlaygroundState>(EMPTY_JS_PLAYGROUND_STATE);
  protected readonly running = signal(false);

  protected readonly status = computed<BusyIndicatorStatus>(() => {
    if (this.running()) return 'running';
    const outcome = this.state().outcome;
    if (!outcome) return 'idle';
    if (outcome.kind === 'error') return 'error';
    if (outcome.kind === 'terminated' && outcome.reason !== 'cancelled') return 'error';
    if (outcome.kind === 'terminated') return 'cancelled';
    return 'done';
  });

  protected onCodeChange(event: Event): void {
    this.code.set((event.target as HTMLTextAreaElement).value);
  }

  /** Like an Explorer-opened file: TypeScript source gets the "runs as JavaScript" notice, anything else clears it. */
  protected onFileOpened(file: OpenedTextFile): void {
    recordImportedFileFlags(file.name);
    this.importedTypeScript.set(/\.tsx?$/i.test(file.name));
    this.code.set(file.text);
  }

  protected run(): void {
    this.state.set(EMPTY_JS_PLAYGROUND_STATE);
    this.running.set(true);
    this.activeRun = this.sandboxHost().run(this.code(), this.timeoutMs(), (event) => {
      this.state.update((state) => applySandboxEvent(state, event));
      if (event.kind !== 'log') this.running.set(false);
    });
  }

  protected stop(): void {
    this.activeRun?.cancel();
  }

  protected clear(): void {
    this.code.set('');
    this.state.set(EMPTY_JS_PLAYGROUND_STATE);
  }
}
