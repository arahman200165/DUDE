import { Component, inject } from '@angular/core';
import { SecuritySettings } from '../security-settings';
import { HubOwnerSession } from './hub-owner-session.service';
import { OwnerGate } from './owner-gate';

/** Security & Sessions behind the owner gate: the section only exists (and only loads) while an owner session does. */
@Component({
  selector: 'app-owner-gated-security',
  imports: [OwnerGate, SecuritySettings],
  template: `
    <div class="flex flex-col gap-4">
      <app-owner-gate />
      @if (session.signedIn()) { <app-security-settings /> }
    </div>
  `,
})
export class OwnerGatedSecuritySettings {
  protected readonly session = inject(HubOwnerSession);
}
