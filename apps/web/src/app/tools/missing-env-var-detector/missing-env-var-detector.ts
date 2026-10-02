import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { findMissingEnvVars } from "@dude/tool-engine/tools/missing-env-var-detector/missing-env-var-detector-logic";

@Component({
  selector: 'app-missing-env-var-detector',
  imports: [ToolShell],
  templateUrl: './missing-env-var-detector.html',
})
export class MissingEnvVarDetector {
  private readonly persistence = inject(PersistenceService);

  protected readonly sourceText = this.persistence.signal(
    'missing-env-var-detector',
    'sourceText',
    'session',
    "const port = process.env.PORT;\nconst apiUrl = process.env['API_URL'];",
  );
  protected readonly envText = this.persistence.signal('missing-env-var-detector', 'envText', 'session', 'PORT=8080\nUNUSED_VAR=1\n');

  protected readonly report = computed(() => findMissingEnvVars(this.sourceText(), this.envText()));

  protected onSourceInput(event: Event): void {
    this.sourceText.set((event.target as HTMLTextAreaElement).value);
  }

  protected onEnvInput(event: Event): void {
    this.envText.set((event.target as HTMLTextAreaElement).value);
  }
}
