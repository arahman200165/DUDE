import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { DEFAULT_OG_SETTINGS, OgSettings, buildOgTags, hostnameFor } from "@dude/tool-engine/tools/opengraph-preview/opengraph-logic";

@Component({
  selector: 'app-opengraph-preview',
  imports: [ToolShell, CopyButton],
  templateUrl: './opengraph-preview.html',
})
export class OpengraphPreview {
  private readonly persistence = inject(PersistenceService);

  protected readonly settings = this.persistence.signal<OgSettings>('opengraph-preview', 'settings', 'session', DEFAULT_OG_SETTINGS);

  protected readonly output = computed(() => buildOgTags(this.settings()));
  protected readonly hostname = computed(() => hostnameFor(this.settings().url));

  protected onInput(key: keyof OgSettings, event: Event): void {
    this.settings.update((s) => ({ ...s, [key]: (event.target as HTMLInputElement).value }));
  }
}
