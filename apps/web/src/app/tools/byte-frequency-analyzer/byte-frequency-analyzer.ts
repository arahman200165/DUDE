import { ByteFrequencyAnalyzer_hex } from "@dude/tool-engine/tools/byte-frequency-analyzer/byte-frequency-analyzer.embedded-engine";
import { Component, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { BusyIndicator } from '../../shared/components/busy-indicator/busy-indicator';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { FileDrop } from '../../shared/components/file-drop/file-drop';
import { WorkerClientService } from '../../core/workers/worker-client.service';
import { WorkerJob } from '../../core/workers/worker-job';
import { analyzeByteFrequency, ByteFrequencyReport } from "@dude/tool-engine/tools/byte-frequency-analyzer/byte-frequency-analyzer-logic";
import { ByteFrequencyAnalyzerWorkerPayload, ByteFrequencyAnalyzerWorkerResult } from "@dude/tool-engine/tools/byte-frequency-analyzer/byte-frequency-analyzer-worker-payload";

/** Files above this size run in a Worker instead of blocking the main thread. */
const WORKER_THRESHOLD = 2_000_000;

@Component({
  selector: 'app-byte-frequency-analyzer',
  imports: [ToolShell, BusyIndicator, ErrorPanel, FileDrop],
  templateUrl: './byte-frequency-analyzer.html',
})
export class ByteFrequencyAnalyzer {
  private readonly workerClient = inject(WorkerClientService);

  protected readonly fileName = signal<string | null>(null);
  protected readonly rejection = signal<string | null>(null);
  private readonly reportSignal = signal<ByteFrequencyReport | null>(null);
  private readonly jobSignal = signal<WorkerJob<ByteFrequencyAnalyzerWorkerResult> | null>(null);
  protected readonly job = this.jobSignal.asReadonly();

  protected readonly report = computed<ByteFrequencyReport | null>(() => this.reportSignal() ?? this.job()?.result() ?? null);

  protected async onFileSelected(file: File): Promise<void> {
    this.job()?.cancel();
    this.jobSignal.set(null);
    this.reportSignal.set(null);
    this.rejection.set(null);
    this.fileName.set(file.name);

    const buffer = await file.arrayBuffer();

    if (buffer.byteLength > WORKER_THRESHOLD) {
      this.jobSignal.set(
        this.workerClient.run<ByteFrequencyAnalyzerWorkerPayload, ByteFrequencyAnalyzerWorkerResult>(
          () => new Worker(new URL('./byte-frequency-analyzer.worker', import.meta.url), { type: 'module' }),
          { buffer },
          [buffer],
        ),
      );
    } else {
      this.reportSignal.set(analyzeByteFrequency(new Uint8Array(buffer)));
    }
  }

  protected onRejected(message: string): void {
    this.rejection.set(message);
  }
  protected hex = ByteFrequencyAnalyzer_hex;


  protected clear(): void {
    this.job()?.cancel();
    this.jobSignal.set(null);
    this.reportSignal.set(null);
    this.rejection.set(null);
    this.fileName.set(null);
  }
}
