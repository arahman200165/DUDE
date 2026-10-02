import { Component, OnDestroy, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { BusyIndicator } from '../../shared/components/busy-indicator/busy-indicator';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { WorkerClientService } from '../../core/workers/worker-client.service';
import { WorkerJob } from '../../core/workers/worker-job';
import { HASH_ALGORITHMS, HashAlgorithm, HashOutput } from "@dude/crypto/hash-compute";
import { HashComputePayload } from "@dude/tool-engine/tools/hash/hash-compute-payload";

@Component({
  selector: 'app-hash',
  imports: [ToolShell, BusyIndicator, ErrorPanel],
  templateUrl: './hash.html',
})
export class Hash implements OnDestroy {
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

  protected readonly text = this.persistence.signal('hash', 'text', 'session', '');
  protected readonly selectedAlgorithms = this.persistence.signal<readonly HashAlgorithm[]>(
    'hash',
    'algorithms',
    'local',
    ['SHA-256'],
  );
  protected readonly job = signal<WorkerJob<readonly HashOutput[]> | null>(null);

  protected onTextInput(event: Event): void {
    this.text.set((event.target as HTMLTextAreaElement).value);
  }

  protected isSelected(algorithm: HashAlgorithm): boolean {
    return this.selectedAlgorithms().includes(algorithm);
  }

  protected toggleAlgorithm(algorithm: HashAlgorithm, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const current = this.selectedAlgorithms();
    this.selectedAlgorithms.set(checked ? [...current, algorithm] : current.filter((a) => a !== algorithm));
  }

  protected compute(): void {
    this.job()?.cancel();

    if (this.text() === '' || this.selectedAlgorithms().length === 0) {
      this.job.set(null);
      return;
    }

    const payload: HashComputePayload = { text: this.text(), algorithms: this.selectedAlgorithms() };
    this.job.set(
      this.workerClient.run<HashComputePayload, readonly HashOutput[]>(
        () => new Worker(new URL('./hash-compute.worker', import.meta.url), { type: 'module' }),
        payload,
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
