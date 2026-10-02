import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { OpenTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { validateJsonLd } from "@dude/tool-engine/tools/json-ld-tester/json-ld-logic";

const SAMPLE = JSON.stringify(
  {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: 'Sample headline',
    author: { '@type': 'Person', name: 'Jane Doe' },
    datePublished: '2026-01-01',
  },
  null,
  2,
);

@Component({
  selector: 'app-json-ld-tester',
  imports: [ToolShell, ErrorPanel, OpenTextFile, TextFileDrop],
  templateUrl: './json-ld-tester.html',
})
export class JsonLdTester {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal('json-ld-tester', 'input', 'session', SAMPLE);

  protected readonly result = computed(() => validateJsonLd(this.input()));

  protected readonly errorCount = computed(() => {
    const r = this.result();
    return r.ok ? r.findings.filter((f) => f.severity === 'error').length : 0;
  });

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }
}
