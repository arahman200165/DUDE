import { Injectable } from '@angular/core';

/**
 * One-shot, in-memory-only hand-off from a Pipeline Suggestion banner's "Save as pipeline" button
 * to a freshly-created draft in the Pipeline Builder (`/pipelines/new`) — mirrors
 * `core/paste-detect/paste-handoff.service.ts`'s shape exactly. Never persisted: a suggestion that
 * is offered but never consumed (the user navigates away first) simply vanishes.
 */
@Injectable({ providedIn: 'root' })
export class PipelineSuggestionHandoffService {
  private pending: readonly string[] | null = null;

  offer(toolIds: readonly string[]): void {
    this.pending = toolIds;
  }

  consume(): readonly string[] | null {
    const value = this.pending;
    this.pending = null;
    return value;
  }
}
