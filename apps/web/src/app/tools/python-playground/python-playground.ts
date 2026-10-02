import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { BusyIndicator, BusyIndicatorStatus } from '../../shared/components/busy-indicator/busy-indicator';
import { PersistenceOptIn } from '../../shared/components/persistence-opt-in/persistence-opt-in';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { ConnectivityService } from '../../core/connectivity/connectivity.service';
import { PythonSandboxHost } from './python-sandbox-host';
import { EMPTY_PYTHON_PLAYGROUND_STATE, PythonPlaygroundState, applyPythonSandboxEvent } from "@dude/tool-engine/tools/python-playground/python-playground-session";

const DEFAULT_SNIPPET = "print('Hello from the Python Playground!')\n1 + 1";
// Generous relative to the JS Playground's 3s default: a run that follows a prior
// timeout/cancel must re-run loadPyodide() from scratch (WASM re-instantiation, not
// just a cache-warm asset fetch), which empirically took close to 15s in testing —
// too tight to safely distinguish "still legitimately booting" from "actually hung".
const TIMEOUT_MS = 30000;

@Component({
  selector: 'app-python-playground',
  imports: [ToolShell, ErrorPanel, BusyIndicator, PythonSandboxHost, PersistenceOptIn],
  templateUrl: './python-playground.html',
})
export class PythonPlayground {
  private readonly persistence = inject(PersistenceService);
  private readonly connectivity = inject(ConnectivityService);

  protected readonly code = this.persistence.signal('python-playground', 'code', 'user-choice', DEFAULT_SNIPPET);
  protected readonly online = this.connectivity.online;
  protected readonly timeoutSeconds = TIMEOUT_MS / 1000;

  private readonly sandboxHost = viewChild.required(PythonSandboxHost);

  protected readonly state = signal<PythonPlaygroundState>(EMPTY_PYTHON_PLAYGROUND_STATE);
  protected readonly running = signal(false);

  protected readonly status = computed<BusyIndicatorStatus>(() => {
    if (this.running()) return 'running';
    const outcome = this.state().outcome;
    if (!outcome) return 'idle';
    if (outcome.kind === 'error') return 'error';
    if (outcome.kind === 'terminated' && outcome.reason !== 'cancelled') return 'error';
    return 'done';
  });

  protected onCodeChange(event: Event): void {
    this.code.set((event.target as HTMLTextAreaElement).value);
  }

  protected run(): void {
    this.state.set(EMPTY_PYTHON_PLAYGROUND_STATE);
    this.running.set(true);
    this.sandboxHost().run(this.code(), TIMEOUT_MS, (event) => {
      this.state.update((state) => applyPythonSandboxEvent(state, event));
      if (event.kind !== 'log') this.running.set(false);
    });
  }

  protected stop(): void {
    this.sandboxHost().cancel();
  }

  protected clear(): void {
    this.code.set('');
    this.state.set(EMPTY_PYTHON_PLAYGROUND_STATE);
  }
}
