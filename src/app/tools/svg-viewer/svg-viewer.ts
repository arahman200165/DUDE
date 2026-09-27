import { Component, computed, effect, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { OpenTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { SaveTextFile } from '../../shared/components/save-text-file/save-text-file';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { formatSvg, minifySvg, optimizeSvg, type SvgOptimizeResult, type SvgTextResult } from './svg-tools';

type Mode = 'format' | 'minify' | 'optimize';

const SAMPLE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="10" fill="#38bdf8"/></svg>';

/**
 * Renders the preview via an `<img>` bound to an Object URL (like
 * `data-uri-converter`'s image preview), not `[innerHTML]` -- SVG markup can
 * carry inline `<script>`, so treating it as an *image* source rather than
 * live-parsed DOM avoids ever executing anything the user pastes.
 */
@Component({
  selector: 'app-svg-viewer',
  imports: [ToolShell, ErrorPanel, CopyButton, OpenTextFile, TextFileDrop, SaveTextFile],
  templateUrl: './svg-viewer.html',
})
export class SvgViewer {
  private readonly persistence = inject(PersistenceService);

  protected readonly mode = this.persistence.signal<Mode>('svg-viewer', 'mode', 'local', 'format');
  protected readonly source = this.persistence.signal('svg-viewer', 'source', 'session', SAMPLE);

  private readonly previewUrlSignal = signal<string | null>(null);
  protected readonly previewUrl = this.previewUrlSignal.asReadonly();

  protected readonly formatResult = computed<SvgTextResult | null>(() => (this.mode() === 'format' ? formatSvg(this.source()) : null));
  protected readonly minifyResult = computed<SvgTextResult | null>(() => (this.mode() === 'minify' ? minifySvg(this.source()) : null));
  protected readonly optimizeResult = computed<SvgOptimizeResult | null>(() => (this.mode() === 'optimize' ? optimizeSvg(this.source()) : null));

  protected readonly outputText = computed(() => {
    const format = this.formatResult();
    if (format) return format.ok ? format.output : '';
    const minify = this.minifyResult();
    if (minify) return minify.ok ? minify.output : '';
    const optimize = this.optimizeResult();
    if (optimize) return optimize.ok ? optimize.output : '';
    return '';
  });

  protected readonly errorMessage = computed(() => {
    const format = this.formatResult();
    if (format && !format.ok) return format.error;
    const minify = this.minifyResult();
    if (minify && !minify.ok) return minify.error;
    const optimize = this.optimizeResult();
    if (optimize && !optimize.ok) return optimize.error;
    return null;
  });

  constructor() {
    effect((onCleanup) => {
      const source = this.source();
      if (source.trim() === '') {
        this.previewUrlSignal.set(null);
        return;
      }

      const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
      this.previewUrlSignal.set(url);
      onCleanup(() => URL.revokeObjectURL(url));
    });
  }

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
  }

  protected onSourceChange(event: Event): void {
    this.source.set((event.target as HTMLTextAreaElement).value);
  }
}
