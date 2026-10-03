import { signal } from '@angular/core';

export interface HubWebToast {
  readonly id: number;
  readonly text: string;
  readonly kind: 'info' | 'error';
}

export type HubConflictChoice = 'hub' | 'mine' | 'both';

/** One unresolved revision conflict waiting for the owner (PD-052: asked at once, nothing is parked). */
export interface HubConflictRequest {
  readonly id: number;
  readonly entityType: string;
  readonly entityId: string;
  readonly name: string | null;
  readonly fields: readonly string[];
  readonly mine: unknown;
  readonly theirs: unknown;
  readonly canKeepBoth: boolean;
  readonly resolve: (choice: HubConflictChoice) => void;
}

const TOAST_MS = 6000;

/**
 * Notices and conflict prompts for the Hub web sync. A plain class (created before bootstrap, then provided) so the
 * sync engine can raise them without Angular; the overlay component renders both signals.
 */
export class HubWebFeedback {
  readonly toasts = signal<readonly HubWebToast[]>([]);
  readonly conflicts = signal<readonly HubConflictRequest[]>([]);
  private next = 1;

  notify(text: string, kind: 'info' | 'error' = 'error'): void {
    if (this.toasts().some((t) => t.text === text)) return;
    const id = this.next++;
    this.toasts.update((list) => [...list, { id, text, kind }].slice(-4));
    setTimeout(() => this.dismiss(id), TOAST_MS);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  askConflict(request: Omit<HubConflictRequest, 'id' | 'resolve'>): Promise<HubConflictChoice> {
    return new Promise((resolve) => {
      const id = this.next++;
      this.conflicts.update((list) => [
        ...list,
        { ...request, id, resolve: (choice) => { this.conflicts.update((l) => l.filter((c) => c.id !== id)); resolve(choice); } },
      ]);
    });
  }
}
