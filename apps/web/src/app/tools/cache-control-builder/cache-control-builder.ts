import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import {
  CacheControlContext,
  CacheControlEntry,
  buildCacheControl,
  checkCacheControlWarnings,
  directivesFor,
  parseCacheControl,
} from "@dude/tool-engine/tools/cache-control-builder/cache-control";

@Component({
  selector: 'app-cache-control-builder',
  imports: [ToolShell, CopyButton],
  templateUrl: './cache-control-builder.html',
})
export class CacheControlBuilder {
  private readonly persistence = inject(PersistenceService);

  protected readonly context = this.persistence.signal<CacheControlContext>('cache-control-builder', 'context', 'local', 'response');
  protected readonly raw = this.persistence.signal('cache-control-builder', 'raw', 'session', 'public, max-age=3600, must-revalidate');

  protected readonly entries = computed(() => parseCacheControl(this.raw()));
  protected readonly warnings = computed(() => checkCacheControlWarnings(this.entries()));
  protected readonly directives = computed(() => directivesFor(this.context()));

  protected setContext(context: CacheControlContext): void {
    this.context.set(context);
  }

  protected onRawChange(event: Event): void {
    this.raw.set((event.target as HTMLInputElement).value);
  }

  protected entryFor(name: string): CacheControlEntry | undefined {
    return this.entries().find((entry) => entry.name === name);
  }

  protected toggleDirective(name: string, hasValue: boolean, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const without = this.entries().filter((entry) => entry.name !== name);
    const next = checked ? [...without, { name, value: hasValue ? '' : null }] : without;
    this.raw.set(buildCacheControl(next));
  }

  protected setDirectiveValue(name: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const without = this.entries().filter((entry) => entry.name !== name);
    this.raw.set(buildCacheControl([...without, { name, value }]));
  }
}
