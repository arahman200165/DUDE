import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { PersistenceService } from '../../core/persistence/persistence.service';
import {
  CountdownAnchor,
  INITIAL_COUNTDOWN,
  INITIAL_STOPWATCH,
  StopwatchAnchor,
  countdownRemainingMs,
  formatClock,
  pauseCountdown as pauseCountdownAnchor,
  pauseStopwatch as pauseStopwatchAnchor,
  resetStopwatch as resetStopwatchAnchor,
  setCountdownDuration,
  startCountdown as startCountdownAnchor,
  startStopwatch as startStopwatchAnchor,
  stopwatchElapsedMs,
  tickCountdown,
} from "@dude/tool-engine/tools/stopwatch-countdown/stopwatch-countdown-logic";

type Mode = 'stopwatch' | 'countdown';

@Component({
  selector: 'app-stopwatch-countdown',
  imports: [ToolShell],
  templateUrl: './stopwatch-countdown.html',
})
export class StopwatchCountdown implements OnInit, OnDestroy {
  private readonly persistence = inject(PersistenceService);
  private intervalId: ReturnType<typeof setInterval> | undefined;

  protected readonly mode = this.persistence.signal<Mode>('stopwatch-countdown', 'mode', 'local', 'stopwatch');
  protected readonly now = signal(Date.now());

  protected readonly stopwatchAnchor = this.persistence.signal<StopwatchAnchor>(
    'stopwatch-countdown',
    'stopwatchAnchor',
    'session',
    INITIAL_STOPWATCH,
  );
  protected readonly countdownAnchor = this.persistence.signal<CountdownAnchor>(
    'stopwatch-countdown',
    'countdownAnchor',
    'session',
    INITIAL_COUNTDOWN,
  );

  protected readonly durationHours = this.persistence.signal('stopwatch-countdown', 'durationHours', 'session', 0);
  protected readonly durationMinutes = this.persistence.signal('stopwatch-countdown', 'durationMinutes', 'session', 5);
  protected readonly durationSeconds = this.persistence.signal('stopwatch-countdown', 'durationSeconds', 'session', 0);

  protected readonly configuredDurationMs = computed(
    () => (this.durationHours() * 3600 + this.durationMinutes() * 60 + this.durationSeconds()) * 1000,
  );

  protected readonly stopwatchDisplay = computed(() => formatClock(stopwatchElapsedMs(this.stopwatchAnchor(), this.now())));

  protected readonly countdownRemaining = computed(() => countdownRemainingMs(this.countdownAnchor(), this.now()));
  protected readonly countdownDisplay = computed(() => formatClock(this.countdownRemaining()));
  protected readonly countdownFinished = computed(
    () => !this.countdownAnchor().running && this.countdownRemaining() === 0 && this.configuredDurationMs() > 0,
  );

  ngOnInit(): void {
    this.intervalId = setInterval(() => {
      const nowMs = Date.now();
      this.now.set(nowMs);
      this.countdownAnchor.update((anchor) => tickCountdown(anchor, nowMs));
    }, 250);
  }

  ngOnDestroy(): void {
    if (this.intervalId !== undefined) clearInterval(this.intervalId);
  }

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
  }

  protected startStopwatch(): void {
    this.stopwatchAnchor.update((anchor) => startStopwatchAnchor(anchor, Date.now()));
  }

  protected pauseStopwatch(): void {
    this.stopwatchAnchor.update((anchor) => pauseStopwatchAnchor(anchor, Date.now()));
  }

  protected resetStopwatch(): void {
    this.stopwatchAnchor.set(resetStopwatchAnchor());
  }

  protected onDurationHoursChange(event: Event): void {
    this.durationHours.set(Number((event.target as HTMLInputElement).value));
  }

  protected onDurationMinutesChange(event: Event): void {
    this.durationMinutes.set(Number((event.target as HTMLInputElement).value));
  }

  protected onDurationSecondsChange(event: Event): void {
    this.durationSeconds.set(Number((event.target as HTMLInputElement).value));
  }

  protected applyDuration(): void {
    this.countdownAnchor.set(setCountdownDuration(this.configuredDurationMs()));
  }

  protected startCountdown(): void {
    this.countdownAnchor.update((anchor) => startCountdownAnchor(anchor, Date.now()));
  }

  protected pauseCountdown(): void {
    this.countdownAnchor.update((anchor) => pauseCountdownAnchor(anchor, Date.now()));
  }

  protected resetCountdown(): void {
    this.countdownAnchor.set(setCountdownDuration(this.configuredDurationMs()));
  }
}
