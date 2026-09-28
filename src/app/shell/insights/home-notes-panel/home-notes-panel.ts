import { Component, computed, inject, signal } from '@angular/core';
import { HomePanelService } from '../../../core/home-panel/home-panel.service';
import { MAX_LABEL_CHARS, MAX_LINKS, MAX_NOTE_CHARS, MAX_URL_CHARS } from '../../../core/home-panel/home-panel.model';
import { PlatformService } from '../../../core/platform/platform.service';
import { CopyButton } from '../../../shared/components/copy-button/copy-button';
import { DashboardPanel } from '../../../shared/components/dashboard-panel/dashboard-panel';

/**
 * Home "Notes & links" (DUDE_PRD.md §21 Phase 30H.6) — one plain-text note and a few saved links,
 * the user's own content. The editor says where it lives: on this device only, never sent, part of
 * backups, removed by "Clear all local data". On the web a saved link is a plain anchor (opening it
 * is an explicit click that contacts that site); Desktop DUDE denies window opens, so there each
 * link is shown as text with a copy button instead.
 */
@Component({
  selector: 'app-home-notes-panel',
  imports: [DashboardPanel, CopyButton],
  templateUrl: './home-notes-panel.html',
})
export class HomeNotesPanel {
  private readonly panel = inject(HomePanelService);
  protected readonly platform = inject(PlatformService);

  protected readonly note = this.panel.note;
  protected readonly links = this.panel.links;
  protected readonly hasContent = this.panel.hasContent;

  protected readonly editing = signal(false);
  protected readonly linkError = signal<string | null>(null);

  protected readonly maxNote = MAX_NOTE_CHARS;
  protected readonly maxLabel = MAX_LABEL_CHARS;
  protected readonly maxUrl = MAX_URL_CHARS;
  protected readonly maxLinks = MAX_LINKS;
  protected readonly atLinkLimit = computed(() => this.links().length >= MAX_LINKS);

  protected startEditing(): void {
    this.linkError.set(null);
    this.editing.set(true);
  }

  protected stopEditing(): void {
    this.editing.set(false);
  }

  protected onNoteInput(event: Event): void {
    this.panel.setNote((event.target as HTMLTextAreaElement).value);
  }

  protected addLink(label: HTMLInputElement, url: HTMLInputElement): void {
    const result = this.panel.addLink(label.value, url.value);
    if (!result.ok) {
      this.linkError.set(result.error);
      return;
    }
    this.linkError.set(null);
    label.value = '';
    url.value = '';
  }

  protected removeLink(id: string): void {
    this.panel.removeLink(id);
  }
}
