import { Component, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { BusyIndicator } from '../../shared/components/busy-indicator/busy-indicator';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { FileDrop } from '../../shared/components/file-drop/file-drop';
import { WorkerClientService } from '../../core/workers/worker-client.service';
import { WorkerJob } from '../../core/workers/worker-job';
import { FileInspectorReport, inspectFile } from "@dude/tool-engine/tools/file-inspector/file-inspector-logic";
import { FileInspectorWorkerPayload, FileInspectorWorkerResult } from "@dude/tool-engine/tools/file-inspector/file-inspector-worker-payload";

/** Files above this size run in a Worker instead of blocking the main thread. */
const WORKER_THRESHOLD = 2_000_000;

@Component({
  selector: 'app-file-inspector',
  imports: [ToolShell, BusyIndicator, ErrorPanel, FileDrop],
  templateUrl: './file-inspector.html',
})
export class FileInspector {
  private readonly workerClient = inject(WorkerClientService);

  protected readonly rejection = signal<string | null>(null);
  private readonly reportSignal = signal<FileInspectorReport | null>(null);
  private readonly jobSignal = signal<WorkerJob<FileInspectorWorkerResult> | null>(null);
  protected readonly job = this.jobSignal.asReadonly();

  protected readonly report = computed<FileInspectorReport | null>(() => this.reportSignal() ?? this.job()?.result() ?? null);

  protected readonly formattedSize = computed(() => {
    const bytes = this.report()?.fileSize;
    if (bytes === undefined) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  });

  protected async onFileSelected(file: File): Promise<void> {
    this.job()?.cancel();
    this.jobSignal.set(null);
    this.reportSignal.set(null);
    this.rejection.set(null);

    const buffer = await file.arrayBuffer();
    const declaredMime = file.type || null;

    if (buffer.byteLength > WORKER_THRESHOLD) {
      this.jobSignal.set(
        this.workerClient.run<FileInspectorWorkerPayload, FileInspectorWorkerResult>(
          () => new Worker(new URL('./file-inspector.worker', import.meta.url), { type: 'module' }),
          { buffer, fileName: file.name, declaredMime },
          [buffer],
        ),
      );
    } else {
      this.reportSignal.set(inspectFile(new Uint8Array(buffer), file.name, declaredMime));
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
  }
}
