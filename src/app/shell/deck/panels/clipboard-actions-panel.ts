import { Component, inject } from '@angular/core';
import { CommandActionsRail } from '../command-actions-rail/command-actions-rail';
import { NativeCommandsService } from './native-commands.service';

/** One-click clipboard Quick Actions (desktop). Runs a command only on click. */
@Component({
  selector: 'app-clipboard-actions-panel',
  imports: [CommandActionsRail],
  template: `<app-command-actions-rail title="Clipboard Actions" [commands]="native.clipboardActions()" />`,
})
export class ClipboardActionsPanel {
  protected readonly native = inject(NativeCommandsService);
}
