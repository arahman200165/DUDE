import { Injectable, computed, inject } from '@angular/core';
import { scratchpadCodec } from '@dude/persistence';
import { PersistenceService } from '../persistence/persistence.service';
import {
  EMPTY_SCRATCHPAD_STORE,
  ScratchpadStore,
  WorkspaceSnippet,
  createSnippet,
} from "@dude/domain/core/workspace/scratchpad.model";

/**
 * Manual cross-tool notes/snippets (DUDE_PRD.md §21 Phase 21 Item 4), independent of the
 * automatic per-tool state mirroring `WorkspaceStateService` (Milestone 293) adds — a snippet is
 * always an explicit user action, never captured implicitly. Persists under `'__workspace__'`,
 * the same synthetic pseudo-toolId `WorkspaceLayoutService` uses for layout metadata, so both ride
 * `PersistenceService.clearAll()`'s existing sweep for free.
 */
@Injectable({ providedIn: 'root' })
export class ScratchpadService {
  private readonly persistence = inject(PersistenceService);
  private readonly store = this.persistence.signal<ScratchpadStore>(
    '__workspace__',
    'scratchpad',
    'local',
    EMPTY_SCRATCHPAD_STORE,
    { decode: (raw) => scratchpadCodec.decode(raw) },
  );

  readonly snippets = computed(() => this.store().snippets);
  readonly drawerExpanded = computed(() => this.store().drawerExpanded);

  addSnippet(title: string, body: string, sourceToolId?: string): WorkspaceSnippet {
    const snippet = createSnippet(title, body, sourceToolId);
    this.store.set({ ...this.store(), snippets: [snippet, ...this.store().snippets] });
    return snippet;
  }

  updateSnippet(id: string, patch: Partial<Pick<WorkspaceSnippet, 'title' | 'body'>>): void {
    this.store.set({
      ...this.store(),
      snippets: this.store().snippets.map((snippet) => (snippet.id === id ? { ...snippet, ...patch } : snippet)),
    });
  }

  removeSnippet(id: string): void {
    this.store.set({ ...this.store(), snippets: this.store().snippets.filter((snippet) => snippet.id !== id) });
  }

  setDrawerExpanded(expanded: boolean): void {
    this.store.set({ ...this.store(), drawerExpanded: expanded });
  }

  toggleDrawer(): void {
    this.setDrawerExpanded(!this.drawerExpanded());
  }
}
