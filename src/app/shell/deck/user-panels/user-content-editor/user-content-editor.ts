import { Component, computed, inject, input, output, signal } from '@angular/core';
import {
  MAX_PANEL_LINKS,
  MAX_SHORTCUTS,
  MAX_TEXT_CHARS,
  MAX_USER_TITLE_CHARS,
  SHORTCUT_TARGET_KINDS,
  ShortcutTargetKind,
  UserContent,
} from '../../../../core/home-layout/user-content.model';
import { MAX_LABEL_CHARS, MAX_URL_CHARS, validateLink } from '../../../../core/home-panel/home-panel.model';
import { ShortcutOption, ShortcutResolverService } from '../shortcut-resolver.service';

const KIND_LABELS: Record<ShortcutTargetKind, string> = {
  tool: 'Tool',
  destination: 'App page',
  settings: 'Settings section',
  command: 'Action',
};

/**
 * Edits one user-authored panel's content (text, links or shortcuts). Emits the full new content on
 * every change; the caller decides whether that goes straight to the store (Home) or into a draft
 * (Settings). Everything is plain text — nothing entered here is ever rendered as markup — and links
 * are validated to http(s) before they are emitted. Adding a shortcut only *references* its target.
 */
@Component({
  selector: 'app-user-content-editor',
  templateUrl: './user-content-editor.html',
})
export class UserContentEditor {
  private readonly resolver = inject(ShortcutResolverService);

  readonly content = input.required<UserContent>();
  readonly contentChange = output<UserContent>();

  protected readonly maxTitle = MAX_USER_TITLE_CHARS;
  protected readonly maxText = MAX_TEXT_CHARS;
  protected readonly maxLabel = MAX_LABEL_CHARS;
  protected readonly maxUrl = MAX_URL_CHARS;
  protected readonly maxLinks = MAX_PANEL_LINKS;
  protected readonly maxShortcuts = MAX_SHORTCUTS;
  protected readonly targetKinds = SHORTCUT_TARGET_KINDS;
  protected readonly kindLabels = KIND_LABELS;

  protected readonly error = signal<string | null>(null);
  protected readonly pickKind = signal<ShortcutTargetKind>('tool');
  protected readonly pickQuery = signal('');
  protected readonly pickOptions = computed<readonly ShortcutOption[]>(() => this.resolver.options(this.pickKind(), this.pickQuery()));

  protected readonly textContent = computed(() => (this.content().kind === 'text' ? (this.content() as Extract<UserContent, { kind: 'text' }>) : null));
  protected readonly linkContent = computed(() => (this.content().kind === 'link' ? (this.content() as Extract<UserContent, { kind: 'link' }>) : null));
  protected readonly shortcutContent = computed(() => (this.content().kind === 'shortcut' ? (this.content() as Extract<UserContent, { kind: 'shortcut' }>) : null));

  protected onTitle(event: Event): void {
    this.contentChange.emit({ ...this.content(), title: (event.target as HTMLInputElement).value.slice(0, MAX_USER_TITLE_CHARS) });
  }

  protected onText(event: Event): void {
    const text = this.textContent();
    if (text) this.contentChange.emit({ ...text, text: (event.target as HTMLTextAreaElement).value.slice(0, MAX_TEXT_CHARS) });
  }

  protected addLink(label: HTMLInputElement, url: HTMLInputElement): void {
    const content = this.linkContent();
    if (!content) return;
    if (content.links.length >= MAX_PANEL_LINKS) {
      this.error.set(`You can keep up to ${MAX_PANEL_LINKS} links in a panel.`);
      return;
    }
    const checked = validateLink(label.value, url.value);
    if (!checked.ok) {
      this.error.set(checked.error);
      return;
    }
    if (content.links.some((l) => l.url === checked.link.url)) {
      this.error.set('That link is already saved.');
      return;
    }
    this.error.set(null);
    this.contentChange.emit({ ...content, links: [...content.links, { id: crypto.randomUUID(), ...checked.link }] });
    label.value = '';
    url.value = '';
  }

  protected removeLink(id: string): void {
    const content = this.linkContent();
    if (content) this.contentChange.emit({ ...content, links: content.links.filter((l) => l.id !== id) });
  }

  protected setPickKind(event: Event): void {
    this.pickKind.set((event.target as HTMLSelectElement).value as ShortcutTargetKind);
    this.pickQuery.set('');
  }

  protected onPickQuery(event: Event): void {
    this.pickQuery.set((event.target as HTMLInputElement).value);
  }

  protected addShortcut(option: ShortcutOption): void {
    const content = this.shortcutContent();
    if (!content) return;
    const kind = this.pickKind();
    if (content.targets.length >= MAX_SHORTCUTS) {
      this.error.set(`You can keep up to ${MAX_SHORTCUTS} shortcuts in a panel.`);
      return;
    }
    if (content.targets.some((t) => t.kind === kind && t.ref === option.ref)) {
      this.error.set('That shortcut is already in this panel.');
      return;
    }
    this.error.set(null);
    this.contentChange.emit({ ...content, targets: [...content.targets, { id: crypto.randomUUID(), kind, ref: option.ref, label: '' }] });
  }

  protected removeShortcut(id: string): void {
    const content = this.shortcutContent();
    if (content) this.contentChange.emit({ ...content, targets: content.targets.filter((t) => t.id !== id) });
  }

  protected titleOf(target: { kind: ShortcutTargetKind; ref: string; id: string; label: string }): string {
    return target.label || this.resolver.resolve(target).title;
  }
}
