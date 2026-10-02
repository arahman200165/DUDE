import { BinaryStringsExtractor_hexOffset } from "@dude/tool-engine/tools/binary-strings-extractor/binary-strings-extractor.embedded-engine";
import { Component, computed, effect, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { BusyIndicator } from '../../shared/components/busy-indicator/busy-indicator';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { FileDrop } from '../../shared/components/file-drop/file-drop';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { WorkerClientService } from '../../core/workers/worker-client.service';
import { WorkerJob } from '../../core/workers/worker-job';
import { BinaryStringsOptions, BinaryStringsReport, extractStringsReport } from "@dude/tool-engine/tools/binary-strings-extractor/binary-strings-extractor-logic";
import { BinaryStringsExtractorWorkerPayload, BinaryStringsExtractorWorkerResult } from "@dude/tool-engine/tools/binary-strings-extractor/binary-strings-extractor-worker-payload";

/** Files above this size run in a Worker instead of blocking the main thread. */
const WORKER_THRESHOLD = 2_000_000;

@Component({
  selector: 'app-binary-strings-extractor',
  imports: [ToolShell, BusyIndicator, ErrorPanel, FileDrop],
  templateUrl: './binary-strings-extractor.html',
})
export class BinaryStringsExtractor {
  private readonly persistence = inject(PersistenceService);
  private readonly workerClient = inject(WorkerClientService);

  protected readonly minLength = this.persistence.signal('binary-strings-extractor', 'min-length', 'local', 4);
  protected readonly includeAscii = this.persistence.signal('binary-strings-extractor', 'include-ascii', 'local', true);
  protected readonly includeUtf16Le = this.persistence.signal('binary-strings-extractor', 'include-utf16le', 'local', true);

  protected readonly fileName = signal<string | null>(null);
  protected readonly rejection = signal<string | null>(null);
  private readonly bytesSignal = signal<Uint8Array | null>(null);
  private readonly jobSignal = signal<WorkerJob<BinaryStringsExtractorWorkerResult> | null>(null);
  protected readonly job = this.jobSignal.asReadonly();

  private readonly options = computed<BinaryStringsOptions>(() => ({
    minLength: Math.max(1, this.minLength()),
    includeAscii: this.includeAscii(),
    includeUtf16Le: this.includeUtf16Le(),
  }));

  protected readonly usesWorker = computed(() => (this.bytesSignal()?.length ?? 0) > WORKER_THRESHOLD);

  private readonly syncReport = computed<BinaryStringsReport | null>(() => {
    const bytes = this.bytesSignal();
    if (!bytes || this.usesWorker()) return null;
    return extractStringsReport(bytes, this.options());
  });

  protected readonly report = computed<BinaryStringsReport | null>(() => (this.usesWorker() ? (this.job()?.result() ?? null) : this.syncReport()));

  constructor() {
    // Dispatches (or re-dispatches, on an option change) a Worker job whenever the
    // selected file crosses the size threshold. `bytes.buffer` is sliced rather than
    // transferred so the main-thread copy survives for the next option change.
    effect((onCleanup) => {
      const bytes = this.bytesSignal();
      if (!bytes || !this.usesWorker()) return;

      const options = this.options();
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

      const job = this.workerClient.run<BinaryStringsExtractorWorkerPayload, BinaryStringsExtractorWorkerResult>(
        () => new Worker(new URL('./binary-strings-extractor.worker', import.meta.url), { type: 'module' }),
        { buffer, options },
        [buffer],
      );
      this.jobSignal.set(job);
      onCleanup(() => job.cancel());
    });
  }

  protected async onFileSelected(file: File): Promise<void> {
    this.job()?.cancel();
    this.jobSignal.set(null);
    this.rejection.set(null);
    this.fileName.set(file.name);

    const buffer = await file.arrayBuffer();
    this.bytesSignal.set(new Uint8Array(buffer));
  }

  protected onRejected(message: string): void {
    this.rejection.set(message);
  }

  protected onMinLengthChange(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(value) && value >= 1) this.minLength.set(Math.floor(value));
  }

  protected toggleAscii(): void {
    this.includeAscii.set(!this.includeAscii());
  }

  protected toggleUtf16Le(): void {
    this.includeUtf16Le.set(!this.includeUtf16Le());
  }
  protected hexOffset = BinaryStringsExtractor_hexOffset;


  protected clear(): void {
    this.job()?.cancel();
    this.jobSignal.set(null);
    this.bytesSignal.set(null);
    this.rejection.set(null);
    this.fileName.set(null);
  }
}
