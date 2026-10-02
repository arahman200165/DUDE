import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { HTTP_STATUS_CODES } from "@dude/tool-engine/shared/utils/http-status-codes";
import { filterHttpStatusCodes } from "@dude/tool-engine/tools/http-status/http-status-search";

@Component({
  selector: 'app-http-status',
  imports: [ToolShell, CopyButton],
  templateUrl: './http-status.html',
})
export class HttpStatus {
  private readonly persistence = inject(PersistenceService);

  protected readonly filterText = this.persistence.signal('http-status', 'filterText', 'local', '');
  protected readonly groups = computed(() => filterHttpStatusCodes(HTTP_STATUS_CODES, this.filterText()));
  protected readonly totalMatches = computed(() => this.groups().reduce((sum, g) => sum + g.entries.length, 0));
  protected readonly totalCodes = HTTP_STATUS_CODES.length;

  protected onFilterInput(event: Event): void {
    this.filterText.set((event.target as HTMLInputElement).value);
  }

  protected clear(): void {
    this.filterText.set('');
  }
}
