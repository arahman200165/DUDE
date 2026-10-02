import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { DEFAULT_SLUG_OPTIONS, SlugOptions, SlugSeparator, generateSlug } from "@dude/tool-engine/tools/slug-generator/slug-generate";

@Component({
  selector: 'app-slug-generator',
  imports: [ToolShell],
  templateUrl: './slug-generator.html',
})
export class SlugGenerator {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal('slug-generator', 'input', 'session', '');
  protected readonly options = this.persistence.signal<SlugOptions>(
    'slug-generator',
    'options',
    'local',
    DEFAULT_SLUG_OPTIONS,
  );

  protected readonly result = computed(() => generateSlug(this.input(), this.options()));

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected onSeparatorChange(event: Event): void {
    const separator = (event.target as HTMLSelectElement).value as SlugSeparator;
    this.options.update((current) => ({ ...current, separator }));
  }

  protected onMaxLengthChange(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const maxLength = raw === '' ? null : Math.max(1, Number(raw));
    this.options.update((current) => ({ ...current, maxLength }));
  }

  protected toggleStopwords(): void {
    this.options.update((current) => ({ ...current, removeStopwords: !current.removeStopwords }));
  }

  protected clear(): void {
    this.input.set('');
  }

  protected copy(): void {
    void navigator.clipboard.writeText(this.result());
  }
}
