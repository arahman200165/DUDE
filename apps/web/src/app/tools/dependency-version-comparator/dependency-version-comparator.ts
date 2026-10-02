import { DependencyVersionComparator_kindLabel } from "@dude/tool-engine/tools/dependency-version-comparator/dependency-version-comparator.embedded-engine";
import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { diffDependencyLists } from "@dude/tool-engine/tools/dependency-version-comparator/dependency-version-compare";

const SAMPLE_BEFORE = '"@angular/core": "^21.0.0"\n"rxjs": "~7.8.0"\n"left-pad": "1.0.0"';
const SAMPLE_AFTER = '"@angular/core": "^22.1.0"\n"rxjs": "~7.8.1"\n"right-pad": "1.0.0"';

@Component({
  selector: 'app-dependency-version-comparator',
  imports: [ToolShell],
  templateUrl: './dependency-version-comparator.html',
})
export class DependencyVersionComparator {
  private readonly persistence = inject(PersistenceService);

  protected readonly before = this.persistence.signal('dependency-version-comparator', 'before', 'session', SAMPLE_BEFORE);
  protected readonly after = this.persistence.signal('dependency-version-comparator', 'after', 'session', SAMPLE_AFTER);

  protected readonly diff = computed(() => diffDependencyLists(this.before(), this.after()));

  protected onBeforeChange(event: Event): void {
    this.before.set((event.target as HTMLTextAreaElement).value);
  }

  protected onAfterChange(event: Event): void {
    this.after.set((event.target as HTMLTextAreaElement).value);
  }
  protected kindLabel = DependencyVersionComparator_kindLabel;

}
