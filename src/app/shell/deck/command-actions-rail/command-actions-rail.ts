import { Component, input } from '@angular/core';
import { PaletteCommand } from '../../../shared/models/command-source.model';

/**
 * Generic desktop-only rail of one-click `PaletteCommand`s (DUDE_PRD.md §21 Phase 25 Item 1) --
 * shared by Deck's "Clipboard Actions" and "Native Capabilities" rails, both of which are filtered
 * views over the live `COMMAND_SOURCE` feed (`kind === 'native'`), never a second hand-rolled action
 * list. A generic action rail rather than two near-identical components, since both only ever need
 * "show a title, run `execute()` on click."
 */
@Component({
  selector: 'app-command-actions-rail',
  templateUrl: './command-actions-rail.html',
})
export class CommandActionsRail {
  readonly title = input.required<string>();
  readonly commands = input.required<readonly PaletteCommand[]>();

  protected run(command: PaletteCommand): void {
    void command.execute();
  }
}
