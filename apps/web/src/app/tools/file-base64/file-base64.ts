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
import { FileDropHandoffService } from '../../core/file-drop-detect/file-drop-handoff.service';
import { FileBase64DecodeResult, decodeBase64ToBytes, encodeFileToBase64 } from "@dude/tool-engine/tools/file-base64/file-base64-codec";
import { FileBase64WorkerPayload, FileBase64WorkerResult } from "@dude/tool-engine/tools/file-base64/file-base64-worker-payload";
import { FileSignature, sniffFileType } from "@dude/tool-engine/tools/file-base64/file-signature";

/** Inputs above this size run in a Worker instead of blocking the main thread. */
const WORKER_THRESHOLD = 2_000_000;

export type FileBase64Direction = 'encode' | 'decode';

@Component({
  selector: 'app-file-base64',
  imports: [ToolShell, BusyIndicator, ErrorPanel, CopyButton, FileDrop],
  templateUrl: './file-base64.html',
})
export class FileBase64 {
  private readonly persistence = inject(PersistenceService);
  private readonly workerClient = inject(WorkerClientService);
  private readonly fileDropHandoff = inject(FileDropHandoffService);

  protected readonly direction = this.persistence.signal<FileBase64Direction>('file-base64', 'direction', 'local', 'encode');
  protected readonly downloadFilename = this.persistence.signal('file-base64', 'filename', 'local', 'download.bin');
  protected readonly base64Output = this.persistence.signal('file-base64', 'output', 'session', '');
  protected readonly base64Input = this.persistence.signal('file-base64', 'input', 'session', '');

  protected readonly selectedFile = signal<File | null>(null);
  /** First 16 bytes of the selected file, captured before its buffer may be transferred to a Worker. */
  private readonly selectedFilePrefix = signal<Uint8Array | null>(null);
  protected readonly rejection = signal<string | null>(null);
  private readonly jobSignal = signal<WorkerJob<FileBase64WorkerResult> | null>(null);
  protected readonly job = this.jobSignal.asReadonly();

  private readonly previewUrlSignal = signal<string | null>(null);
  protected readonly previewUrl = this.previewUrlSignal.asReadonly();

  protected readonly sniffedType = computed<FileSignature | null>(() => {
    if (this.direction() === 'encode') {
      const prefix = this.selectedFilePrefix();
      return prefix ? sniffFileType(prefix) : null;
    }
    const result = this.decodeResult();
    return result?.ok ? sniffFileType(result.bytes) : null;
  });

  protected readonly browserReportedType = computed(() => this.selectedFile()?.type || null);

  protected readonly usesDecodeWorker = computed(() => this.base64Input().length > WORKER_THRESHOLD);

  private readonly syncDecodeResult = computed<FileBase64DecodeResult | null>(() => {
    if (this.direction() !== 'decode' || this.usesDecodeWorker() || this.base64Input() === '') return null;
    return decodeBase64ToBytes(this.base64Input());
  });

  protected readonly decodeResult = computed<FileBase64DecodeResult | null>(() => {
    if (this.direction() !== 'decode') return null;
    if (!this.usesDecodeWorker()) return this.syncDecodeResult();

    const result = this.job()?.result();
    return result && result.direction === 'decode' ? result.decoded : null;
  });

  constructor() {
    // Smart File Drop hand-off (DUDE_PRD.md §21 Phase 24 Item 4) -- the encode-mode `app-file-drop`
    // consumes the file itself; a handed-off file always means "encode this," so switch into the
    // mode that renders it regardless of whatever direction was last persisted.
    if (this.fileDropHandoff.has('file-base64')) this.direction.set('encode');

    // Pushes a completed encode worker job's result into the persisted output signal.
    effect(() => {
      const result = this.job()?.result();
      if (result && result.direction === 'encode') this.base64Output.set(result.base64);
    });

    // Auto-dispatches a decode job to a Worker once pasted Base64 crosses the size threshold.
    effect((onCleanup) => {
      if (this.direction() !== 'decode') return;

      const base64Input = this.base64Input();
      if (base64Input.length <= WORKER_THRESHOLD) return;

      const job = this.workerClient.run<FileBase64WorkerPayload, FileBase64WorkerResult>(
        () => new Worker(new URL('./file-base64.worker', import.meta.url), { type: 'module' }),
        { direction: 'decode', base64: base64Input },
      );
      this.jobSignal.set(job);
      onCleanup(() => job.cancel());
    });

    // Builds/revokes an Object URL for an image preview whenever the sniffed
    // type or underlying content changes — the first place this tool manages
    // a browser resource lifecycle, so cleanup on every rerun is essential.
    effect((onCleanup) => {
      const sniffed = this.sniffedType();
      if (!sniffed || !sniffed.mime.startsWith('image/')) {
        this.previewUrlSignal.set(null);
        return;
      }

      const blob: Blob | null =
        this.direction() === 'encode'
          ? this.selectedFile()
          : ((): Blob | null => {
              const result = this.decodeResult();
              return result?.ok ? new Blob([new Uint8Array(result.bytes)], { type: sniffed.mime }) : null;
            })();

      if (!blob) {
        this.previewUrlSignal.set(null);
        return;
      }

      const url = URL.createObjectURL(blob);
      this.previewUrlSignal.set(url);
      onCleanup(() => URL.revokeObjectURL(url));
    });
  }

  protected setDirection(direction: FileBase64Direction): void {
    this.job()?.cancel();
    this.jobSignal.set(null);
    this.rejection.set(null);
    this.selectedFile.set(null);
    this.selectedFilePrefix.set(null);
    this.direction.set(direction);
  }

  protected async onFileSelected(file: File): Promise<void> {
    this.job()?.cancel();
    this.jobSignal.set(null);
    this.rejection.set(null);
    this.selectedFile.set(file);

    const buffer = await file.arrayBuffer();
    this.selectedFilePrefix.set(new Uint8Array(buffer.slice(0, 16)));

    if (buffer.byteLength > WORKER_THRESHOLD) {
      this.jobSignal.set(
        this.workerClient.run<FileBase64WorkerPayload, FileBase64WorkerResult>(
          () => new Worker(new URL('./file-base64.worker', import.meta.url), { type: 'module' }),
          { direction: 'encode', buffer },
          [buffer],
        ),
      );
    } else {
      this.base64Output.set(encodeFileToBase64(buffer));
    }
  }

  protected onRejected(message: string): void {
    this.rejection.set(message);
  }

  protected onBase64InputChange(event: Event): void {
    this.base64Input.set((event.target as HTMLTextAreaElement).value);
  }

  protected onFilenameChange(event: Event): void {
    this.downloadFilename.set((event.target as HTMLInputElement).value);
  }

  protected download(): void {
    const result = this.decodeResult();
    if (result?.ok) downloadFile(result.bytes, this.downloadFilename() || 'download.bin');
  }

  protected clear(): void {
    this.job()?.cancel();
    this.jobSignal.set(null);
    this.rejection.set(null);
    this.selectedFile.set(null);
    this.selectedFilePrefix.set(null);
    this.base64Output.set('');
    this.base64Input.set('');
  }
}
