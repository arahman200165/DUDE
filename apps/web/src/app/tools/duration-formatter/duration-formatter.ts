import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { parseDuration } from "@dude/tool-engine/tools/duration-formatter/duration-convert";

@Component({
  selector: 'app-duration-formatter',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './duration-formatter.html',
})
export class DurationFormatter {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal('duration-formatter', 'input', 'session', '1d 2h 30m');
  protected readonly result = computed(() => parseDuration(this.input()));

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLInputElement).value);
  }
}
