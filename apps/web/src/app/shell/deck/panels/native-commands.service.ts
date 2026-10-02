import { Injectable, computed, inject } from '@angular/core';
import { COMMAND_SOURCE } from '../../../shared/models/command-source.model';

/** `NativeCommandSource`'s own id prefix for a clipboard Quick Action, kept in sync there. */
export const QUICK_ACTION_ID_PREFIX = 'native:quick-action:';

/**
 * Both desktop rails are filtered views over the live `COMMAND_SOURCE` feed's `'native'`-kind
 * commands — never a second hand-rolled action list. Clipboard Actions is exactly the per-quick-action
 * commands; Native Capabilities is the small fixed set alongside them.
 */
@Injectable({ providedIn: 'root' })
export class NativeCommandsService {
  private readonly sources = inject(COMMAND_SOURCE, { optional: true }) ?? [];
  private readonly native = computed(() => this.sources.flatMap((source) => source.commands()).filter((c) => c.kind === 'native'));

  readonly clipboardActions = computed(() => this.native().filter((c) => c.id.startsWith(QUICK_ACTION_ID_PREFIX)));
  readonly nativeCapabilities = computed(() => this.native().filter((c) => !c.id.startsWith(QUICK_ACTION_ID_PREFIX)));
}
