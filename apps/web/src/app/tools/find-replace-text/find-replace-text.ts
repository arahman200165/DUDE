import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { findReplace } from "@dude/tool-engine/tools/find-replace-text/find-replace-logic";

@Component({
  selector: 'app-find-replace-text',
  imports: [ToolShell, CopyButton],
  templateUrl: './find-replace-text.html',
})
export class FindReplaceText {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal('find-replace-text', 'input', 'session', '');
  protected readonly find = this.persistence.signal('find-replace-text', 'find', 'session', '');
  protected readonly replace = this.persistence.signal('find-replace-text', 'replace', 'session', '');
  protected readonly caseSensitive = this.persistence.signal('find-replace-text', 'caseSensitive', 'local', true);
  protected readonly wholeWord = this.persistence.signal('find-replace-text', 'wholeWord', 'local', false);

  protected readonly result = computed(() =>
    findReplace(this.input(), this.find(), this.replace(), {
      caseSensitive: this.caseSensitive(),
      wholeWord: this.wholeWord(),
    }),
  );

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected onFindChange(event: Event): void {
    this.find.set((event.target as HTMLInputElement).value);
  }

  protected onReplaceChange(event: Event): void {
    this.replace.set((event.target as HTMLInputElement).value);
  }

  protected toggleCaseSensitive(): void {
    this.caseSensitive.update((c) => !c);
  }

  protected toggleWholeWord(): void {
    this.wholeWord.update((w) => !w);
  }

  protected apply(): void {
    this.input.set(this.result().output);
  }
}
