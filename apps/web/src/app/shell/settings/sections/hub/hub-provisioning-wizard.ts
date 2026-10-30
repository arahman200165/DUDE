import { Component, ElementRef, OnDestroy, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { HUB_OIDC_PATHS } from '@dude/contracts/hub';
import type { HubProvisioningComponent } from '@dude/contracts/hub';
import type {
  DesktopProvisionPowerPreview, DesktopProvisionRequest, DesktopProvisionResultMap, DesktopProvisionStandbyPreview, DesktopProvisionTunnelPreview,
} from '@dude/contracts/shared/models/platform-bridge.model';
import type { AgentStandbyStatus } from '@dude/contracts';
import { HUB_ADMIN } from '../../../../core/hub/hub-admin.token';
import {
  HUB_ADMIN_UNAVAILABLE, HubAdminError, type LocalHubInfo, type ProvisionProgress, type ProvisionStatus,
} from '../../../../core/hub/hub-admin.port';
import { PLATFORM_BRIDGE } from '../../../../core/platform/platform-bridge.adapter';
import { StatusGlyph } from '../../../../shared/components/status-glyph/status-glyph';
import { COMPONENT_TITLES, PLATFORM_CHIPS, chipForComponent, type PlatformChipView } from './hub-platform-status';
import { OUTCOME_TEXT, STEP_STATE_TEXT, WIZARD_COPY } from './hub-provisioning-wizard-state';
import {
  BACKUP_INTERVALS, DEFAULT_BACKUP_INTERVAL_HOURS, MIN_BACKUP_PASSPHRASE_LENGTH, canApplyTunnel, finishOutcome, isAlreadySet, isPreviewGone, passphraseProblem,
  provisionErrorText, redirectOriginFor, sessionClosedText, stepStateFor, stepsFor, type StepOutcome, type WizardStepId,
} from './hub-provisioning-wizard-state';

type Phase = 'idle' | 'opening' | 'running';

const BUTTON = 'rounded-sm border border-accent px-2 py-0.5 text-ui text-accent hover:bg-accent/10 disabled:opacity-50';
const BUTTON_QUIET = 'rounded-sm border border-border px-2 py-0.5 text-ui text-text-muted hover:bg-panel-elevated disabled:opacity-50';
const INPUT = 'w-full max-w-sm rounded-sm border border-border bg-panel px-2 py-0.5 text-text';

/**
 * Desktop only (Milestone 853): the wizard that sets up the Hub installed on this computer: storage, the Cloudflare tunnel, Google sign-in, backups, the
 * power policy and a warm standby copy. ONE Windows administrator prompt opens a session that every step reuses. Nothing runs from rendering: only a
 * button click calls the host, an exposure-widening or machine-setting step is a preview followed by an explicit confirm, and the tunnel confirm also
 * needs the exact typed phrase. Every secret (connector token, Google client secret, backup passphrase) lives only in a signal here, is copied and cleared
 * before the call is awaited, and is never rendered back or put in any message. Every step can be skipped and run again.
 */
@Component({
  selector: 'app-hub-provisioning-wizard',
  imports: [StatusGlyph],
  template: `
    @if (visible()) {
      <section data-setting class="flex flex-col gap-2" data-testid="hub-provisioning" aria-labelledby="provision-heading" (keydown.escape)="onEscape()">
        <h3 id="provision-heading" class="text-ui-sm font-semibold text-text">{{ copy.heading }}</h3>

        @switch (phase()) {
          @case ('idle') {
            <p class="text-ui text-text-muted">{{ copy.summary }}</p>
            @if (notice(); as message) { <p class="text-ui text-text" role="status" data-testid="provision-notice">{{ message }}</p> }
            <div><button #firstControl type="button" [class]="button" data-testid="provision-start" (click)="start()">{{ copy.start }}</button></div>
          }
          @case ('opening') {
            <p class="text-ui text-text-muted" role="status" data-testid="provision-waiting">{{ copy.waiting }}</p>
          }
          @default {
            <ol class="flex flex-wrap gap-x-3 gap-y-1 text-ui-xs" aria-label="Setup steps" data-testid="step-list">
              @for (s of steps(); track s.id; let i = $index) {
                <li [attr.aria-current]="i === index() ? 'step' : null" [class]="i === index() ? 'font-semibold text-accent' : 'text-text-muted'">{{ i + 1 }}. {{ s.title }}</li>
              }
            </ol>
            <fieldset class="m-0 flex min-w-0 flex-col gap-2 border-0 p-0" [attr.aria-busy]="busy() ? 'true' : null">
              <legend class="mb-1 text-ui-sm font-semibold text-text" data-testid="step-indicator">Step {{ index() + 1 }} of {{ steps().length }}: {{ stepTitle() }}</legend>
              @if (stepId() !== 'finish') { <p class="text-ui text-text-muted" data-testid="step-state">{{ stateText() }}</p> }

              @switch (stepId()) {
                @case ('status') {
                  <ul class="flex flex-col gap-1" data-testid="component-list">
                    @for (c of components(); track c.id) {
                      <li class="flex flex-wrap items-baseline gap-x-2" [attr.data-testid]="'component-' + c.id">
                        <span class="text-ui text-text">{{ title(c.id) }}</span>
                        <span class="inline-flex items-center gap-1 text-ui font-semibold" [class]="chip(c).tone"><app-status-glyph [kind]="chip(c).glyph" />{{ chip(c).label }}</span>
                        <span class="text-ui text-text-muted">{{ c.detail }}</span>
                      </li>
                    }
                  </ul>
                  @if (reentry().length > 0) { <p class="text-ui text-warning" data-testid="secrets-reenter">These secrets need to be entered again: {{ reentry().join(', ') }}.</p> }
                  <div><button #firstControl type="button" [class]="button" data-testid="run-provision" [disabled]="busy()" (click)="runProvision()">Create storage and check everything</button></div>
                  @if (provisionDone(); as r) {
                    <p class="text-ui text-success" role="status" data-testid="provision-created">Checked. {{ r.created.length === 0 ? 'Nothing needed creating.' : 'Created: ' + r.created.map(title).join(', ') + '.' }}</p>
                    @if (r.failed.length > 0) { <p class="text-ui text-warning" data-testid="provision-failed">Needs attention: {{ r.failed.map(title).join(', ') }}.</p> }
                  }
                }

                @case ('tunnel') {
                  @if (tunnelResult(); as r) {
                    <p class="text-ui text-success" role="status" data-testid="tunnel-done">The tunnel is set up for {{ r.hostname }}. Restart the Hub to bring it up; whether it is reachable can only be checked after the restart.</p>
                    @for (w of r.warnings; track w) { <p class="text-ui text-warning">{{ w }}</p> }
                  } @else if (tunnelPreview(); as p) {
                    <div class="flex flex-col gap-2" role="group" aria-label="Tunnel preview" data-testid="tunnel-preview">
                      <p class="text-ui text-text">In the Cloudflare dashboard, set up the public hostname for {{ p.hostname }} with these values:</p>
                      <ul class="flex flex-col gap-0.5" data-testid="dashboard-lines">
                        @for (line of p.dashboardLines; track line) { <li class="font-mono text-ui text-text">{{ line }}</li> }
                      </ul>
                      <ul class="flex flex-col gap-0.5" data-testid="tunnel-disclosure">
                        @for (line of p.disclosure; track line) { <li class="text-ui text-text-muted">{{ line }}</li> }
                      </ul>
                      @for (w of p.warnings; track w.id) { <p class="text-ui text-warning" data-testid="tunnel-warning">{{ w.reason }} {{ w.fix }}</p> }
                      @if (p.needsConnectorToken) {
                        <label class="text-ui text-text-muted" for="tunnel-token">Cloudflare connector token</label>
                        <input id="tunnel-token" #firstControl type="password" autocomplete="off" spellcheck="false" [class]="inputClass" [value]="connectorToken()" (input)="connectorToken.set($any($event.target).value)" />
                      }
                      <p class="text-ui text-warning">{{ copy.tunnelPhraseIntro }}</p>
                      <p class="font-mono text-ui text-text" data-testid="required-phrase">{{ p.requiredPhrase }}</p>
                      <label class="text-ui text-text-muted" for="tunnel-phrase">Type the phrase to confirm</label>
                      @if (p.needsConnectorToken) {
                        <input id="tunnel-phrase" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" [class]="inputClass" [value]="phrase()" (input)="phrase.set($any($event.target).value)" />
                      } @else {
                        <input id="tunnel-phrase" #firstControl type="text" autocomplete="off" autocapitalize="off" spellcheck="false" [class]="inputClass" [value]="phrase()" (input)="phrase.set($any($event.target).value)" />
                      }
                      <div class="flex gap-2">
                        <button type="button" [class]="button" data-testid="tunnel-apply" [disabled]="busy() || !tunnelConfirmable()" (click)="applyTunnel()">Turn on the tunnel</button>
                        <button type="button" [class]="quiet" [disabled]="busy()" (click)="discardTunnelPreview()">Change the hostname</button>
                      </div>
                    </div>
                  } @else {
                    <form class="flex flex-col gap-2" data-testid="tunnel-form" (submit)="previewTunnel($event)">
                      <p class="text-ui text-text">{{ copy.tunnelIntro }}</p>
                      <label class="text-ui text-text-muted" for="tunnel-hostname">Public hostname</label>
                      <input id="tunnel-hostname" #firstControl type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="hub.example.com" [class]="inputClass" [value]="tunnelHostname()" (input)="tunnelHostname.set($any($event.target).value)" />
                      <label class="flex items-start gap-2 text-ui text-text" for="tunnel-accept">
                        <input id="tunnel-accept" type="checkbox" class="mt-0.5" [checked]="acceptUnverified()" (change)="acceptUnverified.set($any($event.target).checked)" />
                        <span>I understand reachability can only be verified after the Hub restarts</span>
                      </label>
                      <div><button type="submit" [class]="button" data-testid="tunnel-preview-button" [disabled]="busy() || tunnelHostname().trim() === ''">Preview</button></div>
                    </form>
                  }
                }

                @case ('google') {
                  @if (googleResult(); as r) {
                    <p class="text-ui text-success" role="status" data-testid="google-done">Google sign-in is set up. Your password still works.{{ r.restartRequired ? ' Restart the Hub for it to take effect.' : '' }}</p>
                  } @else {
                    <form class="flex flex-col gap-2" data-testid="google-form" (submit)="submitGoogle($event)">
                      <p class="text-ui text-text">{{ copy.oidcIntro }}</p>
                      @if (redirectUri() !== '') { <p class="text-ui text-text-muted" data-testid="google-redirect">Add {{ redirectUri() }} as an authorized redirect URI.</p> }
                      <label class="text-ui text-text-muted" for="google-client-id">Client ID</label>
                      <input id="google-client-id" #firstControl type="text" autocomplete="off" spellcheck="false" [class]="inputClass" [value]="clientId()" (input)="clientId.set($any($event.target).value)" />
                      <label class="text-ui text-text-muted" for="google-client-secret">Client secret</label>
                      <input id="google-client-secret" type="password" autocomplete="off" spellcheck="false" [class]="inputClass" [value]="clientSecret()" (input)="clientSecret.set($any($event.target).value)" />
                      <label class="text-ui text-text-muted" for="google-origin">Redirect origin</label>
                      <input id="google-origin" type="text" autocomplete="off" spellcheck="false" placeholder="https://hub.example.com" [class]="inputClass" [value]="redirectOrigin()" (input)="redirectOrigin.set($any($event.target).value)" />
                      <div><button type="submit" [class]="button" data-testid="google-save" [disabled]="busy() || !googleValid()">Save Google sign-in</button></div>
                    </form>
                  }
                }

                @case ('backups') {
                  @if (backupResult(); as r) {
                    <p class="text-ui text-success" role="status" data-testid="backup-done">Backups are set up to run every {{ r.intervalHours }} hours. The passphrase is not stored anywhere: keep it safe.</p>
                  } @else {
                    <form class="flex flex-col gap-2" data-testid="backup-form" (submit)="submitBackup($event)">
                      <p class="text-ui text-text">{{ copy.backupIntro }}</p>
                      <div class="flex flex-wrap items-center gap-2">
                        <button #firstControl type="button" [class]="quiet" data-testid="backup-choose" [disabled]="busy()" (click)="chooseBackupFolder()">Choose backup folder…</button>
                        <span class="break-all text-ui text-text" data-testid="backup-folder">{{ backupFolder() ?? 'No folder chosen yet.' }}</span>
                      </div>
                      <label class="text-ui text-text-muted" for="backup-passphrase">Backup passphrase</label>
                      <input id="backup-passphrase" type="password" autocomplete="new-password" aria-describedby="backup-passphrase-hint" [class]="inputClass" [value]="passphrase()" (input)="passphrase.set($any($event.target).value)" />
                      <p id="backup-passphrase-hint" class="text-ui" data-testid="backup-hint" [class.text-text-muted]="passphrase() === '' || passphrase().length >= minPassphrase" [class.text-error]="passphrase() !== '' && passphrase().length < minPassphrase">Use at least {{ minPassphrase }} characters.</p>
                      <label class="text-ui text-text-muted" for="backup-confirm">Confirm passphrase</label>
                      <input id="backup-confirm" type="password" autocomplete="new-password" [attr.aria-invalid]="passphraseMismatch() ? 'true' : null" [class]="inputClass" [value]="passphraseConfirm()" (input)="passphraseConfirm.set($any($event.target).value)" />
                      @if (passphraseMismatch()) { <p class="text-ui text-error" data-testid="backup-mismatch">The two passphrases do not match.</p> }
                      <p class="text-ui text-warning" data-testid="backup-warning">{{ copy.backupWarning }}</p>
                      <label class="text-ui text-text-muted" for="backup-interval">How often</label>
                      <select id="backup-interval" class="w-full max-w-sm rounded-sm border border-border bg-panel px-2 py-0.5 text-text" (change)="backupInterval.set(+$any($event.target).value)">
                        @for (o of intervals; track o.hours) { <option [value]="o.hours" [selected]="o.hours === backupInterval()">{{ o.label }}</option> }
                      </select>
                      <div><button type="submit" [class]="button" data-testid="backup-save" [disabled]="busy() || !backupValid()">Set up backups</button></div>
                    </form>
                  }
                }

                @case ('power') {
                  @if (powerDone(); as message) {
                    <p class="text-ui text-success" role="status" data-testid="power-done">{{ message }}</p>
                  } @else if (powerPreview(); as p) {
                    <div class="flex flex-col gap-2" role="group" aria-label="Power change preview" data-testid="power-preview">
                      <p class="text-ui text-text">Before: {{ minutes(p.summary.before.sleepAcMinutes) }} to sleep and {{ minutes(p.summary.before.hibernateAcMinutes) }} to hibernate on AC power.</p>
                      <p class="text-ui text-text">After: {{ minutes(p.summary.after.sleepAcMinutes) }} to sleep and {{ minutes(p.summary.after.hibernateAcMinutes) }} to hibernate on AC power.</p>
                      <p class="text-ui text-text-muted">{{ p.summary.why }}</p>
                      <ul class="flex flex-col gap-0.5" data-testid="power-commands">
                        @for (c of p.summary.commands; track c) { <li class="font-mono text-ui text-text">{{ c }}</li> }
                      </ul>
                      @if (p.summary.revertWith !== null) { <p class="text-ui text-text-muted">To undo it later, run {{ p.summary.revertWith }} on this computer.</p> }
                      <div class="flex gap-2">
                        <button #firstControl type="button" [class]="button" data-testid="power-confirm" [disabled]="busy()" (click)="applyPower()">Confirm</button>
                        <button type="button" [class]="quiet" [disabled]="busy()" (click)="powerPreview.set(null)">Back</button>
                      </div>
                    </div>
                  } @else {
                    <p class="text-ui text-text">{{ copy.powerIntro }}</p>
                    <div><button #firstControl type="button" [class]="button" data-testid="power-preview-button" [disabled]="busy()" (click)="previewPower()">Preview the change</button></div>
                  }
                }

                @case ('standby') {
                  @if (standbyDone(); as message) {
                    <p class="text-ui text-success" role="status" data-testid="standby-done">{{ message }}</p>
                  } @else {
                    <p class="text-ui text-text">{{ copy.standbyIntro }}</p>
                    <p class="text-ui text-text-muted" data-testid="standby-device">This computer's device id: <span class="font-mono text-text">{{ status()?.deviceId ?? 'not connected to a Hub yet' }}</span></p>
                    <div class="flex flex-wrap items-center gap-2">
                      <button #firstControl type="button" [class]="quiet" data-testid="standby-choose" [disabled]="busy()" (click)="chooseStandbyFolder()">Choose standby folder…</button>
                      <span class="break-all text-ui text-text" data-testid="standby-folder">{{ standbyStatus()?.folder ?? 'No folder chosen yet.' }}</span>
                    </div>
                    @if (standbyStatus(); as s) {
                      <p class="text-ui text-text-muted" data-testid="standby-status">Standby: {{ s.phase }}.@if (s.lastError) { <span class="text-warning"> {{ s.lastError.message }}</span> }</p>
                    }
                    @if (standbyPreview(); as p) {
                      <div class="flex flex-col gap-2" role="group" aria-label="Standby grant preview" data-testid="standby-preview">
                        <p class="text-ui text-text">{{ p.summary.displayName ?? 'This computer' }} will be allowed to pull the Hub's encrypted backups ({{ p.summary.repositories }} {{ p.summary.repositories === 1 ? 'repository' : 'repositories' }}).{{ p.summary.alreadyGranted ? ' It already has this permission; confirming renews it.' : '' }}</p>
                        <p class="text-ui text-text-muted">{{ p.summary.serves }}</p>
                        <div class="flex gap-2">
                          <button type="button" [class]="button" data-testid="standby-confirm" [disabled]="busy()" (click)="applyStandby()">Confirm</button>
                          <button type="button" [class]="quiet" [disabled]="busy()" (click)="standbyPreview.set(null)">Back</button>
                        </div>
                      </div>
                    } @else {
                      <div><button type="button" [class]="button" data-testid="standby-preview-button" [disabled]="busy() || !standbyReady()" (click)="previewStandby()">Preview</button></div>
                    }
                  }
                }

                @case ('finish') {
                  <ul class="flex flex-col gap-1" data-testid="finish-summary">
                    @for (row of finishRows(); track row.id) {
                      <li class="flex flex-wrap items-baseline gap-x-2" [attr.data-testid]="'finish-' + row.id">
                        <span class="text-ui text-text">{{ row.title }}</span>
                        <span class="text-ui font-semibold" [class]="row.outcome === 'done' ? 'text-success' : row.outcome === 'needs-attention' ? 'text-warning' : 'text-text-muted'">{{ row.label }}</span>
                      </li>
                    }
                  </ul>
                  @if (restartRequired()) {
                    <p class="text-ui text-text" data-testid="restart-note">Some changes only take effect after the Hub restarts.</p>
                    <div class="flex gap-2">
                      <button #firstControl type="button" [class]="button" data-testid="restart-hub" [disabled]="busy()" (click)="restart()">Restart the Hub now</button>
                      <button type="button" [class]="quiet" data-testid="close-wizard" [disabled]="busy()" (click)="finish()">Close without restarting</button>
                    </div>
                  } @else {
                    <div><button #firstControl type="button" [class]="button" data-testid="close-wizard" [disabled]="busy()" (click)="finish()">Close</button></div>
                  }
                }
              }
            </fieldset>

            @if (busy()) { <p class="text-ui text-text-muted" role="status" data-testid="provision-busy">Working…</p> }
            @if (stepId() !== 'finish') {
              <div class="flex gap-2">
                <button type="button" [class]="quiet" data-testid="step-next" [disabled]="busy()" (click)="next()">{{ currentOutcome() === 'done' ? 'Next' : copy.skip }}</button>
                <button type="button" [class]="quiet" data-testid="cancel-wizard" [disabled]="busy()" (click)="cancel()">Cancel setup</button>
              </div>
            }
          }
        }

        <div aria-live="polite">
          @if (error(); as message) { <p class="text-ui text-error" role="alert" data-testid="provision-error">{{ message }}</p> }
        </div>
      </section>
    }
  `,
})
export class HubProvisioningWizard implements OnDestroy {
  private readonly hub = inject(HUB_ADMIN);
  private readonly platform = inject(PLATFORM_BRIDGE);

  /** Any value that changes when the section reloads the Hub (so the wizard re-reads whether this PC has a Hub with an owner). */
  readonly refreshOn = input<unknown>(null);
  /** The Hub was restarted or its configuration changed. */
  readonly changed = output<void>();

  protected readonly copy = WIZARD_COPY;
  protected readonly button = BUTTON;
  protected readonly quiet = BUTTON_QUIET;
  protected readonly inputClass = INPUT;
  protected readonly intervals = BACKUP_INTERVALS;
  protected readonly minPassphrase = MIN_BACKUP_PASSPHRASE_LENGTH;

  private readonly info = signal<LocalHubInfo | null>(null);
  protected readonly phase = signal<Phase>('idle');
  protected readonly notice = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly index = signal(0);
  protected readonly status = signal<ProvisionStatus | null>(null);
  private readonly standbyOn = signal(false);
  protected readonly outcomes = signal<Partial<Record<WizardStepId, StepOutcome>>>({});
  protected readonly restartRequired = signal(false);

  protected readonly visible = computed(() => {
    if (this.phase() !== 'idle') return true;
    const i = this.info();
    return this.hub.provisionOpen !== undefined && i !== null && i.installed && i.found && i.bootstrapped === true;
  });
  protected readonly steps = computed(() => stepsFor(this.standbyOn()));
  protected readonly stepId = computed<WizardStepId>(() => this.steps()[this.index()]?.id ?? 'finish');
  protected readonly stepTitle = computed(() => this.steps()[this.index()]?.title ?? '');
  protected readonly stateText = computed(() => STEP_STATE_TEXT[stepStateFor(this.stepId(), this.status())]);
  protected readonly currentOutcome = computed(() => this.outcomes()[this.stepId()]);
  protected readonly components = computed<readonly HubProvisioningComponent[]>(() => this.status()?.provisioning.components ?? []);
  protected readonly reentry = computed(() => (this.status()?.provisioning.secrets ?? []).filter((s) => s.needsReentry).map((s) => s.purpose));
  protected readonly finishRows = computed(() =>
    this.steps().filter((s) => s.id !== 'finish').map((s) => {
      const outcome = finishOutcome(this.outcomes()[s.id], stepStateFor(s.id, this.status()));
      return { id: s.id, title: s.title, outcome, label: OUTCOME_TEXT[outcome] };
    }),
  );

  // Status
  protected readonly provisionDone = signal<DesktopProvisionResultMap['provision'] | null>(null);

  // Tunnel
  protected readonly tunnelHostname = signal('');
  protected readonly acceptUnverified = signal(false);
  protected readonly tunnelPreview = signal<DesktopProvisionTunnelPreview | null>(null);
  private previewedAccept = false;
  protected readonly connectorToken = signal('');
  protected readonly phrase = signal('');
  protected readonly tunnelResult = signal<DesktopProvisionResultMap['tunnel-apply'] | null>(null);
  protected readonly tunnelConfirmable = computed(() => {
    const p = this.tunnelPreview();
    return p !== null && canApplyTunnel(this.phrase(), p.requiredPhrase) && (!p.needsConnectorToken || this.connectorToken() !== '');
  });

  // Google
  protected readonly clientId = signal('');
  protected readonly clientSecret = signal('');
  protected readonly redirectOrigin = signal('');
  protected readonly googleResult = signal<DesktopProvisionResultMap['oidc'] | null>(null);
  protected readonly googleValid = computed(() => this.clientId().trim() !== '' && this.clientSecret() !== '' && this.redirectOrigin().trim() !== '');
  protected readonly redirectUri = computed(() => {
    const origin = redirectOriginFor(this.redirectOrigin());
    return origin === '' ? '' : `${origin}${HUB_OIDC_PATHS.callback}`;
  });

  // Backups
  protected readonly backupFolder = signal<string | null>(null);
  protected readonly passphrase = signal('');
  protected readonly passphraseConfirm = signal('');
  protected readonly backupInterval = signal(DEFAULT_BACKUP_INTERVAL_HOURS);
  protected readonly backupResult = signal<DesktopProvisionResultMap['backup'] | null>(null);
  protected readonly passphraseMismatch = computed(() => this.passphraseConfirm() !== '' && this.passphraseConfirm() !== this.passphrase());
  protected readonly backupValid = computed(() => this.backupFolder() !== null && passphraseProblem(this.passphrase(), this.passphraseConfirm()) === null);

  // Power
  protected readonly powerPreview = signal<DesktopProvisionPowerPreview | null>(null);
  protected readonly powerDone = signal<string | null>(null);

  // Standby
  protected readonly standbyStatus = signal<AgentStandbyStatus | null>(null);
  protected readonly standbyPreview = signal<DesktopProvisionStandbyPreview | null>(null);
  protected readonly standbyDone = signal<string | null>(null);
  protected readonly standbyReady = computed(() => (this.status()?.deviceId ?? null) !== null && (this.standbyStatus()?.folder ?? null) !== null);

  private readonly firstControl = viewChild<ElementRef<HTMLElement>>('firstControl');
  private readonly unsubscribe: (() => void) | undefined;

  constructor() {
    effect(() => {
      this.refreshOn();
      untracked(() => void this.loadInfo());
    });
    effect(() => this.firstControl()?.nativeElement.focus());
    this.unsubscribe = this.hub.onProvisionProgress?.((progress) => this.onProgress(progress));
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
    this.clearSecrets();
    if (this.phase() !== 'idle') void this.closeSession();
  }

  protected title = (id: string): string => (COMPONENT_TITLES as Readonly<Record<string, string>>)[id] ?? id;
  protected chip = (c: HubProvisioningComponent): PlatformChipView => PLATFORM_CHIPS[chipForComponent(c.state)];
  protected minutes = (value: number | null): string => (value === null ? 'an unknown time' : value === 0 ? 'never' : `${value} minutes`);

  private async loadInfo(): Promise<void> {
    if (!this.hub.localHubInfo || !this.hub.provisionOpen) return;
    try {
      this.info.set(await this.hub.localHubInfo());
    } catch {
      this.info.set(null);
    }
  }

  private onProgress(progress: ProvisionProgress): void {
    if (progress.kind !== 'session') return;
    // `waiting-for-administrator` is already what the opening screen says, and `open` is answered by `provisionOpen` itself.
    // A session that closes while the wizard is running (idle timeout, ended, cancelled, failed) returns to the start screen; one the owner
    // closed (phase already idle) or one that failed while opening (the rejected call reports it) needs nothing here.
    if (progress.state === 'closed' && this.phase() === 'running') this.resetToStart(sessionClosedText(progress.reason));
  }

  private async closeSession(): Promise<void> {
    try {
      await this.hub.provisionClose?.();
    } catch {
      // The session may already be gone; nothing else to undo.
    }
  }

  private clearSecrets(): void {
    this.connectorToken.set('');
    this.phrase.set('');
    this.clientSecret.set('');
    this.passphrase.set('');
    this.passphraseConfirm.set('');
  }

  private resetToStart(notice: string | null): void {
    this.clearSecrets();
    this.busy.set(false);
    this.error.set(null);
    this.notice.set(notice);
    this.phase.set('idle');
  }

  private resetState(): void {
    this.clearSecrets();
    this.index.set(0);
    this.outcomes.set({});
    this.restartRequired.set(false);
    this.provisionDone.set(null);
    this.tunnelPreview.set(null);
    this.tunnelResult.set(null);
    this.tunnelHostname.set('');
    this.acceptUnverified.set(false);
    this.clientId.set('');
    this.redirectOrigin.set('');
    this.googleResult.set(null);
    this.backupFolder.set(null);
    this.backupInterval.set(DEFAULT_BACKUP_INTERVAL_HOURS);
    this.backupResult.set(null);
    this.powerPreview.set(null);
    this.powerDone.set(null);
    this.standbyStatus.set(null);
    this.standbyPreview.set(null);
    this.standbyDone.set(null);
    this.error.set(null);
    this.notice.set(null);
  }

  private discardPreviews(): void {
    this.tunnelPreview.set(null);
    this.powerPreview.set(null);
    this.standbyPreview.set(null);
  }

  /** Runs one action with the busy flag and the error line; a lost session returns to the start screen. */
  private async act(action: () => Promise<void>): Promise<void> {
    this.error.set(null);
    this.busy.set(true);
    try {
      await action();
    } catch (error) {
      if (error instanceof HubAdminError && (error.code === 'no-session' || error.code === 'session-failed')) this.resetToStart(provisionErrorText(error));
      else this.error.set(provisionErrorText(error));
    } finally {
      this.busy.set(false);
    }
  }

  private async step<S extends DesktopProvisionRequest['step']>(request: Extract<DesktopProvisionRequest, { readonly step: S }>): Promise<DesktopProvisionResultMap[S]> {
    if (!this.hub.provisionStep) throw new HubAdminError(HUB_ADMIN_UNAVAILABLE, 'Setting up the Hub platform is not available here.');
    return this.hub.provisionStep(request);
  }

  private mark(id: WizardStepId, outcome: StepOutcome): void {
    this.outcomes.update((o) => ({ ...o, [id]: outcome }));
  }

  // ---- Session ----
  protected async start(): Promise<void> {
    if (this.phase() !== 'idle' || !this.hub.provisionOpen) return;
    this.resetState();
    this.standbyOn.set(this.platform.get()?.standby !== undefined);
    this.phase.set('opening');
    try {
      this.status.set(await this.hub.provisionOpen());
      this.phase.set('running');
    } catch (error) {
      this.resetToStart(null);
      this.error.set(provisionErrorText(error));
    }
  }

  protected onEscape(): void {
    // Escape only drops an open preview and what was typed for it; it never ends the session and never applies anything.
    if (this.busy()) return;
    this.clearSecrets();
    this.discardPreviews();
  }

  protected async cancel(): Promise<void> {
    this.clearSecrets();
    this.resetToStart(WIZARD_COPY.stopped);
    await this.closeSession();
  }

  protected async finish(): Promise<void> {
    this.resetToStart(WIZARD_COPY.closed);
    await this.closeSession();
    this.changed.emit();
  }

  protected async restart(): Promise<void> {
    await this.act(async () => {
      await this.step({ step: 'restart' });
      this.resetToStart(WIZARD_COPY.restarting);
      this.changed.emit();
    });
  }

  // ---- Navigation ----
  protected next(): void {
    const id = this.stepId();
    if (this.outcomes()[id] === undefined) this.mark(id, this.error() !== null ? 'needs-attention' : 'skipped');
    this.clearSecrets();
    this.discardPreviews();
    this.error.set(null);
    this.index.update((i) => Math.min(i + 1, this.steps().length - 1));
    const entered = this.stepId();
    if (entered === 'google' && this.redirectOrigin() === '') this.redirectOrigin.set(redirectOriginFor(this.tunnelResult()?.hostname ?? this.status()?.tunnel?.hostname ?? this.tunnelHostname()));
    if (entered === 'standby') void this.loadStandbyStatus();
  }

  // ---- Status ----
  protected async runProvision(): Promise<void> {
    await this.act(async () => {
      const result = await this.step({ step: 'provision' });
      this.provisionDone.set(result);
      this.status.update((s) => (s === null ? s : { ...s, provisioning: result.report }));
      if (result.restartRequired) this.restartRequired.set(true);
      this.mark('status', result.failed.length > 0 ? 'needs-attention' : 'done');
    });
  }

  // ---- Tunnel ----
  protected async previewTunnel(event: Event): Promise<void> {
    event.preventDefault();
    const hostname = this.tunnelHostname().trim();
    if (hostname === '' || this.busy()) return;
    const accept = this.acceptUnverified();
    await this.act(async () => {
      this.tunnelPreview.set(await this.step({ step: 'tunnel-preview', hostname, acceptUnverifiedReachability: accept }));
      this.previewedAccept = accept;
    });
  }

  protected discardTunnelPreview(): void {
    this.connectorToken.set('');
    this.phrase.set('');
    this.tunnelPreview.set(null);
  }

  protected async applyTunnel(): Promise<void> {
    const preview = this.tunnelPreview();
    const typed = this.phrase();
    const token = this.connectorToken();
    if (preview === null || this.busy() || !canApplyTunnel(typed, preview.requiredPhrase) || (preview.needsConnectorToken && token === '')) return;
    this.connectorToken.set('');
    this.phrase.set('');
    await this.act(async () => {
      try {
        const base = {
          step: 'tunnel-apply' as const, hostname: preview.hostname, confirmToken: preview.confirmToken, acknowledgement: typed,
          acceptUnverifiedReachability: this.previewedAccept,
        };
        const result = await this.step(preview.needsConnectorToken ? { ...base, connectorToken: token } : base);
        this.tunnelResult.set(result);
        this.tunnelPreview.set(null);
        this.restartRequired.set(true);
        this.mark('tunnel', 'done');
      } catch (error) {
        // A spent or expired preview cannot be applied again: back to the form, with the message, to preview again.
        if (isPreviewGone(error)) this.tunnelPreview.set(null);
        throw error;
      }
    });
  }

  // ---- Google sign-in ----
  protected async submitGoogle(event: Event): Promise<void> {
    event.preventDefault();
    const clientId = this.clientId().trim();
    const clientSecret = this.clientSecret();
    const redirectOrigin = this.redirectOrigin().trim();
    if (clientId === '' || clientSecret === '' || redirectOrigin === '' || this.busy()) return;
    this.clientSecret.set('');
    await this.act(async () => {
      const result = await this.step({ step: 'oidc', clientId, clientSecret, redirectOrigin });
      this.googleResult.set(result);
      if (result.restartRequired) this.restartRequired.set(true);
      this.mark('google', 'done');
    });
  }

  // ---- Backups ----
  protected async chooseBackupFolder(): Promise<void> {
    await this.act(async () => {
      if (!this.hub.provisionChooseBackupFolder) throw new HubAdminError(HUB_ADMIN_UNAVAILABLE, 'Choosing a folder is not available here.');
      const result = await this.hub.provisionChooseBackupFolder();
      if (!result.canceled && result.folder !== null) this.backupFolder.set(result.folder);
    });
  }

  protected async submitBackup(event: Event): Promise<void> {
    event.preventDefault();
    const passphrase = this.passphrase();
    const confirm = this.passphraseConfirm();
    if (this.busy() || this.backupFolder() === null || passphraseProblem(passphrase, confirm) !== null) return;
    this.passphrase.set('');
    this.passphraseConfirm.set('');
    const intervalHours = this.backupInterval();
    await this.act(async () => {
      this.backupResult.set(await this.step({ step: 'backup', passphrase, intervalHours }));
      this.mark('backups', 'done');
    });
  }

  // ---- Power ----
  protected async previewPower(): Promise<void> {
    await this.act(async () => {
      try {
        this.powerPreview.set(await this.step({ step: 'power-preview' }));
      } catch (error) {
        if (!isAlreadySet(error)) throw error;
        this.powerDone.set('This computer is already set to stay awake on AC power. Nothing to change.');
        this.mark('power', 'done');
      }
    });
  }

  protected async applyPower(): Promise<void> {
    const preview = this.powerPreview();
    if (preview === null || this.busy()) return;
    await this.act(async () => {
      try {
        await this.step({ step: 'power-apply', confirmToken: preview.confirmToken });
        this.powerPreview.set(null);
        this.powerDone.set('Power settings changed: this computer stays awake on AC power.');
        this.mark('power', 'done');
      } catch (error) {
        if (isPreviewGone(error)) this.powerPreview.set(null);
        throw error;
      }
    });
  }

  // ---- Standby ----
  private async loadStandbyStatus(): Promise<void> {
    const standby = this.platform.get()?.standby;
    if (standby === undefined) return;
    try {
      const result = await standby.status();
      if (result.ok) this.standbyStatus.set(result.result);
    } catch {
      // The status is a nicety; choosing a folder reports its own failure.
    }
  }

  protected async chooseStandbyFolder(): Promise<void> {
    await this.act(async () => {
      const standby = this.platform.get()?.standby;
      if (standby === undefined) throw new HubAdminError(HUB_ADMIN_UNAVAILABLE, 'The standby copy is not available here.');
      const result = await standby.chooseFolder();
      if (!result.ok) throw new HubAdminError(result.error.code, result.error.message);
      if (!result.result.canceled) this.standbyStatus.set(result.result.status);
    });
  }

  protected async previewStandby(): Promise<void> {
    await this.act(async () => {
      this.standbyPreview.set(await this.step({ step: 'standby-preview' }));
    });
  }

  protected async applyStandby(): Promise<void> {
    const preview = this.standbyPreview();
    if (preview === null || this.busy()) return;
    await this.act(async () => {
      try {
        const result = await this.step({ step: 'standby-apply', confirmToken: preview.confirmToken });
        this.standbyPreview.set(null);
        this.standbyDone.set(result.renewed ? 'The permission for this computer to keep a standby copy was renewed.' : 'This computer may now keep an encrypted standby copy of the Hub\'s backups.');
        this.mark('standby', 'done');
      } catch (error) {
        if (isPreviewGone(error)) this.standbyPreview.set(null);
        throw error;
      }
    });
  }
}
