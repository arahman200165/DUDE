import { Component, input, output } from '@angular/core';
import { StatusGlyph } from '../status-glyph/status-glyph';

@Component({
  selector: 'app-error-panel',
  imports: [StatusGlyph],
  templateUrl: './error-panel.html',
})
export class ErrorPanel {
  readonly message = input.required<string>();
  readonly retryable = input(false);
  readonly retry = output<void>();
}
