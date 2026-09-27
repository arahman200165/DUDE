import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { DiffView } from '../../shared/components/diff-view/diff-view';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { OpenTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { diffEnvFiles } from './env-diff-logic';

@Component({
  selector: 'app-env-diff',
  imports: [ToolShell, DiffView, OpenTextFile, TextFileDrop],
  templateUrl: './env-diff.html',
})
export class EnvDiff {
  private readonly persistence = inject(PersistenceService);

  protected readonly before = this.persistence.signal('env-diff', 'before', 'session', 'FOO=bar\nBAZ=qux\n');
  protected readonly after = this.persistence.signal('env-diff', 'after', 'session', 'FOO=bar\nBAZ=updated\nNEW=value\n');

  protected readonly diff = computed(() => diffEnvFiles(this.before(), this.after()));

  protected onBeforeInput(event: Event): void {
    this.before.set((event.target as HTMLTextAreaElement).value);
  }

  protected onAfterInput(event: Event): void {
    this.after.set((event.target as HTMLTextAreaElement).value);
  }
}
