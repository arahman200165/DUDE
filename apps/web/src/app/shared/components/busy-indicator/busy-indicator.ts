import { Component, input } from '@angular/core';
import { StatusGlyph } from '../status-glyph/status-glyph';

export type BusyIndicatorStatus = 'idle' | 'running' | 'done' | 'error' | 'cancelled';

@Component({
  selector: 'app-busy-indicator',
  imports: [StatusGlyph],
  templateUrl: './busy-indicator.html',
})
export class BusyIndicator {
  readonly status = input.required<BusyIndicatorStatus>();
  readonly progress = input<number | null>(null);
}
