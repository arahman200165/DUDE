import { Component, computed, input } from '@angular/core';
import { StatusGlyph } from '../../../../shared/components/status-glyph/status-glyph';
import { HUB_CONNECTION_COPY, type HubConnectionKind } from './hub-format';

/** A Hub connection state as glyph plus text (never color alone). */
@Component({
  selector: 'app-hub-status-badge',
  imports: [StatusGlyph],
  template: `<span class="inline-flex items-center gap-1 text-ui font-semibold" [class]="copy().tone" data-testid="hub-state"><app-status-glyph [kind]="copy().glyph" />{{ copy().label }}</span>`,
})
export class HubStatusBadge {
  readonly kind = input.required<HubConnectionKind>();
  protected readonly copy = computed(() => HUB_CONNECTION_COPY[this.kind()]);
}
