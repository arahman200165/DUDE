import { Component, OnDestroy, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { BusyIndicator } from '../../shared/components/busy-indicator/busy-indicator';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { FileDrop } from '../../shared/components/file-drop/file-drop';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { WorkerClientService } from '../../core/workers/worker-client.service';
import { WorkerJob } from '../../core/workers/worker-job';
import { HASH_ALGORITHMS, HashAlgorithm, HashOutput } from '../../../shared-logic/hash-compute';
import { FileHashPayload } from './file-hash-payload';

@Component({
  selector: 'app-file-hash',
  imports: [ToolShell, BusyIndicator, ErrorPanel, FileDrop],
  templateUrl: './file-hash.html',
})
export class FileHash implements OnDestroy {
  private readonly persistence = inject(PersistenceService);
  private readonly workerClient = inject(WorkerClientService);

  protected readonly algorithms = HASH_ALGORITHMS;

  protected readonly algorithmGroups: ReadonlyArray<{
    readonly label: string;
    readonly algorithms: readonly HashAlgorithm[];
  }> = [
    { label: 'Legacy', algorithms: ['MD5', 'SHA-1'] },
    { label: 'SHA-2', algorithms: ['SHA-256', 'SHA-384', 'SHA-512'] },
    { label: 'SHA-3', algorithms: ['SHA3-256', 'SHA3-384', 'SHA3-512'] },
    { label: 'BLAKE', algorithms: ['BLAKE2b', 'BLAKE2s', 'BLAKE3'] },
    { label: 'xxHash', algorithms: ['XXH32', 'XXH64'] },
    { label: 'CRC', algorithms: ['CRC32', 'CRC64'] },
  ];

  protected readonly selectedFile = signal<File | null>(null);
  protected readonly selectedAlgorithms = this.persistence.signal<readonly HashAlgorithm[]>(
    'file-hash',
    'algorithms',
    'local',
    ['SHA-256'],
  );
  protected readonly job = signal<WorkerJob<readonly HashOutput[]> | null>(null);
  protected readonly rejection = signal<string | null>(null);

  protected onFileSelected(file: File): void {
    this.job()?.cancel();
    this.job.set(null);
    this.rejection.set(null);
    this.selectedFile.set(file);
  }

  protected onRejected(message: string): void {
    this.rejection.set(message);
  }

  protected isSelected(algorithm: HashAlgorithm): boolean {
    return this.selectedAlgorithms().includes(algorithm);
  }

  protected toggleAlgorithm(algorithm: HashAlgorithm, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const current = this.selectedAlgorithms();
    this.selectedAlgorithms.set(checked ? [...current, algorithm] : current.filter((a) => a !== algorithm));
  }

  protected async compute(): Promise<void> {
    this.job()?.cancel();

    const file = this.selectedFile();
    if (!file || this.selectedAlgorithms().length === 0) {
      this.job.set(null);
      return;
    }

    const buffer = await file.arrayBuffer();
    const payload: FileHashPayload = { buffer, algorithms: this.selectedAlgorithms() };
    this.job.set(
      this.workerClient.run<FileHashPayload, readonly HashOutput[]>(
        () => new Worker(new URL('./file-hash.worker', import.meta.url), { type: 'module' }),
        payload,
        [buffer],
      ),
    );
  }

  protected cancel(): void {
    this.job()?.cancel();
  }

  protected copy(hex: string): void {
    void navigator.clipboard.writeText(hex);
  }

  ngOnDestroy(): void {
    this.job()?.cancel();
  }
}
