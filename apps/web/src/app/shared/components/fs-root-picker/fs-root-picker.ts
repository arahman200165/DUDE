import { Component, computed, inject, input, model, output, signal } from '@angular/core';
import { NativeFsService } from '../../../core/platform/native-fs.service';
import { RememberedFoldersService } from '../../../core/platform/remembered-folders.service';

export interface PickedRoot {
  readonly path: string;
  readonly name: string;
  /** File mode only. */
  readonly size?: number;
}

/**
 * The Phase 29 folder/file chooser (Milestone 523). Every root a tree tool works on comes through
 * here: the native picker (which is what grants access), a remembered folder (re-granted on launch),
 * or a typed path — which only opens the picker pre-navigated there, because a typed path is never
 * granted without the user confirming it in the OS dialog. "Remember" persists the grant across
 * restarts and is revocable from Settings → Batch Operations.
 */
@Component({
  selector: 'app-fs-root-picker',
  template: `
    <div class="flex flex-wrap items-center gap-2 text-ui">
      <span class="text-text-muted">{{ label() }}</span>
      <button type="button" class="rounded-sm border border-accent px-2 py-1 text-accent" (click)="pick()">{{ mode() === 'file' ? 'Pick file…' : 'Pick folder…' }}</button>
      @if (mode() === 'directory' && rememberedOptions().length) {
        <select class="rounded-sm border border-border bg-panel px-2 py-1 text-text" aria-label="Remembered folders" (change)="useRemembered($event)">
          <option value="">Remembered…</option>
          @for (folder of rememberedOptions(); track folder.path) {
            <option [value]="folder.path" [disabled]="!folder.available">{{ folder.name }}{{ folder.available ? '' : ' (missing)' }} — {{ folder.path }}</option>
          }
        </select>
      }
      <input
        class="min-w-48 flex-1 rounded-sm border border-border bg-panel px-2 py-1 font-mono text-text"
        [placeholder]="mode() === 'file' ? 'or type a file path, then confirm in the picker' : 'or type a path, then confirm in the picker'"
        [value]="typed()"
        (input)="typed.set($any($event.target).value)"
        (keydown.enter)="pick(typed())"
        aria-label="Path to confirm in the native picker"
      />
      @if (typed().trim()) {
        <button type="button" class="rounded-sm border border-border px-2 py-1 text-text" (click)="pick(typed())">Confirm…</button>
      }
    </div>
    @if (root()) {
      <div class="mt-1 flex flex-wrap items-center gap-3 text-ui-xs text-text-muted">
        <span>Granted: <span class="font-mono text-text" data-testid="fs-root">{{ root() }}</span></span>
        @if (mode() === 'directory' && remembered.available) {
          <label class="flex items-center gap-1">
            <input type="checkbox" [checked]="isRemembered()" (change)="toggleRemember($event)" />
            Remember this folder across restarts
          </label>
        }
      </div>
    }
    @if (error(); as message) { <div role="alert" class="mt-1 text-ui-xs text-error">{{ message }}</div> }
  `,
})
export class FsRootPicker {
  private readonly nativeFs = inject(NativeFsService);
  protected readonly remembered = inject(RememberedFoldersService);

  readonly mode = input<'directory' | 'file'>('directory');
  readonly label = input('Folder');
  readonly root = model('');
  readonly picked = output<PickedRoot>();

  protected readonly typed = signal('');
  protected readonly error = signal('');
  protected readonly rememberedOptions = computed(() => this.remembered.folders());
  protected readonly isRemembered = computed(() => {
    const key = this.root().toLowerCase();
    return this.remembered.folders().some((folder) => folder.path.toLowerCase() === key);
  });

  constructor() {
    void this.remembered.refresh();
  }

  protected async pick(defaultPath?: string): Promise<void> {
    this.error.set('');
    try {
      const path = defaultPath?.trim() || undefined;
      if (this.mode() === 'file') {
        const result = await this.nativeFs.pickFile(path);
        if (result.canceled) return;
        this.set({ path: result.path, name: result.name, size: result.size });
      } else {
        const result = await this.nativeFs.pickDirectory(path);
        if (result.canceled) return;
        this.set({ path: result.rootPath, name: result.rootName });
      }
      this.typed.set('');
    } catch (caught) {
      this.error.set(caught instanceof Error ? caught.message : String(caught));
    }
  }

  protected useRemembered(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const folder = this.remembered.folders().find((item) => item.path === select.value);
    select.value = '';
    if (folder?.available) this.set({ path: folder.path, name: folder.name });
  }

  protected async toggleRemember(event: Event): Promise<void> {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      if (!(await this.remembered.remember(this.root()))) this.error.set(this.remembered.error());
    } else await this.remembered.forget(this.root());
  }

  private set(root: PickedRoot): void {
    this.root.set(root.path);
    this.picked.emit(root);
  }
}
