import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { MIME_TYPES, MimeTopLevelType } from "@dude/tool-engine/tools/mime-types/mime-type-data";
import { COMMON_MIME_EXTENSIONS } from "@dude/tool-engine/tools/mime-types/mime-extension-overlay";
import { filterMimeTypes } from "@dude/tool-engine/tools/mime-types/mime-search";

const TOP_LEVEL_TYPES: readonly MimeTopLevelType[] = [
  'application',
  'audio',
  'font',
  'image',
  'message',
  'model',
  'multipart',
  'text',
  'video',
];

@Component({
  selector: 'app-mime-types',
  imports: [ToolShell, CopyButton],
  templateUrl: './mime-types.html',
})
export class MimeTypes {
  private readonly persistence = inject(PersistenceService);

  protected readonly topLevelTypes = TOP_LEVEL_TYPES;
  protected readonly totalCount = MIME_TYPES.length;

  protected readonly filterText = this.persistence.signal('mime-types', 'filterText', 'local', '');
  protected readonly topLevelFilter = this.persistence.signal<MimeTopLevelType | 'all'>(
    'mime-types',
    'topLevelFilter',
    'local',
    'all',
  );

  protected readonly filtered = computed(() =>
    filterMimeTypes(MIME_TYPES, COMMON_MIME_EXTENSIONS, {
      text: this.filterText(),
      topLevelType: this.topLevelFilter(),
    }),
  );

  protected onFilterInput(event: Event): void {
    this.filterText.set((event.target as HTMLInputElement).value);
  }

  protected onTopLevelFilterChange(event: Event): void {
    this.topLevelFilter.set((event.target as HTMLSelectElement).value as MimeTopLevelType | 'all');
  }

  protected clear(): void {
    this.filterText.set('');
  }
}
