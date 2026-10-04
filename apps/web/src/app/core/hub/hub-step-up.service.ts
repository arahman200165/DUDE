import { Injectable, computed, signal, type Signal } from '@angular/core';

/** One password prompt waiting for the owner; `resolve(null)` means it was cancelled. */
export interface StepUpRequest {
  readonly message: string | null;
  resolve(password: string | null): void;
}

/**
 * Asks the owner to re-enter the password for a guarded Hub action (owner step-up). Prompts are shown one at a time,
 * oldest first: `pending` is the head of the queue and the next one appears once it is answered.
 */
@Injectable({ providedIn: 'root' })
export class HubStepUpService {
  private readonly queue = signal<readonly StepUpRequest[]>([]);
  readonly pending: Signal<StepUpRequest | null> = computed(() => this.queue()[0] ?? null);

  ask(message?: string): Promise<string | null> {
    return new Promise((resolve) => {
      const request: StepUpRequest = {
        message: message ?? null,
        resolve: (password) => {
          this.queue.update((list) => list.filter((r) => r !== request));
          resolve(password);
        },
      };
      this.queue.update((list) => [...list, request]);
    });
  }
}
