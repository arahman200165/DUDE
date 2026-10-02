import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { KeyValueEditor } from '../../shared/components/key-value-editor/key-value-editor';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { KeyValuePair } from "@dude/shared-types/shared/models/key-value-pair.model";
import {
  ContentRange,
  buildContentRangeHeader,
  buildRangeHeader,
  checkRangeWarnings,
  parseContentRangeHeader,
  parseRangeHeader,
} from "@dude/tool-engine/tools/range-header-builder/range-header";

@Component({
  selector: 'app-range-header-builder',
  imports: [ToolShell, CopyButton, KeyValueEditor],
  templateUrl: './range-header-builder.html',
})
export class RangeHeaderBuilder {
  private readonly persistence = inject(PersistenceService);

  protected readonly rangeRaw = this.persistence.signal('range-header-builder', 'rangeRaw', 'session', 'bytes=0-499,1000-1499');
  protected readonly ranges = computed(() => parseRangeHeader(this.rangeRaw()));
  protected readonly rangeWarnings = computed(() => checkRangeWarnings(this.ranges()));

  protected readonly contentRangeRaw = this.persistence.signal('range-header-builder', 'contentRangeRaw', 'session', 'bytes 0-499/1234');
  protected readonly contentRange = computed(() => parseContentRangeHeader(this.contentRangeRaw()));

  protected onRangeRawChange(event: Event): void {
    this.rangeRaw.set((event.target as HTMLInputElement).value);
  }

  protected onRangesChange(ranges: readonly KeyValuePair[]): void {
    this.rangeRaw.set(buildRangeHeader(ranges));
  }

  protected onContentRangeRawChange(event: Event): void {
    this.contentRangeRaw.set((event.target as HTMLInputElement).value);
  }

  protected onContentRangeFieldChange(field: keyof ContentRange, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.contentRangeRaw.set(buildContentRangeHeader({ ...this.contentRange(), [field]: value }));
  }
}
