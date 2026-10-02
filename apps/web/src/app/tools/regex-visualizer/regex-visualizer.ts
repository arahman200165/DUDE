import { Component, ElementRef, ViewEncapsulation, computed, effect, inject, viewChild } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { buildRegexDiagram } from "@dude/tool-engine/tools/regex-visualizer/regex-diagram";

// `railroad-diagrams` builds raw SVG DOM nodes outside Angular's template compiler
// (appended imperatively in the effect below), so Angular's default view-encapsulation
// scoping attribute never lands on them — same issue Markdown/Markdown Workspace hit
// with their sanitized-HTML preview panes, and the same fix (ViewEncapsulation.None,
// selectors scoped by a component-local class instead). Colors are the app's own dark
// theme tokens (`apps/web/src/styles/tokens.css`), not the library's light-mode CSS.
const REGEX_DIAGRAM_STYLES = `
.regex-diagram svg.railroad-diagram {
  background-color: transparent;
}
.regex-diagram svg.railroad-diagram path {
  stroke-width: 2;
  stroke: var(--color-text-muted);
  fill: rgba(0, 0, 0, 0);
}
.regex-diagram svg.railroad-diagram text {
  font: 12px ui-monospace, monospace;
  text-anchor: middle;
  fill: var(--color-text);
}
.regex-diagram svg.railroad-diagram text.comment {
  font-style: italic;
  fill: var(--color-text-muted);
}
.regex-diagram svg.railroad-diagram rect {
  stroke-width: 2;
  stroke: var(--color-accent);
  fill: var(--color-panel-elevated);
}
`;

@Component({
  selector: 'app-regex-visualizer',
  imports: [ToolShell, ErrorPanel],
  templateUrl: './regex-visualizer.html',
  encapsulation: ViewEncapsulation.None,
  styles: [REGEX_DIAGRAM_STYLES],
})
export class RegexVisualizer {
  private readonly persistence = inject(PersistenceService);
  private readonly diagramContainer = viewChild<ElementRef<HTMLDivElement>>('diagramContainer');

  protected readonly pattern = this.persistence.signal(
    'regex-visualizer',
    'pattern',
    'session',
    '^(?<user>[\\w.+-]+)@([\\w-]+\\.)+[a-z]{2,}$',
  );
  protected readonly flags = this.persistence.signal('regex-visualizer', 'flags', 'session', 'i');

  protected readonly result = computed(() => buildRegexDiagram(this.pattern(), this.flags()));

  constructor() {
    effect(() => {
      const container = this.diagramContainer()?.nativeElement;
      const current = this.result();
      if (!container) return;

      container.innerHTML = '';
      if (current.ok) current.diagram.addTo(container);
    });
  }

  protected onPatternInput(event: Event): void {
    this.pattern.set((event.target as HTMLInputElement).value);
  }

  protected onFlagsInput(event: Event): void {
    this.flags.set((event.target as HTMLInputElement).value);
  }
}
