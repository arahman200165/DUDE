import { Component, input } from '@angular/core';
import { StatusGlyph } from '../status-glyph/status-glyph';

@Component({
  selector: 'app-offline-badge',
  imports: [StatusGlyph],
  templateUrl: './offline-badge.html',
})
export class OfflineBadge {
  readonly show = input(true);
}
