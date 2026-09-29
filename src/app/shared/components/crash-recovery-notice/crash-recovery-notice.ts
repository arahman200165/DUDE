import { Component, inject } from '@angular/core';
import { CrashRecoveryService } from '../../../core/platform/crash-recovery.service';
import { StatusGlyph } from '../status-glyph/status-glyph';

/**
 * A dismissible notice shown only on the one launch immediately following an unclean exit (DUDE_PRD.md
 * §21 Phase 25 Item 6) -- mirrors `ShellLayout`'s existing `desktopOpen.error()`/`deepLink.error()`
 * fixed-position dismissible-notice shape exactly, rather than inventing a new one.
 */
@Component({
  selector: 'app-crash-recovery-notice',
  imports: [StatusGlyph],
  templateUrl: './crash-recovery-notice.html',
})
export class CrashRecoveryNotice {
  protected readonly crashRecovery = inject(CrashRecoveryService);
}
