import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { mergeConfigSources, type ConfigSource, type ConfigSourceFormat } from "@dude/tool-engine/tools/config-merge-tool/config-merge-tool-logic";

const DEFAULT_SOURCES: readonly ConfigSource[] = [
  { format: 'yaml', text: 'db:\n  host: localhost\n  port: 5432\n' },
  { format: 'json', text: '{"db": {"port": 6543}}' },
];

@Component({
  selector: 'app-config-merge-tool',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './config-merge-tool.html',
})
export class ConfigMergeTool {
  private readonly persistence = inject(PersistenceService);

  protected readonly sources = this.persistence.signal<readonly ConfigSource[]>('config-merge-tool', 'sources', 'session', DEFAULT_SOURCES);

  protected readonly result = computed(() => mergeConfigSources(this.sources()));

  protected addSource(): void {
    this.sources.update((current) => [...current, { format: 'json', text: '' }]);
  }

  protected removeSource(index: number): void {
    this.sources.update((current) => current.filter((_, i) => i !== index));
  }

  protected onFormatChange(index: number, event: Event): void {
    const format = (event.target as HTMLSelectElement).value as ConfigSourceFormat;
    this.sources.update((current) => current.map((source, i) => (i === index ? { ...source, format } : source)));
  }

  protected onTextInput(index: number, event: Event): void {
    const text = (event.target as HTMLTextAreaElement).value;
    this.sources.update((current) => current.map((source, i) => (i === index ? { ...source, text } : source)));
  }
}
