import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { DEFAULT_META_SETTINGS, MetaTagSettings, buildMetaTags } from './meta-tag-logic';

@Component({
  selector: 'app-meta-tag-generator',
  imports: [ToolShell, CopyButton],
  templateUrl: './meta-tag-generator.html',
})
export class MetaTagGenerator {
  private readonly persistence = inject(PersistenceService);

  protected readonly themeColorPlaceholder = '#3b82f6';
  protected readonly settings = this.persistence.signal<MetaTagSettings>('meta-tag-generator', 'settings', 'session', DEFAULT_META_SETTINGS);

  protected readonly output = computed(() => buildMetaTags(this.settings()));

  protected onInput(key: keyof MetaTagSettings, event: Event): void {
    this.settings.update((s) => ({ ...s, [key]: (event.target as HTMLInputElement).value }));
  }
}
