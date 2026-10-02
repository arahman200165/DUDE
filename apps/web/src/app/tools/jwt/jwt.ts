import { EXPIRY_BADGE_CLASSES, Jwt_format, Jwt_expiryBadgeClasses } from "@dude/tool-engine/tools/jwt/jwt.embedded-engine";
import { Component, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PasteHandoffService } from '../../core/paste-detect/paste-handoff.service';
import { consumeWorkspaceState } from "@dude/tool-engine/core/workspace/workspace-handoff";
import { JwtExpiryStatus, decodeJwt, decodeTemporalClaim } from "@dude/tool-engine/tools/jwt/jwt-decode";


/**
 * Deliberately does NOT inject PersistenceService — JWTs are sensitive and
 * this tool must never persist input, even under a `session` policy
 * (PRD Section 14.1/30: JWT values are the canonical "no automatic
 * persistence" example, and a plain in-memory signal is the simplest way
 * to guarantee that no storage backend is ever touched).
 */
@Component({
  selector: 'app-jwt',
  imports: [ToolShell, ErrorPanel],
  templateUrl: './jwt.html',
})
export class Jwt {
  protected readonly token = signal('');
  protected readonly result = computed(() => decodeJwt(this.token()));

  constructor() {
    // Smart Paste-Detection prefill (DUDE_PRD.md §21 Phase 21 Item 3) — see PasteHandoffService.
    // In-memory only, same as `token` above — never touches PersistenceService.
    const handoff = inject(PasteHandoffService).consume('jwt');
    if (handoff !== undefined) this.token.set(handoff);

    // Workspace tab-restore / History restore (DUDE_PRD.md §21 Phase 21 Items 4-5) — see
    // jwt.workspace-step.ts. Same in-memory-only shape as the Smart Paste hand-off above.
    const workspaceState = consumeWorkspaceState('jwt');
    if (typeof workspaceState?.['token'] === 'string') this.token.set(workspaceState['token']);
  }

  protected readonly issuedAt = computed(() => {
    const current = this.result();
    return current.ok ? decodeTemporalClaim(current.payload, 'iat') : null;
  });

  protected readonly notBefore = computed(() => {
    const current = this.result();
    return current.ok ? decodeTemporalClaim(current.payload, 'nbf') : null;
  });

  protected onTokenInput(event: Event): void {
    this.token.set((event.target as HTMLTextAreaElement).value);
  }

  protected clear(): void {
    this.token.set('');
  }
  protected format = Jwt_format;

  protected expiryBadgeClasses = Jwt_expiryBadgeClasses;

}
