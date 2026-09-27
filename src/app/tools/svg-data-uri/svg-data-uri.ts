import { Component, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { TextInputHandoffService } from '../../core/text-file-input/text-input-handoff.service';
import { OpenTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { SaveTextFile } from '../../shared/components/save-text-file/save-text-file';
import { decodeSvgDataUri, encodeSvgDataUri } from './svg-data-uri-codec';

type Direction = 'encode' | 'decode';

@Component({
  selector: 'app-svg-data-uri',
  imports: [ToolShell, ErrorPanel, CopyButton, OpenTextFile, TextFileDrop, SaveTextFile],
  templateUrl: './svg-data-uri.html',
})
export class SvgDataUri {
  private readonly persistence = inject(PersistenceService);

  protected readonly direction = this.persistence.signal<Direction>('svg-data-uri', 'direction', 'local', 'encode');
  protected readonly svgInput = this.persistence.signal(
    'svg-data-uri',
    'svgInput',
    'session',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="10" fill="#38bdf8"/></svg>',
  );
  protected readonly uriInput = this.persistence.signal('svg-data-uri', 'uriInput', 'session', '');

  protected readonly rejection = signal<string | null>(null);

  constructor() {
    // A dropped/pasted SVG hand-off lands in `svgInput`, which only the encode direction shows.
    if (inject(TextInputHandoffService).has('svg-data-uri')) this.direction.set('encode');
  }

  protected readonly encoded = computed(() => encodeSvgDataUri(this.svgInput()));
  protected readonly decoded = computed(() => (this.uriInput().trim() === '' ? null : decodeSvgDataUri(this.uriInput())));

  protected setDirection(direction: Direction): void {
    this.direction.set(direction);
    this.rejection.set(null);
  }

  protected onSvgInputChange(event: Event): void {
    this.svgInput.set((event.target as HTMLTextAreaElement).value);
  }

  protected onUriInputChange(event: Event): void {
    this.uriInput.set((event.target as HTMLTextAreaElement).value);
  }
}
