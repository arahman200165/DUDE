import { Component, inject } from '@angular/core';
import { CommandActionsRail } from '../command-actions-rail/command-actions-rail';
import { NativeCommandsService } from './native-commands.service';

/** The small fixed set of native capabilities (desktop). Each runs through its own command path on click. */
@Component({
  selector: 'app-native-capabilities-panel',
  imports: [CommandActionsRail],
  template: `<app-command-actions-rail title="Native Capabilities" [commands]="native.nativeCapabilities()" />`,
})
export class NativeCapabilitiesPanel {
  protected readonly native = inject(NativeCommandsService);
}
