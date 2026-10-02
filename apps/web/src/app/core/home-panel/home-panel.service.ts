import { Injectable, computed, inject } from '@angular/core';
import { PersistenceService } from '../persistence/persistence.service';
import {
  EMPTY_HOME_PANEL_STORE,
  HomePanelContent,
  MAX_LINKS,
  MAX_NOTE_CHARS,
  hasHomePanelContent,
  migrateHomePanelStore,
  sanitizeHomePanel,
  validateLink,
} from "@dude/domain/core/home-panel/home-panel.model";

export type AddLinkResult = { readonly ok: true } | { readonly ok: false; readonly error: string };

/**
 * Store for the Home note + links panel (DUDE_PRD.md §21 Phase 30H.6). `'__home__'` is a synthetic
 * pseudo-tool-id like `'__favorites__'`/`'__usage__'`, so `PersistenceService.clearAll()` wipes it
 * for free. Unlike usage data it is exported in the backup bundle (`core/backup/`): it is the user's
 * own authored content. It is never sent anywhere. See `AGENTS.md` in this directory.
 */
@Injectable({ providedIn: 'root' })
export class HomePanelService {
  private readonly persistence = inject(PersistenceService);
  private readonly store = this.persistence.signal('__home__', 'panel', 'local', EMPTY_HOME_PANEL_STORE, { crossTab: 'live' });

  constructor() {
    const migrated = migrateHomePanelStore(this.store());
    if (JSON.stringify(migrated) !== JSON.stringify(this.store())) this.store.set(migrated);
  }

  readonly note = computed(() => this.store().note);
  readonly links = computed(() => this.store().links);
  readonly content = computed<HomePanelContent>(() => ({ note: this.store().note, links: this.store().links }));
  readonly hasContent = computed(() => hasHomePanelContent(this.content()));

  setNote(text: string): void {
    this.store.set({ ...this.store(), note: text.slice(0, MAX_NOTE_CHARS) });
  }

  addLink(label: string, url: string): AddLinkResult {
    if (this.store().links.length >= MAX_LINKS) return { ok: false, error: `You can keep up to ${MAX_LINKS} links.` };
    const checked = validateLink(label, url);
    if (!checked.ok) return checked;
    if (this.store().links.some((link) => link.url === checked.link.url)) return { ok: false, error: 'That link is already saved.' };
    this.store.set({ ...this.store(), links: [...this.store().links, { id: crypto.randomUUID(), ...checked.link }] });
    return { ok: true };
  }

  removeLink(id: string): void {
    this.store.set({ ...this.store(), links: this.store().links.filter((link) => link.id !== id) });
  }

  /** Backup import: re-sanitizes, so nothing outside the panel's own bounds can be stored. */
  importContent(content: HomePanelContent): void {
    this.store.set({ schemaVersion: 1, ...sanitizeHomePanel(content) });
  }
}
