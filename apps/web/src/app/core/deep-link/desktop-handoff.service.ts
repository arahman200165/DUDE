import { Injectable, inject } from '@angular/core';
import { PersistenceService } from '../persistence/persistence.service';
import { PlatformService } from '../platform/platform.service';
import { DudeDeepLink, formatDudeDeepLink } from "@dude/domain/core/deep-link/deep-link.model";

export const DESKTOP_RELEASES_URL = 'https://github.com/arahman200165/DUDE/releases/latest';
/** How long to wait for the OS to hand focus to Desktop DUDE before assuming it isn't installed. */
export const HANDOFF_DETECT_MS = 1500;

export type HandoffResult = 'opened' | 'not-detected';

/**
 * "Open in Desktop DUDE" from the web companion (DUDE_PRD.md §21 Phase 26 Item 8). It enhances a
 * web route and never replaces it (§10), and it is navigation-only: a `dude://open/...` link built
 * by the strict `formatDudeDeepLink`. No state, file, or token travels with it; that is Phase 59.
 *
 * Browsers can't tell whether a protocol handler is registered. If the page doesn't lose focus
 * within `HANDOFF_DETECT_MS`, the UI offers the download instead of failing silently.
 * `desktopInstalled` is the user's own "I have Desktop DUDE" hint, which promotes the action into
 * the tool header. Inert on desktop.
 */
@Injectable({ providedIn: 'root' })
export class DesktopHandoffService {
  private readonly platform = inject(PlatformService);

  readonly enabled = !this.platform.isDesktop();
  readonly desktopInstalled = inject(PersistenceService).signal('__desktop-handoff__', 'installed', 'local', false);

  linkFor(link: DudeDeepLink): string | null {
    return formatDudeDeepLink(link);
  }

  /** Resolves once it's known whether Desktop DUDE took focus. Each caller shows its own result. */
  open(link: DudeDeepLink): Promise<HandoffResult> {
    const raw = formatDudeDeepLink(link);
    if (!this.enabled || !raw) return Promise.resolve('not-detected');

    let handedOff = false;
    const onLeave = () => {
      handedOff = true;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onLeave();
    };
    window.addEventListener('blur', onLeave, { once: true });
    document.addEventListener('visibilitychange', onVisibility);
    const result = new Promise<HandoffResult>((resolve) =>
      setTimeout(() => {
        window.removeEventListener('blur', onLeave);
        document.removeEventListener('visibilitychange', onVisibility);
        if (handedOff) this.desktopInstalled.set(true);
        resolve(handedOff ? 'opened' : 'not-detected');
      }, HANDOFF_DETECT_MS),
    );

    const anchor = document.createElement('a');
    anchor.href = raw;
    anchor.rel = 'noopener';
    anchor.click();
    return result;
  }
}
