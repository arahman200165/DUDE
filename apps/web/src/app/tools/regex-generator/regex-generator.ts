import { linesOf } from "@dude/tool-engine/tools/regex-generator/regex-generator.embedded-engine";
import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { generateHeuristicRegex } from "@dude/tool-engine/tools/regex-generator/regex-generate";


@Component({
  selector: 'app-regex-generator',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './regex-generator.html',
})
export class RegexGenerator {
  private readonly persistence = inject(PersistenceService);

  protected readonly examplesRaw = this.persistence.signal('regex-generator', 'examplesRaw', 'session', '2024-01-15\n2023-12-31\n1999-06-07');
  protected readonly counterExamplesRaw = this.persistence.signal('regex-generator', 'counterExamplesRaw', 'session', '');

  protected readonly result = computed(() => generateHeuristicRegex(linesOf(this.examplesRaw()), linesOf(this.counterExamplesRaw())));

  protected onExamplesInput(event: Event): void {
    this.examplesRaw.set((event.target as HTMLTextAreaElement).value);
  }

  protected onCounterExamplesInput(event: Event): void {
    this.counterExamplesRaw.set((event.target as HTMLTextAreaElement).value);
  }
}
