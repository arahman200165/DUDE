import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { NormalizeOptions, compareUrls, normalizeUrl, resolveUrl } from "@dude/tool-engine/tools/url-normalizer/url-normalize";

type Mode = 'normalize' | 'resolve' | 'compare';

@Component({
  selector: 'app-url-normalizer',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './url-normalizer.html',
})
export class UrlNormalizer {
  private readonly persistence = inject(PersistenceService);

  protected readonly mode = this.persistence.signal<Mode>('url-normalizer', 'mode', 'local', 'normalize');

  protected readonly sortQueryParams = this.persistence.signal('url-normalizer', 'sortQueryParams', 'local', false);
  protected readonly stripTrailingSlash = this.persistence.signal('url-normalizer', 'stripTrailingSlash', 'local', false);
  protected readonly stripFragment = this.persistence.signal('url-normalizer', 'stripFragment', 'local', false);

  protected readonly options = computed<NormalizeOptions>(() => ({
    sortQueryParams: this.sortQueryParams(),
    stripTrailingSlash: this.stripTrailingSlash(),
    stripFragment: this.stripFragment(),
  }));

  protected readonly normalizeInput = this.persistence.signal('url-normalizer', 'normalizeInput', 'session', 'HTTP://Example.com:80/a/../b/?y=2&x=1#top');
  protected readonly normalizeResult = computed(() => normalizeUrl(this.normalizeInput(), this.options()));

  protected readonly resolveBase = this.persistence.signal('url-normalizer', 'resolveBase', 'session', 'https://example.com/a/b/');
  protected readonly resolveRelative = this.persistence.signal('url-normalizer', 'resolveRelative', 'session', '../c?x=1');
  protected readonly resolveResult = computed(() => resolveUrl(this.resolveBase(), this.resolveRelative()));

  protected readonly compareA = this.persistence.signal('url-normalizer', 'compareA', 'session', 'https://Example.com:443/a/../b?x=1&y=2');
  protected readonly compareB = this.persistence.signal('url-normalizer', 'compareB', 'session', 'https://example.com/b?y=2&x=1');
  protected readonly compareResult = computed(() => compareUrls(this.compareA(), this.compareB(), this.options()));

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
  }

  protected onSortQueryParamsChange(event: Event): void {
    this.sortQueryParams.set((event.target as HTMLInputElement).checked);
  }

  protected onStripTrailingSlashChange(event: Event): void {
    this.stripTrailingSlash.set((event.target as HTMLInputElement).checked);
  }

  protected onStripFragmentChange(event: Event): void {
    this.stripFragment.set((event.target as HTMLInputElement).checked);
  }

  protected onNormalizeInput(event: Event): void {
    this.normalizeInput.set((event.target as HTMLInputElement).value);
  }

  protected onResolveBaseInput(event: Event): void {
    this.resolveBase.set((event.target as HTMLInputElement).value);
  }

  protected onResolveRelativeInput(event: Event): void {
    this.resolveRelative.set((event.target as HTMLInputElement).value);
  }

  protected onCompareAInput(event: Event): void {
    this.compareA.set((event.target as HTMLInputElement).value);
  }

  protected onCompareBInput(event: Event): void {
    this.compareB.set((event.target as HTMLInputElement).value);
  }
}
