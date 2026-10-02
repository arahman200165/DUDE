import { Component, computed, effect, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { BusyIndicator } from '../../shared/components/busy-indicator/busy-indicator';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { FileDrop } from '../../shared/components/file-drop/file-drop';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { WorkerClientService } from '../../core/workers/worker-client.service';
import { WorkerJob } from '../../core/workers/worker-job';
import { downloadFile } from '../../shared/utils/download-file';
import { HexDumpParseResult, formatHexDump, parseHexDump } from "@dude/tool-engine/tools/hex-dump/hex-dump-codec";
import { HexDumpWorkerPayload, HexDumpWorkerResult } from "@dude/tool-engine/tools/hex-dump/hex-dump-worker-payload";

/** Inputs above this size run in a Worker instead of blocking the main thread. */
const WORKER_THRESHOLD = 500_000;

type Direction = 'toHexDump' | 'toFile';

@Component({
  selector: 'app-hex-dump',
  imports: [ToolShell, BusyIndicator, ErrorPanel, CopyButton, FileDrop],
  templateUrl: './hex-dump.html',
})
export class HexDumpTool {
  private readonly persistence = inject(PersistenceService);
  private readonly workerClient = inject(WorkerClientService);

  protected readonly direction = this.persistence.signal<Direction>('hex-dump', 'direction', 'local', 'toHexDump');
  protected readonly downloadFilename = this.persistence.signal('hex-dump', 'filename', 'local', 'download.bin');
  protected readonly dumpInput = this.persistence.signal('hex-dump', 'dumpInput', 'session', '');
  protected readonly dumpOutput = this.persistence.signal('hex-dump', 'dumpOutput', 'session', '');

  protected readonly selectedFile = signal<File | null>(null);
  protected readonly rejection = signal<string | null>(null);
  private readonly jobSignal = signal<WorkerJob<HexDumpWorkerResult> | null>(null);
  protected readonly job = this.jobSignal.asReadonly();

  protected readonly usesParseWorker = computed(() => this.dumpInput().length > WORKER_THRESHOLD);

  private readonly syncParseResult = computed<HexDumpParseResult | null>(() => {
    if (this.direction() !== 'toFile' || this.usesParseWorker() || this.dumpInput() === '') return null;
    return parseHexDump(this.dumpInput());
  });

  protected readonly parseResult = computed<HexDumpParseResult | null>(() => {
    if (this.direction() !== 'toFile') return null;
    if (!this.usesParseWorker()) return this.syncParseResult();

    const result = this.job()?.result();
    return result && result.direction === 'toFile' ? result.parsed : null;
  });

  constructor() {
    // Pushes a completed toHexDump worker job's result into the persisted output signal.
    effect(() => {
      const result = this.job()?.result();
      if (result && result.direction === 'toHexDump') this.dumpOutput.set(result.dump);
    });

    // Auto-dispatches a parse job to a Worker once the pasted dump crosses the size threshold.
    effect((onCleanup) => {
      if (this.direction() !== 'toFile') return;

      const dumpInput = this.dumpInput();
      if (dumpInput.length <= WORKER_THRESHOLD) return;

      const job = this.workerClient.run<HexDumpWorkerPayload, HexDumpWorkerResult>(
        () => new Worker(new URL('./hex-dump.worker', import.meta.url), { type: 'module' }),
        { direction: 'toFile', dump: dumpInput },
      );
      this.jobSignal.set(job);
      onCleanup(() => job.cancel());
    });
  }

  protected setDirection(direction: Direction): void {
    this.job()?.cancel();
    this.jobSignal.set(null);
    this.rejection.set(null);
    this.selectedFile.set(null);
    this.direction.set(direction);
  }

  protected async onFileSelected(file: File): Promise<void> {
    this.job()?.cancel();
    this.jobSignal.set(null);
    this.rejection.set(null);
    this.selectedFile.set(file);

    const buffer = await file.arrayBuffer();

    if (buffer.byteLength > WORKER_THRESHOLD) {
      this.jobSignal.set(
        this.workerClient.run<HexDumpWorkerPayload, HexDumpWorkerResult>(
          () => new Worker(new URL('./hex-dump.worker', import.meta.url), { type: 'module' }),
          { direction: 'toHexDump', buffer },
          [buffer],
        ),
      );
    } else {
      this.dumpOutput.set(formatHexDump(new Uint8Array(buffer)));
    }
  }

  protected onRejected(message: string): void {
    this.rejection.set(message);
  }

  protected onDumpInputChange(event: Event): void {
    this.dumpInput.set((event.target as HTMLTextAreaElement).value);
  }

  protected onFilenameChange(event: Event): void {
    this.downloadFilename.set((event.target as HTMLInputElement).value);
  }

  protected download(): void {
    const result = this.parseResult();
    if (result?.ok) downloadFile(result.value, this.downloadFilename() || 'download.bin');
  }

  protected clear(): void {
    this.job()?.cancel();
    this.jobSignal.set(null);
    this.rejection.set(null);
    this.selectedFile.set(null);
    this.dumpInput.set('');
    this.dumpOutput.set('');
  }
}
