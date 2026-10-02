import { Component, Injector, OnDestroy, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, firstValueFrom } from 'rxjs';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { WorkerClientService } from '../../core/workers/worker-client.service';
import { findCatastrophicBacktrackingRisks } from "@dude/tool-engine/tools/regex-benchmark/regex-catastrophic-heuristic";
import { BenchmarkPayload, BenchmarkTimingResult } from "@dude/tool-engine/tools/regex-benchmark/regex-benchmark-run";

type SampleOutcome = 'ok' | 'timeout' | 'error';

export interface BenchmarkSampleResult {
  readonly sample: string;
  readonly outcome: SampleOutcome;
  readonly ms: number | null;
  readonly message: string | null;
}

const DEFAULT_TIMEOUT_MS = 1000;

/**
 * Dispatches one worker per sample (not one worker looping all samples) —
 * the shared worker protocol's `progress` channel is just a number, with no
 * room for a rich per-sample payload, so the only way to keep already-timed
 * samples if a later one hangs is to isolate each sample in its own
 * cancel-able job. `toObservable` + `firstValueFrom` "awaits" each job's
 * settlement without needing an effect-driven recursive state machine.
 */
@Component({
  selector: 'app-regex-benchmark',
  imports: [ToolShell, DecimalPipe],
  templateUrl: './regex-benchmark.html',
})
export class RegexBenchmark implements OnDestroy {
  private readonly persistence = inject(PersistenceService);
  private readonly workerClient = inject(WorkerClientService);
  private readonly injector = inject(Injector);
  private timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  private cancelRequested = false;

  protected readonly pattern = this.persistence.signal('regex-benchmark', 'pattern', 'session', '(a+)+$');
  protected readonly flags = this.persistence.signal('regex-benchmark', 'flags', 'session', '');
  protected readonly samplesRaw = this.persistence.signal(
    'regex-benchmark',
    'samplesRaw',
    'session',
    'aaaaaaaaaaaaaaaaaaaa\naaaaaaaaaaaaaaaaaaaa!',
  );
  protected readonly timeoutMs = this.persistence.signal('regex-benchmark', 'timeoutMs', 'local', DEFAULT_TIMEOUT_MS);

  protected readonly risks = computed(() => findCatastrophicBacktrackingRisks(this.pattern(), this.flags()));

  protected readonly running = signal(false);
  protected readonly results = signal<readonly BenchmarkSampleResult[]>([]);
  protected readonly currentSampleIndex = signal<number | null>(null);

  protected onPatternInput(event: Event): void {
    this.pattern.set((event.target as HTMLInputElement).value);
  }

  protected onFlagsInput(event: Event): void {
    this.flags.set((event.target as HTMLInputElement).value);
  }

  protected onSamplesInput(event: Event): void {
    this.samplesRaw.set((event.target as HTMLTextAreaElement).value);
  }

  protected onTimeoutInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(value) && value > 0) this.timeoutMs.set(value);
  }

  protected async run(): Promise<void> {
    const samples = this.samplesRaw()
      .split('\n')
      .map((s) => s.replace(/\r$/, ''))
      .filter((s) => s !== '');

    this.cancelRequested = false;
    this.running.set(true);
    this.results.set([]);

    for (let i = 0; i < samples.length; i++) {
      if (this.cancelRequested) break;

      this.currentSampleIndex.set(i);
      const outcome = await this.runOneSample(samples[i]);
      this.results.update((results) => [...results, outcome]);
    }

    this.currentSampleIndex.set(null);
    this.running.set(false);
  }

  protected cancel(): void {
    this.cancelRequested = true;
    if (this.timeoutHandle !== undefined) clearTimeout(this.timeoutHandle);
  }

  private async runOneSample(sample: string): Promise<BenchmarkSampleResult> {
    const payload: BenchmarkPayload = { pattern: this.pattern(), flags: this.flags(), sample };
    const job = this.workerClient.run<BenchmarkPayload, BenchmarkTimingResult>(
      () => new Worker(new URL('./regex-benchmark.worker', import.meta.url), { type: 'module' }),
      payload,
    );

    this.timeoutHandle = setTimeout(() => job.cancel(), this.timeoutMs());
    const status = await firstValueFrom(toObservable(job.status, { injector: this.injector }).pipe(filter((s) => s !== 'running')));
    if (this.timeoutHandle !== undefined) clearTimeout(this.timeoutHandle);

    if (status === 'cancelled') {
      return { sample, outcome: 'timeout', ms: null, message: `Exceeded ${this.timeoutMs()}ms — terminated.` };
    }
    if (status === 'error') {
      return { sample, outcome: 'error', ms: null, message: job.error() };
    }

    const result = job.result();
    if (result && result.ok) return { sample, outcome: 'ok', ms: result.ms, message: result.matched ? 'matched' : 'no match' };
    return { sample, outcome: 'error', ms: null, message: result && !result.ok ? result.error : 'Unknown error.' };
  }

  ngOnDestroy(): void {
    this.cancelRequested = true;
    if (this.timeoutHandle !== undefined) clearTimeout(this.timeoutHandle);
  }
}
