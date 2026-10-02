import { Injectable, inject } from '@angular/core';
import { PersistenceService } from '../persistence/persistence.service';

/**
 * Tracks which Pipeline Suggestions the user has already dismissed, keyed by `suggestionKey(...)`
 * (`pipeline-suggestions.ts`) — a stable, order-sensitive join of the sequence's tool ids. Small,
 * bounded, `local`-policy list under the synthetic pseudo-tool-id `'__suggestions__'`, the same
 * pattern `'__usage__'`/`'__favorites__'` already use.
 */
@Injectable({ providedIn: 'root' })
export class SuggestionDismissalService {
  private readonly persistence = inject(PersistenceService);
  private readonly dismissed = this.persistence.signal<readonly string[]>(
    '__suggestions__',
    'dismissedPipelineSuggestions',
    'local',
    [],
  );

  isDismissed(key: string): boolean {
    return this.dismissed().includes(key);
  }

  dismiss(key: string): void {
    if (!this.isDismissed(key)) this.dismissed.set([...this.dismissed(), key]);
  }
}
