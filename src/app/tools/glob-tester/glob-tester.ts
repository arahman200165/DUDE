import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { WorkbenchTable } from '../../shared/components/workbench-table/workbench-table';
import { SimpleColumnsPipe } from '../../shared/components/workbench-table/simple-columns.pipe';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { GlobOptions, matchPaths } from './glob-match';

@Component({
  selector: 'app-glob-tester',
  imports: [ToolShell, ErrorPanel, WorkbenchTable, SimpleColumnsPipe],
  templateUrl: './glob-tester.html',
})
export class GlobTester {
  private readonly persistence = inject(PersistenceService);

  protected readonly pattern = this.persistence.signal('glob-tester', 'pattern', 'session', 'src/**/*.spec.ts');
  protected readonly paths = this.persistence.signal(
    'glob-tester',
    'paths',
    'session',
    'src/app/tools/base64/base64.ts\nsrc/app/tools/base64/base64-codec.spec.ts\nsrc/app/tools/base64/base64.html',
  );

  protected readonly dot = this.persistence.signal('glob-tester', 'dot', 'local', false);
  protected readonly nocase = this.persistence.signal('glob-tester', 'nocase', 'local', false);
  protected readonly treatBackslashAsSeparator = this.persistence.signal(
    'glob-tester',
    'treatBackslashAsSeparator',
    'local',
    true,
  );

  protected readonly options = computed<GlobOptions>(() => ({
    dot: this.dot(),
    nocase: this.nocase(),
    treatBackslashAsSeparator: this.treatBackslashAsSeparator(),
  }));

  protected readonly result = computed(() =>
    matchPaths(this.pattern(), this.paths().split('\n'), this.options()),
  );

  protected readonly matchCount = computed(() => {
    const current = this.result();
    return current.ok ? current.results.filter((r) => r.matched).length : 0;
  });

  protected readonly tableRows = computed(() => {
    const current = this.result();
    if (!current.ok) return [];
    return current.results.map((r) => [r.path, r.matched ? '✓ match' : '✗ no match'] as const);
  });

  protected onPatternChange(event: Event): void {
    this.pattern.set((event.target as HTMLInputElement).value);
  }

  protected onPathsChange(event: Event): void {
    this.paths.set((event.target as HTMLTextAreaElement).value);
  }

  protected toggleDot(): void {
    this.dot.set(!this.dot());
  }

  protected toggleNocase(): void {
    this.nocase.set(!this.nocase());
  }

  protected toggleBackslash(): void {
    this.treatBackslashAsSeparator.set(!this.treatBackslashAsSeparator());
  }
}
