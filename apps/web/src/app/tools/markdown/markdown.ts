import { Component, ViewEncapsulation, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { SplitPane } from '../../shared/components/split-pane/split-pane';
import { SandboxedMarkdownPreview } from '../../shared/components/sandboxed-markdown-preview/sandboxed-markdown-preview';
import { OpenTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { SaveTextFile } from '../../shared/components/save-text-file/save-text-file';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { MARKDOWN_BODY_STYLES } from '../../shared/styles/markdown-body.styles';
import { markdownPresetStyleVars, MARKDOWN_STYLE_PRESETS, type MarkdownStylePreset } from "@dude/domain/shared/models/markdown-theme.model";
import { renderMarkdown } from "@dude/tool-engine/tools/markdown/markdown-render";

const DEFAULT_SOURCE = '# Markdown Preview\n\nType **Markdown** on the left to see it rendered on the right.\n';

@Component({
  selector: 'app-markdown',
  imports: [ToolShell, SplitPane, SandboxedMarkdownPreview, OpenTextFile, TextFileDrop, SaveTextFile],
  templateUrl: './markdown.html',
  // Emulated encapsulation (the default) adds a scoping attribute to
  // elements the Angular template compiler renders, but never to content
  // injected via [innerHTML] — that's raw HTML parsed directly into the
  // DOM, so these `.markdown-body` rules never actually matched the
  // rendered Markdown (verified: the <pre> background was always
  // transparent). Discovered while building the Advanced Markdown
  // Workspace tool, which hit the identical issue.
  encapsulation: ViewEncapsulation.None,
  styles: [MARKDOWN_BODY_STYLES],
})
export class Markdown {
  private readonly persistence = inject(PersistenceService);

  protected readonly source = this.persistence.signal('markdown', 'source', 'session', DEFAULT_SOURCE);
  protected readonly paneRatio = this.persistence.signal('markdown', 'paneRatio', 'local', 0.5);

  protected readonly stylePresets = Object.entries(MARKDOWN_STYLE_PRESETS) as [MarkdownStylePreset, (typeof MARKDOWN_STYLE_PRESETS)[MarkdownStylePreset]][];
  protected readonly stylePreset = this.persistence.signal<MarkdownStylePreset>('markdown', 'stylePreset', 'local', 'default');
  protected readonly customCss = this.persistence.signal('markdown', 'customCss', 'local', '');

  protected readonly presetStyleVars = computed(() => markdownPresetStyleVars(this.stylePreset()));
  protected readonly renderedHtml = computed(() => renderMarkdown(this.source()));

  protected onSourceInput(event: Event): void {
    this.source.set((event.target as HTMLTextAreaElement).value);
  }

  protected onRatioChange(ratio: number): void {
    this.paneRatio.set(ratio);
  }

  protected onStylePresetChange(event: Event): void {
    this.stylePreset.set((event.target as HTMLSelectElement).value as MarkdownStylePreset);
  }

  protected onCustomCssInput(event: Event): void {
    this.customCss.set((event.target as HTMLTextAreaElement).value);
  }

  protected clear(): void {
    this.source.set('');
  }

  protected copySource(): void {
    void navigator.clipboard.writeText(this.source());
  }
}
