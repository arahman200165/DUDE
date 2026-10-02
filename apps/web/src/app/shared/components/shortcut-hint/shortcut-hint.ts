import { Component, input } from '@angular/core';

/**
 * A compact "Ctrl+K" chip for any search/discovery affordance (sidebar, Browse Tools, Deck; Phase
 * 30B.2). Purely presentational -- callers still wire their own `(click)="paletteService.open()"`.
 * Replaces 3 previously copy-pasted instances of the same markup.
 */
@Component({
  selector: 'app-shortcut-hint',
  template: `<span class="font-mono text-ui-xs text-text-muted">{{ label() }}</span>`,
  host: { class: 'contents' },
})
export class ShortcutHint {
  readonly label = input('Ctrl+K');
}
