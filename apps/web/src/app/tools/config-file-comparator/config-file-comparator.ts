import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { DiffView } from '../../shared/components/diff-view/diff-view';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { diffConfigFiles, type ConfigFormat } from "@dude/tool-engine/tools/config-file-comparator/config-file-comparator-logic";

@Component({
  selector: 'app-config-file-comparator',
  imports: [ToolShell, ErrorPanel, DiffView],
  templateUrl: './config-file-comparator.html',
})
export class ConfigFileComparator {
  private readonly persistence = inject(PersistenceService);

  protected readonly format = this.persistence.signal<ConfigFormat>('config-file-comparator', 'format', 'local', 'env');
  protected readonly before = this.persistence.signal('config-file-comparator', 'before', 'session', 'FOO=bar\nBAZ=qux\n');
  protected readonly after = this.persistence.signal('config-file-comparator', 'after', 'session', 'FOO=bar\nBAZ=updated\n');

  protected readonly result = computed(() => diffConfigFiles(this.before(), this.after(), this.format()));

  protected onFormatChange(event: Event): void {
    this.format.set((event.target as HTMLSelectElement).value as ConfigFormat);
  }

  protected onBeforeInput(event: Event): void {
    this.before.set((event.target as HTMLTextAreaElement).value);
  }

  protected onAfterInput(event: Event): void {
    this.after.set((event.target as HTMLTextAreaElement).value);
  }
}
