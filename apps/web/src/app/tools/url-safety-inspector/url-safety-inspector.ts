import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { inspectUrlSafety } from "@dude/tool-engine/tools/url-safety-inspector/url-safety-inspect";

@Component({
  selector: 'app-url-safety-inspector',
  imports: [ToolShell, ErrorPanel],
  templateUrl: './url-safety-inspector.html',
})
export class UrlSafetyInspector {
  private readonly persistence = inject(PersistenceService);

  protected readonly raw = this.persistence.signal('url-safety-inspector', 'raw', 'session', 'https://аpple-support.top/login?next=%2Faccount');

  protected readonly result = computed(() => inspectUrlSafety(this.raw()));

  protected onRawChange(event: Event): void {
    this.raw.set((event.target as HTMLInputElement).value);
  }
}
