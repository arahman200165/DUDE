import { Component } from '@angular/core';

/**
 * Placeholder shells for the Hub administration sections (Environment & Hub, Devices, Security & Sessions).
 * They are registered so navigation, search and host filtering exist from the start; the real panels replace
 * these three components without touching the section list.
 */
@Component({
  selector: 'app-environment-settings-placeholder',
  template: `<p data-testid="hub-section-loading" class="text-ui text-text-muted">Loading Environment &amp; Hub…</p>`,
})
export class EnvironmentSettingsPlaceholder {}

@Component({
  selector: 'app-devices-settings-placeholder',
  template: `<p data-testid="hub-section-loading" class="text-ui text-text-muted">Loading Devices…</p>`,
})
export class DevicesSettingsPlaceholder {}

@Component({
  selector: 'app-security-settings-placeholder',
  template: `<p data-testid="hub-section-loading" class="text-ui text-text-muted">Loading Security &amp; Sessions…</p>`,
})
export class SecuritySettingsPlaceholder {}
