import { Component, ElementRef, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { HUB_ADMIN } from '../../../../core/hub/hub-admin.token';
import { HUB_ADMIN_UNAVAILABLE, HubAdminError, type LocalHubInfo, type LocalHubUpdateResult } from '../../../../core/hub/hub-admin.port';
import { RecoveryCodesDisplay } from '../../../hub/recovery-codes-display';
import { MIN_PASSWORD_LENGTH, setupErrorText, updateErrorText } from './local-hub-copy';

type SetupStep = 'idle' | 'intro' | 'form' | 'working' | 'codes' | 'follow-up' | 'done';
type UpdateStep = 'idle' | 'confirm' | 'working' | 'done';

/**
 * Desktop only: set up the Hub installed on this computer, and update it when the app bundles a newer one.
 * Nothing runs from rendering or from a preview step; only the explicit submit / Confirm buttons call the host.
 * The password and the recovery codes live only in this component's signals and are dropped after use.
 */
@Component({
  selector: 'app-local-hub-panel',
  imports: [RecoveryCodesDisplay],
  template: `
    @if (setupVisible()) {
      <div data-setting class="flex flex-col gap-2" data-testid="local-hub-setup" (keydown.escape)="onSetupEscape()">
        <h3 class="text-ui-sm font-semibold text-text">Set up a Hub on this computer</h3>
        @switch (setupStep()) {
          @case ('idle') {
            <p class="text-ui text-text-muted">The DUDE Hub service is installed on this computer but has no owner yet.</p>
            <div><button type="button" class="rounded-sm border border-accent px-2 py-0.5 text-ui text-accent hover:bg-accent/10" (click)="setupStep.set('intro')">Set up a Hub on this computer…</button></div>
          }
          @case ('intro') {
            <div class="flex flex-col gap-2" role="group" aria-label="About setting up the Hub" data-testid="setup-intro">
              <p class="text-ui text-text">The DUDE Hub service is installed on this computer but has no owner yet. Setting it up creates the owner account and connects this DUDE to it.</p>
              <p class="text-ui text-text-muted">Windows will ask for administrator permission once so DUDE can read the one-time setup token. Nothing leaves this computer.</p>
              <div class="flex gap-2">
                <button #firstControl type="button" class="rounded-sm border border-accent px-2 py-0.5 text-ui text-accent hover:bg-accent/10" (click)="setupStep.set('form')">Continue</button>
                <button type="button" class="rounded-sm border border-border px-2 py-0.5 text-ui text-text-muted hover:bg-panel-elevated" (click)="cancelSetup()">Cancel</button>
              </div>
            </div>
          }
          @case ('form') {
            <form class="flex flex-col gap-2" data-testid="setup-form" (submit)="submitSetup($event)">
              <label class="text-ui text-text-muted" for="setup-environment">Environment name</label>
              <input id="setup-environment" #firstControl type="text" autocomplete="off" class="w-full max-w-sm rounded-sm border border-border bg-panel px-2 py-0.5 text-text" [value]="environmentName()" (input)="environmentName.set($any($event.target).value)" />
              <label class="text-ui text-text-muted" for="setup-owner">Your name</label>
              <input id="setup-owner" type="text" autocomplete="name" class="w-full max-w-sm rounded-sm border border-border bg-panel px-2 py-0.5 text-text" [value]="ownerName()" (input)="ownerName.set($any($event.target).value)" />
              <label class="text-ui text-text-muted" for="setup-password">Owner password</label>
              <input id="setup-password" type="password" autocomplete="new-password" aria-describedby="setup-password-hint" class="w-full max-w-sm rounded-sm border border-border bg-panel px-2 py-0.5 text-text" [value]="password()" (input)="password.set($any($event.target).value)" />
              <p id="setup-password-hint" class="text-ui" data-testid="setup-password-hint" [class.text-text-muted]="password() === '' || longEnough()" [class.text-error]="password() !== '' && !longEnough()">Use at least {{ minLength }} characters. A few unrelated words make a strong, memorable password.</p>
              <label class="text-ui text-text-muted" for="setup-confirm">Confirm password</label>
              <input id="setup-confirm" type="password" autocomplete="new-password" [attr.aria-invalid]="mismatch() ? 'true' : null" class="w-full max-w-sm rounded-sm border border-border bg-panel px-2 py-0.5 text-text" [value]="confirm()" (input)="confirm.set($any($event.target).value)" />
              @if (mismatch()) { <p class="text-ui text-error" data-testid="setup-mismatch">The two passwords do not match.</p> }
              <div class="flex gap-2">
                <button type="submit" class="rounded-sm border border-accent px-2 py-0.5 text-ui text-accent hover:bg-accent/10 disabled:opacity-50" [disabled]="!formValid()">Create the Hub</button>
                <button type="button" class="rounded-sm border border-border px-2 py-0.5 text-ui text-text-muted hover:bg-panel-elevated" (click)="cancelSetup()">Cancel</button>
              </div>
            </form>
          }
          @case ('working') {
            <p class="text-ui text-text-muted" role="status" data-testid="setup-working">Setting up the Hub. Approve the Windows administrator prompt when it appears…</p>
          }
          @case ('codes') {
            <p class="text-ui text-success" data-testid="setup-created">The Hub was created and you are its owner.</p>
            <app-recovery-codes-display [codes]="codes()" continueLabel="Continue" (done)="codesSaved()" />
          }
          @case ('follow-up') {
            <div class="flex flex-col gap-2" data-testid="setup-follow-up">
              <p class="text-ui text-warning">The Hub was created, but this desktop could not finish connecting to it.</p>
              <p class="text-ui text-text" data-testid="setup-follow-up-message">{{ followUp() }}</p>
              <p class="text-ui text-text-muted">Your owner account exists and your recovery codes are valid. Sign in on the Hub web page, create a pairing string under Settings › Devices, then paste it under "Connect to a Hub" below.</p>
              <div><button type="button" class="rounded-sm border border-accent px-2 py-0.5 text-ui text-accent hover:bg-accent/10" (click)="goConnect()">Connect to a Hub</button></div>
            </div>
          }
          @case ('done') {
            <p class="text-ui text-success" role="status" data-testid="setup-done">This computer is connected to its new Hub and you are signed in as the owner.</p>
          }
        }
        <div aria-live="polite">
          @if (setupError(); as message) { <p class="text-ui text-error" role="alert" data-testid="setup-error">{{ message }}</p> }
        </div>
      </div>
    } @else if (notInstalled()) {
      <div data-setting class="flex flex-col gap-1" data-testid="local-hub-not-installed">
        <h3 class="text-ui-sm font-semibold text-text">A Hub on this computer</h3>
        <p class="text-ui text-text-muted">The DUDE Hub is not installed here. Add it by re-running the DUDE installer and ticking "Also install the DUDE Hub", or with DUDE-Hub-Setup.exe.</p>
      </div>
    }

    @if (updateVisible()) {
      <div data-setting class="flex flex-col gap-2" data-testid="local-hub-update" (keydown.escape)="cancelUpdate()">
        <h3 class="text-ui-sm font-semibold text-text">Update Hub</h3>
        @if (updateStep() !== 'done') {
          <p class="text-ui text-text" data-testid="update-notice">The Hub on this computer runs {{ info()?.hubVersion ?? 'an unknown version' }}; this app includes {{ info()?.bundledHubVersion }}.</p>
        }
        @switch (updateStep()) {
          @case ('idle') {
            <div><button type="button" class="rounded-sm border border-accent px-2 py-0.5 text-ui text-accent hover:bg-accent/10" (click)="startUpdate()">Update Hub…</button></div>
          }
          @case ('confirm') {
            <div class="flex flex-col gap-2" role="alertdialog" aria-label="Confirm Hub update" data-testid="update-confirm">
              <p class="text-ui text-text">The Hub stops briefly while it updates. Devices and browsers lose their connection for about a minute.@if (deviceCount() !== null) { <span data-testid="update-device-count"> {{ deviceCount() }} registered {{ deviceCount() === 1 ? 'device is' : 'devices are' }} connected to this Hub.</span> }</p>
              <p class="text-ui text-text-muted">Windows will ask for administrator permission.</p>
              <div class="flex gap-2">
                <button #confirmButton type="button" class="rounded-sm border border-accent px-2 py-0.5 text-ui text-accent hover:bg-accent/10" (click)="confirmUpdate()">Confirm update</button>
                <button type="button" class="rounded-sm border border-border px-2 py-0.5 text-ui text-text-muted hover:bg-panel-elevated" (click)="cancelUpdate()">Cancel</button>
              </div>
            </div>
          }
          @case ('working') {
            <p class="text-ui text-text-muted" role="status" data-testid="update-working">Updating the Hub. Approve the Windows administrator prompt when it appears…</p>
          }
          @case ('done') {
            <p class="text-ui text-success" role="status" data-testid="update-done">{{ updateSummary() }}</p>
          }
        }
        <div aria-live="polite">
          @if (updateError(); as message) { <p class="text-ui text-error" role="alert" data-testid="update-error">{{ message }}</p> }
        </div>
      </div>
    }
  `,
})
export class LocalHubPanel {
  private readonly hub = inject(HUB_ADMIN);

  /** The desktop is not connected to any Hub (the setup wizard is only offered then). */
  readonly standalone = input(false);
  /** Reports that the Hub, the connection or the owner session changed, so the section reloads them. */
  readonly changed = output<void>();

  protected readonly minLength = MIN_PASSWORD_LENGTH;
  protected readonly info = signal<LocalHubInfo | null>(null);

  // Setup
  protected readonly setupStep = signal<SetupStep>('idle');
  protected readonly environmentName = signal('');
  protected readonly ownerName = signal('');
  protected readonly password = signal('');
  protected readonly confirm = signal('');
  protected readonly codes = signal<readonly string[]>([]);
  protected readonly followUp = signal<string | null>(null);
  protected readonly setupError = signal<string | null>(null);
  protected readonly longEnough = computed(() => this.password().length >= MIN_PASSWORD_LENGTH);
  protected readonly mismatch = computed(() => this.confirm() !== '' && this.confirm() !== this.password());
  protected readonly formValid = computed(
    () => this.environmentName().trim() !== '' && this.ownerName().trim() !== '' && this.longEnough() && this.confirm() === this.password(),
  );
  private readonly unbootstrapped = computed(() => {
    const i = this.info();
    return i !== null && i.installed && i.found && i.bootstrapped === false;
  });
  protected readonly setupVisible = computed(() => this.setupStep() !== 'idle' || (this.standalone() && this.unbootstrapped()));
  protected readonly notInstalled = computed(() => this.standalone() && this.info()?.installed === false);

  // Update
  protected readonly updateStep = signal<UpdateStep>('idle');
  protected readonly deviceCount = signal<number | null>(null);
  protected readonly updateError = signal<string | null>(null);
  protected readonly updateResult = signal<LocalHubUpdateResult | null>(null);
  protected readonly updateVisible = computed(() => this.updateStep() === 'done' || this.info()?.updateAvailable === true);
  protected readonly updateSummary = computed(() => {
    const r = this.updateResult();
    if (r === null) return '';
    if (r.toVersion === null) return 'The Hub did not report its new version yet. Give it a minute, then check this page again.';
    return `The Hub was updated from ${r.fromVersion ?? 'an unknown version'} to ${r.toVersion}.`;
  });

  private readonly firstControl = viewChild<ElementRef<HTMLElement>>('firstControl');
  private readonly confirmButton = viewChild<ElementRef<HTMLButtonElement>>('confirmButton');

  constructor() {
    void this.loadInfo();
    effect(() => this.confirmButton()?.nativeElement.focus());
    effect(() => this.firstControl()?.nativeElement.focus());
  }

  async loadInfo(): Promise<void> {
    if (!this.hub.localHubInfo) return;
    try {
      this.info.set(await this.hub.localHubInfo());
    } catch {
      this.info.set(null);
    }
  }

  // ---- Setup ----
  protected cancelSetup(): void {
    this.clearSecrets();
    this.setupError.set(null);
    this.setupStep.set('idle');
  }

  protected onSetupEscape(): void {
    const step = this.setupStep();
    if (step === 'intro' || step === 'form') this.cancelSetup();
  }

  private clearSecrets(): void {
    this.password.set('');
    this.confirm.set('');
  }

  protected async submitSetup(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.formValid() || this.setupStep() !== 'form') return;
    const request = { environmentName: this.environmentName().trim(), ownerDisplayName: this.ownerName().trim(), password: this.password() };
    this.clearSecrets();
    this.setupError.set(null);
    this.setupStep.set('working');
    try {
      if (!this.hub.setupLocalHub) throw new HubAdminError(HUB_ADMIN_UNAVAILABLE, 'Setting up a Hub is not available here.');
      const result = await this.hub.setupLocalHub(request);
      this.codes.set(result.recoveryCodes);
      this.followUp.set(result.followUpError?.message ?? null);
      this.setupStep.set('codes');
    } catch (error) {
      this.setupError.set(setupErrorText(error));
      this.setupStep.set('form');
      void this.loadInfo();
    }
  }

  protected codesSaved(): void {
    this.codes.set([]);
    this.setupStep.set(this.followUp() === null ? 'done' : 'follow-up');
    void this.loadInfo();
    this.changed.emit();
  }

  protected goConnect(): void {
    document.getElementById('pairing-string')?.focus();
  }

  // ---- Update ----
  protected async startUpdate(): Promise<void> {
    this.updateError.set(null);
    this.deviceCount.set(null);
    this.updateStep.set('confirm');
    try {
      this.deviceCount.set((await this.hub.listDevices()).length);
    } catch {
      // Not signed in as the owner: the count is a nicety, not a requirement.
    }
  }

  protected cancelUpdate(): void {
    if (this.updateStep() === 'confirm') {
      this.updateStep.set('idle');
      this.updateError.set(null);
    }
  }

  protected async confirmUpdate(): Promise<void> {
    if (this.updateStep() !== 'confirm') return;
    this.updateError.set(null);
    this.updateStep.set('working');
    try {
      if (!this.hub.updateLocalHub) throw new HubAdminError(HUB_ADMIN_UNAVAILABLE, 'Updating the Hub is not available here.');
      this.updateResult.set(await this.hub.updateLocalHub());
      this.updateStep.set('done');
      await this.loadInfo();
      this.changed.emit();
    } catch (error) {
      this.updateError.set(updateErrorText(error));
      this.updateStep.set('idle');
      void this.loadInfo();
    }
  }
}
