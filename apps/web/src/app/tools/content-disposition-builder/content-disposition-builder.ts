import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { ContentDisposition, DispositionType, buildContentDisposition, parseContentDisposition } from "@dude/tool-engine/tools/content-disposition-builder/content-disposition";

@Component({
  selector: 'app-content-disposition-builder',
  imports: [ToolShell, CopyButton],
  templateUrl: './content-disposition-builder.html',
})
export class ContentDispositionBuilder {
  private readonly persistence = inject(PersistenceService);

  protected readonly raw = this.persistence.signal('content-disposition-builder', 'raw', 'session', 'attachment; filename="report.pdf"');

  protected readonly disposition = computed(() => parseContentDisposition(this.raw()));

  protected onRawChange(event: Event): void {
    this.raw.set((event.target as HTMLInputElement).value);
  }

  protected setType(type: DispositionType): void {
    this.updateDisposition({ type });
  }

  protected onFilenameInput(event: Event): void {
    this.updateDisposition({ filename: (event.target as HTMLInputElement).value });
  }

  private updateDisposition(patch: Partial<ContentDisposition>): void {
    this.raw.set(buildContentDisposition({ ...this.disposition(), ...patch }));
  }
}
