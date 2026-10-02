import { Component, computed, input, model } from '@angular/core';
import type { WalkOptions } from "@dude/contracts/fs/fs-types";
import { DEFAULT_EXCLUDES, describeWalkOptions } from "@dude/tool-engine/shared/fs/walk-filter";

type Flag = 'useGitignore' | 'useDefaultExcludes' | 'skipHidden' | 'skipDotfiles' | 'followLinks';

/**
 * Shared ignore/exclusion controls for every Phase 29 tree tool (Milestone 523): nested
 * `.gitignore`, the editable default-exclude preset, include/exclude globs, Windows hidden/system
 * skip, dotfiles, link following, depth, and size/age filters. The one-line summary is always
 * visible so what a run (and especially a mutation) will skip is never hidden behind the fold.
 */
@Component({
  selector: 'app-walk-options',
  template: `
    <details class="rounded-sm border border-border bg-panel text-ui">
      <summary class="cursor-pointer px-2 py-1 text-text-muted" data-testid="walk-summary">Filters — {{ summary() }}</summary>
      <div class="grid gap-2 border-t border-border p-2 md:grid-cols-2">
        <div class="flex flex-col gap-1">
          @for (flag of flags; track flag.key) {
            <label class="flex items-center gap-2 text-text"><input type="checkbox" [checked]="options()[flag.key]" (change)="setFlag(flag.key, $event)" /> {{ flag.label }}</label>
          }
        </div>
        <div class="flex flex-col gap-1">
          <label class="flex flex-col gap-0.5 text-text-muted">Include files (globs, comma-separated)
            <input class="rounded-sm border border-border bg-panel px-2 py-1 font-mono text-text" [value]="options().include.join(', ')" (change)="setList('include', $event)" placeholder="*.ts, docs/**/*.md" />
          </label>
          <label class="flex flex-col gap-0.5 text-text-muted">Exclude (names or paths)
            <input class="rounded-sm border border-border bg-panel px-2 py-1 font-mono text-text" [value]="options().exclude.join(', ')" (change)="setList('exclude', $event)" placeholder="dist, *.min.js, vendor/**" />
          </label>
          @if (options().useDefaultExcludes && showPreset()) {
            <label class="flex flex-col gap-0.5 text-text-muted">Default excludes
              <input class="rounded-sm border border-border bg-panel px-2 py-1 font-mono text-text" [value]="(options().defaultExcludes ?? defaults).join(', ')" (change)="setList('defaultExcludes', $event)" />
            </label>
          }
          <div class="flex flex-wrap gap-2">
            <label class="flex flex-col gap-0.5 text-text-muted">Max depth
              <input type="number" min="0" class="w-20 rounded-sm border border-border bg-panel px-2 py-1 text-text" [value]="options().maxDepth ?? ''" (change)="setNumber('maxDepth', $event)" />
            </label>
            @if (showSizeAge()) {
              <label class="flex flex-col gap-0.5 text-text-muted">Min size (bytes)
                <input type="number" min="0" class="w-28 rounded-sm border border-border bg-panel px-2 py-1 text-text" [value]="options().minSize ?? ''" (change)="setNumber('minSize', $event)" />
              </label>
              <label class="flex flex-col gap-0.5 text-text-muted">Max size (bytes)
                <input type="number" min="0" class="w-28 rounded-sm border border-border bg-panel px-2 py-1 text-text" [value]="options().maxSize ?? ''" (change)="setNumber('maxSize', $event)" />
              </label>
              <label class="flex flex-col gap-0.5 text-text-muted">Modified after
                <input type="date" class="rounded-sm border border-border bg-panel px-2 py-1 text-text" [value]="dateValue(options().modifiedAfter)" (change)="setDate('modifiedAfter', $event)" />
              </label>
              <label class="flex flex-col gap-0.5 text-text-muted">Modified before
                <input type="date" class="rounded-sm border border-border bg-panel px-2 py-1 text-text" [value]="dateValue(options().modifiedBefore)" (change)="setDate('modifiedBefore', $event)" />
              </label>
            }
          </div>
        </div>
      </div>
    </details>
  `,
})
export class WalkOptionsPanel {
  readonly options = model.required<WalkOptions>();
  readonly showSizeAge = input(true);
  readonly showPreset = input(true);
  protected readonly defaults = DEFAULT_EXCLUDES;
  protected readonly summary = computed(() => describeWalkOptions(this.options()));
  protected readonly flags: readonly { key: Flag; label: string }[] = [
    { key: 'useGitignore', label: 'Honor .gitignore files (nested) and .git/info/exclude' },
    { key: 'useDefaultExcludes', label: 'Skip default excludes (.git, node_modules, …)' },
    { key: 'skipHidden', label: 'Skip Windows hidden/system files' },
    { key: 'skipDotfiles', label: 'Skip dotfiles' },
    { key: 'followLinks', label: 'Follow links/junctions that stay inside the folder' },
  ];

  protected setFlag(key: Flag, event: Event): void {
    this.options.update((value) => ({ ...value, [key]: (event.target as HTMLInputElement).checked }));
  }

  protected setList(key: 'include' | 'exclude' | 'defaultExcludes', event: Event): void {
    const list = (event.target as HTMLInputElement).value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
    this.options.update((value) => ({ ...value, [key]: list }));
  }

  protected setNumber(key: 'maxDepth' | 'minSize' | 'maxSize', event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const parsed = raw === '' ? null : Math.max(0, Math.floor(Number(raw)));
    this.options.update((value) => ({ ...value, [key]: Number.isFinite(parsed) ? parsed : null }));
  }

  protected setDate(key: 'modifiedAfter' | 'modifiedBefore', event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const time = raw ? Date.parse(`${raw}T00:00:00`) : NaN;
    this.options.update((value) => ({ ...value, [key]: Number.isFinite(time) ? time : null }));
  }

  protected dateValue(time: number | null | undefined): string {
    if (time == null) return '';
    const date = new Date(time);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
}
