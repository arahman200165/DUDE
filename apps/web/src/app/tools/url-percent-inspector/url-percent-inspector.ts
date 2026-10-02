import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { inspectPercentEncoding } from "@dude/tool-engine/tools/url-percent-inspector/percent-encoding-inspect";

@Component({
  selector: 'app-url-percent-inspector',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './url-percent-inspector.html',
})
export class UrlPercentInspector {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal(
    'url-percent-inspector',
    'input',
    'session',
    'search?q=caf%C3%A9+%26+bar',
  );

  protected readonly inspection = computed(() => inspectPercentEncoding(this.input()));
  protected readonly reencoded = computed(() => encodeURIComponent(this.inspection().decoded));

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLInputElement).value);
  }

  protected clear(): void {
    this.input.set('');
  }
}
