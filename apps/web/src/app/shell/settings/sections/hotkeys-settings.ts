import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { ErrorPanel } from '../../../shared/components/error-panel/error-panel';
import { ShellChromeService } from '../../../core/platform/shell-chrome.service';
import { SmartPasteHotkeyService } from '../../../core/platform/smart-paste-hotkey.service';
import { QuickLauncherService } from '../../../core/platform/quick-launcher.service';
import { SettingsUnsavedChanges } from '../settings-unsaved-changes';

/** Synthetic ids into the shared draft/saved/error maps. The Smart Paste hotkey (DUDE_PRD.md §21
 *  Phase 24 Item 3) and Quick Launcher hotkey are siblings of, not members of, the clipboard
 *  quick-action list (see apps/desktop/smart-paste-hotkey.ts), so they reuse the same row shape. */
export const SMART_PASTE_HOTKEY_ID = 'smart-paste-hotkey';
export const QUICK_LAUNCHER_HOTKEY_ID = 'quick-launcher-hotkey';

interface HotkeyRow {
  readonly id: string;
  readonly label: string;
  readonly placeholder: string;
}

type SaveResult = { ok: true } | { ok: false; error: string };

/** Settings › Hotkeys (desktop-only): every global hotkey DUDE registers, each with its own Save. */
@Component({
  selector: 'app-hotkeys-settings',
  imports: [ErrorPanel],
  templateUrl: './hotkeys-settings.html',
})
export class HotkeysSettings {
  private readonly shellChrome = inject(ShellChromeService);
  private readonly smartPasteHotkey = inject(SmartPasteHotkeyService);
  private readonly quickLauncher = inject(QuickLauncherService);
  private readonly unsaved = inject(SettingsUnsavedChanges);

  protected readonly rows = signal<readonly HotkeyRow[]>([]);
  protected readonly drafts = signal<Record<string, string>>({});
  protected readonly saved = signal<Record<string, string>>({});
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly message = signal('');

  readonly hasUnsavedChanges = computed(() => {
    const saved = this.saved();
    return Object.entries(this.drafts()).some(([id, draft]) => draft.trim() !== (saved[id] ?? ''));
  });

  constructor() {
    effect(() => this.unsaved.setDirty('hotkeys', this.hasUnsavedChanges()));
    inject(DestroyRef).onDestroy(() => this.unsaved.setDirty('hotkeys', false));
    void this.load();
  }

  private async load(): Promise<void> {
    const [quickActions, smartPaste, quickLauncher] = await Promise.all([
      this.shellChrome.listQuickActions(),
      this.smartPasteHotkey.getHotkey(),
      this.quickLauncher.getHotkey(),
    ]);
    this.rows.set([
      ...quickActions.map((action) => ({ id: action.id, label: action.label, placeholder: 'e.g. Ctrl+Alt+B' })),
      { id: SMART_PASTE_HOTKEY_ID, label: 'Smart Paste (classify clipboard)', placeholder: 'e.g. Ctrl+Alt+V' },
      { id: QUICK_LAUNCHER_HOTKEY_ID, label: 'Quick Launcher', placeholder: 'e.g. Ctrl+Alt+Space' },
    ]);
    const saved = {
      ...Object.fromEntries(quickActions.map((action) => [action.id, action.hotkey ?? ''])),
      [SMART_PASTE_HOTKEY_ID]: smartPaste ?? '',
      [QUICK_LAUNCHER_HOTKEY_ID]: quickLauncher ?? '',
    };
    this.saved.set(saved);
    this.drafts.set({ ...saved });
  }

  protected onDraftInput(id: string, event: Event): void {
    this.drafts.update((drafts) => ({ ...drafts, [id]: (event.target as HTMLInputElement).value }));
  }

  private register(id: string, accelerator: string | null): Promise<SaveResult> {
    if (id === SMART_PASTE_HOTKEY_ID) return this.smartPasteHotkey.setHotkey(accelerator);
    if (id === QUICK_LAUNCHER_HOTKEY_ID) return this.quickLauncher.setHotkey(accelerator);
    return this.shellChrome.setQuickActionHotkey(id, accelerator);
  }

  async save(id: string): Promise<boolean> {
    const accelerator = this.drafts()[id]?.trim() || null;
    this.errors.update((errors) => ({ ...errors, [id]: '' }));

    const result = await this.register(id, accelerator);
    if (!result.ok) {
      const error = result.error === 'registration-failed' ? 'Could not register this hotkey — it may already be in use.' : result.error;
      this.errors.update((errors) => ({ ...errors, [id]: error }));
      return false;
    }

    this.saved.update((saved) => ({ ...saved, [id]: accelerator ?? '' }));
    this.drafts.update((drafts) => ({ ...drafts, [id]: accelerator ?? '' }));
    return true;
  }

  clear(id: string): Promise<boolean> {
    this.drafts.update((drafts) => ({ ...drafts, [id]: '' }));
    return this.save(id);
  }

  /** The default for every global hotkey is "unbound". */
  protected async resetToDefaults(): Promise<void> {
    if (!confirm('Unbind every global hotkey?')) return;
    const results = await Promise.all(this.rows().map((row) => this.clear(row.id)));
    this.message.set(results.every(Boolean) ? 'All hotkeys unbound.' : 'Some hotkeys could not be unbound.');
  }
}
