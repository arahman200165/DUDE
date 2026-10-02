import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { HtmlEntityMode, processHtmlEntities } from "@dude/tool-engine/tools/html-entities/html-entity-codec";

@Component({
  selector: 'app-html-entities',
  imports: [ToolShell],
  templateUrl: './html-entities.html',
})
export class HtmlEntities {
  private readonly persistence = inject(PersistenceService);

  protected readonly mode = this.persistence.signal<HtmlEntityMode>('html-entities', 'mode', 'local', 'encode');
  protected readonly encodeAllNonAscii = this.persistence.signal(
    'html-entities',
    'encodeAllNonAscii',
    'local',
    false,
  );
  protected readonly input = this.persistence.signal('html-entities', 'input', 'session', '');

  protected readonly result = computed(() =>
    processHtmlEntities(this.input(), this.mode(), this.encodeAllNonAscii()),
  );

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected setMode(mode: HtmlEntityMode): void {
    this.mode.set(mode);
  }

  protected toggleEncodeAllNonAscii(): void {
    this.encodeAllNonAscii.update((value) => !value);
  }

  protected swap(): void {
    this.input.set(this.result());
    this.mode.set(this.mode() === 'encode' ? 'decode' : 'encode');
  }

  protected clear(): void {
    this.input.set('');
  }

  protected copy(): void {
    void navigator.clipboard.writeText(this.result());
  }
}
