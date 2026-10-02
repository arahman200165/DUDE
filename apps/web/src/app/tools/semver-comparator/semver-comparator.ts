import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { checkRange, compareVersions, RANGE_PROBE_VERSIONS, sortVersions, visualizeRanges } from "@dude/tool-engine/tools/semver-comparator/semver-compare";

type Tab = 'compare' | 'sort' | 'range' | 'visualize';
type SortDirection = 'asc' | 'desc';

@Component({
  selector: 'app-semver-comparator',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './semver-comparator.html',
})
export class SemverComparator {
  private readonly persistence = inject(PersistenceService);

  protected readonly tabs: readonly { readonly id: Tab; readonly label: string }[] = [
    { id: 'compare', label: 'Compare' },
    { id: 'sort', label: 'Sort' },
    { id: 'range', label: 'Range Check' },
    { id: 'visualize', label: 'Visualize' },
  ];

  protected readonly probeVersions = RANGE_PROBE_VERSIONS;

  protected readonly tab = this.persistence.signal<Tab>('semver-comparator', 'tab', 'local', 'compare');

  protected readonly versionA = this.persistence.signal('semver-comparator', 'versionA', 'session', '1.2.3');
  protected readonly versionB = this.persistence.signal('semver-comparator', 'versionB', 'session', '1.3.0');
  protected readonly compareResult = computed(() => compareVersions(this.versionA(), this.versionB()));

  protected readonly list = this.persistence.signal(
    'semver-comparator',
    'list',
    'session',
    '1.2.3\n1.0.0\n2.0.0-beta.1\n1.10.0',
  );
  protected readonly sortDirection = this.persistence.signal<SortDirection>(
    'semver-comparator',
    'sortDirection',
    'local',
    'asc',
  );
  protected readonly sortResult = computed(() => sortVersions(this.list().split('\n'), this.sortDirection()));

  protected readonly rangeVersion = this.persistence.signal('semver-comparator', 'rangeVersion', 'session', '1.2.5');
  protected readonly range = this.persistence.signal('semver-comparator', 'range', 'session', '^1.2.0');
  protected readonly rangeResult = computed(() => checkRange(this.rangeVersion(), this.range()));

  protected readonly visualizeInput = this.persistence.signal('semver-comparator', 'visualizeInput', 'session', '^1.2.0\n>=1.0.0 <2.0.0\n~2.5.0');
  protected readonly visualizeResult = computed(() => visualizeRanges(this.visualizeInput().split('\n')));

  protected setTab(tab: Tab): void {
    this.tab.set(tab);
  }

  protected onVersionAChange(event: Event): void {
    this.versionA.set((event.target as HTMLInputElement).value);
  }

  protected onVersionBChange(event: Event): void {
    this.versionB.set((event.target as HTMLInputElement).value);
  }

  protected onListChange(event: Event): void {
    this.list.set((event.target as HTMLTextAreaElement).value);
  }

  protected setSortDirection(direction: SortDirection): void {
    this.sortDirection.set(direction);
  }

  protected onRangeVersionChange(event: Event): void {
    this.rangeVersion.set((event.target as HTMLInputElement).value);
  }

  protected onRangeChange(event: Event): void {
    this.range.set((event.target as HTMLInputElement).value);
  }

  protected onVisualizeInputChange(event: Event): void {
    this.visualizeInput.set((event.target as HTMLTextAreaElement).value);
  }
}
