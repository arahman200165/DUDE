import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { SplitPane } from '../../shared/components/split-pane/split-pane';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { QueryPair, buildQueryString, parseQueryString } from "@dude/tool-engine/tools/query-string/query-string-codec";

@Component({
  selector: 'app-query-string',
  imports: [ToolShell, SplitPane],
  templateUrl: './query-string.html',
})
export class QueryString {
  private readonly persistence = inject(PersistenceService);

  protected readonly raw = this.persistence.signal('query-string', 'raw', 'session', '');
  protected readonly pairs = computed(() => parseQueryString(this.raw()));

  /**
   * `application/x-www-form-urlencoded` request bodies use the same encoding as a URL
   * query string, minus the leading `?` -- rebuilt from `pairs()` rather than reusing
   * `raw()` directly, since raw may itself be a full URL or `?`-prefixed.
   */
  protected readonly formUrlEncodedBody = computed(() => buildQueryString(this.pairs()));

  protected onRawChange(event: Event): void {
    this.raw.set((event.target as HTMLTextAreaElement).value);
  }

  protected onKeyInput(index: number, event: Event): void {
    const key = (event.target as HTMLInputElement).value;
    this.replacePair(index, { ...this.pairs()[index], key });
  }

  protected onValueInput(index: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.replacePair(index, { ...this.pairs()[index], value });
  }

  protected addPair(): void {
    this.setPairs([...this.pairs(), { key: '', value: '' }]);
  }

  protected removePair(index: number): void {
    this.setPairs(this.pairs().filter((_, i) => i !== index));
  }

  protected clear(): void {
    this.raw.set('');
  }

  protected copy(): void {
    void navigator.clipboard.writeText(this.raw());
  }

  protected copyAsRequestBody(): void {
    void navigator.clipboard.writeText(this.formUrlEncodedBody());
  }

  private replacePair(index: number, pair: QueryPair): void {
    this.setPairs(this.pairs().map((existing, i) => (i === index ? pair : existing)));
  }

  private setPairs(pairs: readonly QueryPair[]): void {
    this.raw.set(buildQueryString(pairs));
  }
}
