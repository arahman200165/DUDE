import { Component, input, output } from '@angular/core';
import type { RemoteChangeNoticeKind } from '../../../core/sync/open-editor-merge';

/**
 * The non-blocking "Changed on another device" strip an open editor shows when a live merge could not keep both
 * sides (PD-113). The editor owns the draft and the decision; this only renders the choice. The live region is always
 * present so the message is announced when it appears, and both actions are plain buttons in the tab order.
 */
@Component({
  selector: 'app-remote-change-notice',
  templateUrl: './remote-change-notice.html',
})
export class RemoteChangeNotice {
  /** Null renders nothing but keeps the live region. */
  readonly kind = input<RemoteChangeNoticeKind | null>(null);
  readonly useOther = output<void>();
  readonly keepEditing = output<void>();
}
