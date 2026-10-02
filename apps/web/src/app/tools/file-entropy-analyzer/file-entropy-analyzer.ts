import { Component, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { BusyIndicator } from '../../shared/components/busy-indicator/busy-indicator';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { FileDrop } from '../../shared/components/file-drop/file-drop';
import { WorkerClientService } from '../../core/workers/worker-client.service';
import { WorkerJob } from '../../core/workers/worker-job';
import { analyzeFileEntropy, DEFAULT_WINDOW_SIZE, EntropyReport } from "@dude/tool-engine/tools/file-entropy-analyzer/file-entropy-analyzer-logic";
import { FileEntropyAnalyzerWorkerPayload, FileEntropyAnalyzerWorkerResult } from "@dude/tool-engine/tools/file-entropy-analyzer/file-entropy-analyzer-worker-payload";

/** Files above this size run in a Worker instead of blocking the main thread. */
const WORKER_THRESHOLD = 2_000_000;

@Component({
  selector: 'app-file-entropy-analyzer',
  imports: [ToolShell, BusyIndicator, ErrorPanel, FileDrop],
  templateUrl: './file-entropy-analyzer.html',
})
export class FileEntropyAnalyzer {
  private readonly workerClient = inject(WorkerClientService);

  protected readonly fileName = signal<string | null>(null);
  protected readonly rejection = signal<string | null>(null);
  private readonly reportSignal = signal<EntropyReport | null>(null);
  private readonly jobSignal = signal<WorkerJob<FileEntropyAnalyzerWorkerResult> | null>(null);
  protected readonly job = this.jobSignal.asReadonly();

  protected readonly report = computed<EntropyReport | null>(() => this.reportSignal() ?? this.job()?.result() ?? null);

  protected readonly maxWindowEntropy = computed(() => Math.max(1, ...(this.report()?.windows.map((w) => w.entropy) ?? [1])));

  protected async onFileSelected(file: File): Promise<void> {
    this.job()?.cancel();
    this.jobSignal.set(null);
    this.reportSignal.set(null);
    this.rejection.set(null);
    this.fileName.set(file.name);

    const buffer = await file.arrayBuffer();

    if (buffer.byteLength > WORKER_THRESHOLD) {
      this.jobSignal.set(
        this.workerClient.run<FileEntropyAnalyzerWorkerPayload, FileEntropyAnalyzerWorkerResult>(
          () => new Worker(new URL('./file-entropy-analyzer.worker', import.meta.url), { type: 'module' }),
          { buffer, windowSize: DEFAULT_WINDOW_SIZE },
          [buffer],
        ),
      );
    } else {
      this.reportSignal.set(analyzeFileEntropy(new Uint8Array(buffer)));
    }
  }

  protected onRejected(message: string): void {
    this.rejection.set(message);
  }

  protected clear(): void {
    this.job()?.cancel();
    this.jobSignal.set(null);
    this.reportSignal.set(null);
    this.rejection.set(null);
    this.fileName.set(null);
  }
}
