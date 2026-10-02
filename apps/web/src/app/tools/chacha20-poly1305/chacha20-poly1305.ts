import { Component, computed, effect, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { BusyIndicator } from '../../shared/components/busy-indicator/busy-indicator';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { WorkerClientService } from '../../core/workers/worker-client.service';
import { WorkerJob } from '../../core/workers/worker-job';
import { ChachaVariant, decryptChaCha, DEFAULT_PBKDF2_ITERATIONS, encryptChaCha } from "@dude/tool-engine/tools/chacha20-poly1305/chacha-cipher";
import { ChachaWorkerPayload, ChachaWorkerResult } from "@dude/tool-engine/tools/chacha20-poly1305/chacha-cipher-payload";

type OpMode = 'encrypt' | 'decrypt';

/** Pure-JS ChaCha20 has no native browser backend, so large input is offloaded to a Worker instead of blocking the main thread. */
const WORKER_THRESHOLD = 50_000;

/**
 * Deliberately does not persist the passphrase or plaintext/ciphertext —
 * both are sensitive, mirroring `aes-encrypt-decrypt`'s bare-signal approach.
 * Only the variant and iteration count (non-sensitive UI preferences)
 * persist locally. Key derivation is native Web Crypto (PBKDF2); the AEAD
 * itself runs via `@noble/ciphers` since Web Crypto has no RFC 8439 support
 * — no network involved either way.
 */
@Component({
  selector: 'app-chacha20-poly1305',
  imports: [ToolShell, BusyIndicator, ErrorPanel, CopyButton],
  templateUrl: './chacha20-poly1305.html',
})
export class Chacha20Poly1305 {
  private readonly persistence = inject(PersistenceService);
  private readonly workerClient = inject(WorkerClientService);

  protected readonly opMode = signal<OpMode>('encrypt');
  protected readonly variant = this.persistence.signal<ChachaVariant>(
    'chacha20-poly1305',
    'variant',
    'local',
    'xchacha20poly1305',
  );
  protected readonly iterations = this.persistence.signal<number>(
    'chacha20-poly1305',
    'iterations',
    'local',
    DEFAULT_PBKDF2_ITERATIONS,
  );
  protected readonly showPassphrase = this.persistence.signal<boolean>(
    'chacha20-poly1305',
    'showPassphrase',
    'local',
    false,
  );

  protected readonly passphrase = signal('');
  protected readonly plaintext = signal('');
  protected readonly ciphertextBundle = signal('');

  protected readonly status = signal<'idle' | 'busy'>('idle');
  protected readonly error = signal<string | null>(null);

  private readonly jobSignal = signal<WorkerJob<ChachaWorkerResult> | null>(null);
  protected readonly job = this.jobSignal.asReadonly();

  protected readonly usesWorker = computed(
    () => (this.opMode() === 'encrypt' ? this.plaintext().length : this.ciphertextBundle().length) > WORKER_THRESHOLD,
  );

  constructor() {
    effect(() => {
      const job = this.job();
      if (!job) return;
      const status = job.status();
      if (status === 'done') {
        const result = job.result();
        if (result?.op === 'encrypt') {
          this.ciphertextBundle.set(result.bundle);
        } else if (result?.op === 'decrypt') {
          if (result.result.ok) this.plaintext.set(result.result.plaintext);
          else this.error.set(result.result.error);
        }
        this.status.set('idle');
      } else if (status === 'error') {
        this.error.set(job.error());
        this.status.set('idle');
      }
    });
  }

  protected setOpMode(mode: OpMode): void {
    this.opMode.set(mode);
    this.error.set(null);
  }

  protected setVariant(variant: ChachaVariant): void {
    this.variant.set(variant);
  }

  protected onPassphraseInput(event: Event): void {
    this.passphrase.set((event.target as HTMLInputElement).value);
  }

  protected onPlaintextInput(event: Event): void {
    this.plaintext.set((event.target as HTMLTextAreaElement).value);
  }

  protected onCiphertextInput(event: Event): void {
    this.ciphertextBundle.set((event.target as HTMLTextAreaElement).value);
  }

  protected onIterationsInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(value) && value > 0) this.iterations.set(Math.floor(value));
  }

  protected toggleShowPassphrase(): void {
    this.showPassphrase.update((v) => !v);
  }

  protected async run(): Promise<void> {
    this.jobSignal()?.cancel();
    this.status.set('busy');
    this.error.set(null);

    if (this.usesWorker()) {
      const payload: ChachaWorkerPayload =
        this.opMode() === 'encrypt'
          ? { op: 'encrypt', plaintext: this.plaintext(), passphrase: this.passphrase(), variant: this.variant(), iterations: this.iterations() }
          : { op: 'decrypt', bundle: this.ciphertextBundle(), passphrase: this.passphrase() };

      this.jobSignal.set(
        this.workerClient.run<ChachaWorkerPayload, ChachaWorkerResult>(
          () => new Worker(new URL('./chacha-cipher.worker', import.meta.url), { type: 'module' }),
          payload,
        ),
      );
      return;
    }

    try {
      if (this.opMode() === 'encrypt') {
        const { bundle } = await encryptChaCha(this.plaintext(), this.passphrase(), this.variant(), this.iterations());
        this.ciphertextBundle.set(bundle);
      } else {
        const result = await decryptChaCha(this.ciphertextBundle(), this.passphrase());
        if (result.ok) {
          this.plaintext.set(result.plaintext);
        } else {
          this.error.set(result.error);
        }
      }
    } finally {
      this.status.set('idle');
    }
  }

  protected clear(): void {
    this.jobSignal()?.cancel();
    this.passphrase.set('');
    this.plaintext.set('');
    this.ciphertextBundle.set('');
    this.error.set(null);
    this.status.set('idle');
  }
}
