import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { checkContrast } from "@dude/tool-engine/tools/contrast-checker/contrast-checker-logic";

@Component({
  selector: 'app-contrast-checker',
  imports: [ToolShell, ErrorPanel],
  templateUrl: './contrast-checker.html',
})
export class ContrastChecker {
  private readonly persistence = inject(PersistenceService);

  protected readonly foreground = this.persistence.signal('contrast-checker', 'foreground', 'session', '#0f172a');
  protected readonly background = this.persistence.signal('contrast-checker', 'background', 'session', '#ffffff');

  protected readonly result = computed(() => checkContrast(this.foreground(), this.background()));

  protected onForegroundChange(event: Event): void {
    this.foreground.set((event.target as HTMLInputElement).value);
  }

  protected onBackgroundChange(event: Event): void {
    this.background.set((event.target as HTMLInputElement).value);
  }
}
