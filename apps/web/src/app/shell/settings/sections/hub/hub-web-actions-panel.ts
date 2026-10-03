import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { HUB_ADMIN } from '../../../../core/hub/hub-admin.token';
import type { RootCertificatePreview } from '../../../../core/hub/hub-admin.port';
import { HubWebLinkService } from '../../../../core/hub/hub-web-link.service';
import { hubErrorText } from './hub-format';

type AvailableRoot = Extract<RootCertificatePreview, { available: true }>;
type Step = 'idle' | 'loading' | 'confirm' | 'installing' | 'done';

/**
 * Desktop, enrolled: "Open Hub web in browser" and, for a Hub with its own local CA on Windows, "Install root certificate".
 * Installing follows the Destructive-Action Contract: the first click only fetches and shows the root's SHA-256
 * fingerprint; only Confirm calls the installer, with the single-use token from that preview. Main does the work
 * (`certutil -user`, current user's store, no elevation); Windows adds its own security prompt.
 */
@Component({
  selector: 'app-hub-web-actions-panel',
  template: `
    @if (visible()) {
      <div data-setting class="flex flex-col gap-2" data-testid="hub-web-actions">
        <h3 class="text-ui-sm font-semibold text-text">Hub web</h3>
        @if (link.canOpen()) {
          <p class="text-ui text-text-muted">Open this Hub's own web page in your default browser. You sign in there with the owner password.</p>
          <div class="flex items-center gap-2">
            <button type="button" class="rounded-sm border border-border px-2 py-0.5 text-ui text-text hover:bg-panel-elevated" (click)="openWeb()">Open Hub web in browser</button>
          </div>
          @if (openError(); as message) { <p class="text-ui text-error" role="alert" data-testid="open-web-error">{{ message }}</p> }
        }
        @if (rootAvailable()) {
          <div class="flex flex-col gap-2" data-testid="root-cert" (keydown.escape)="cancel()">
            @if (step() === 'idle' || step() === 'loading') {
              <p class="text-ui text-text-muted">This Hub uses its own certificate authority. Installing its root on this PC makes your browser trust the Hub's web page without warnings. Nothing is installed until you confirm.</p>
              <div>
                <button type="button" class="rounded-sm border border-border px-2 py-0.5 text-ui text-text hover:bg-panel-elevated disabled:opacity-50" [disabled]="step() === 'loading'" (click)="start()">Install root certificate…</button>
              </div>
            } @else if (step() === 'confirm' || step() === 'installing') {
              @if (preview(); as p) {
                <div class="flex flex-col gap-2 rounded-sm border border-border p-3" role="alertdialog" aria-label="Confirm installing the Hub root certificate" data-testid="root-cert-confirm">
                  <p class="text-ui text-text">Add this certificate authority to your Windows <strong>Trusted Root Certification Authorities</strong>? It will be added for the current user only, and Windows will show its own security prompt.</p>
                  <dl class="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-ui">
                    <dt class="text-text-muted">Subject</dt>
                    <dd class="break-all text-text" data-testid="root-subject">{{ p.subject }}</dd>
                    <dt class="text-text-muted">SHA-256</dt>
                    <dd><code class="break-all font-mono text-text" data-testid="root-fingerprint">{{ p.fingerprint }}</code></dd>
                  </dl>
                  <p class="text-ui text-warning">Only continue if this fingerprint matches the one shown on your Hub. Anyone who holds this root's key could impersonate sites for the names it is allowed to issue.</p>
                  <div class="flex gap-2">
                    <button #confirmButton type="button" class="rounded-sm border border-accent px-2 py-0.5 text-ui text-accent hover:bg-accent/10 disabled:opacity-50" [disabled]="step() === 'installing'" (click)="install()">Install for this user</button>
                    <button type="button" class="rounded-sm border border-border px-2 py-0.5 text-ui text-text-muted hover:bg-panel-elevated disabled:opacity-50" [disabled]="step() === 'installing'" (click)="cancel()">Cancel</button>
                  </div>
                </div>
              }
            } @else {
              <p class="text-ui text-success" role="status" data-testid="root-cert-done">The Hub's root certificate was installed for the current user.</p>
            }
          </div>
          <div aria-live="polite">
            @if (rootError(); as message) { <p class="text-ui text-error" role="alert" data-testid="root-cert-error">{{ message }}</p> }
          </div>
        }
      </div>
    }
  `,
})
export class HubWebActionsPanel {
  private readonly hub = inject(HUB_ADMIN);
  protected readonly link = inject(HubWebLinkService);
  private readonly confirmButton = viewChild<ElementRef<HTMLButtonElement>>('confirmButton');

  protected readonly openError = signal<string | null>(null);
  protected readonly rootAvailable = signal(false);
  protected readonly step = signal<Step>('idle');
  protected readonly preview = signal<AvailableRoot | null>(null);
  protected readonly rootError = signal<string | null>(null);
  protected readonly visible = computed(() => this.link.canOpen() || this.rootAvailable());

  constructor() {
    void this.probe();
    effect(() => this.confirmButton()?.nativeElement.focus());
  }

  /** Only learns whether the action applies (local-CA Hub, Windows). Nothing is installed and no token is kept. */
  private async probe(): Promise<void> {
    if (!this.hub.rootCertificatePreview) return;
    try {
      this.rootAvailable.set((await this.hub.rootCertificatePreview()).available);
    } catch {
      this.rootAvailable.set(false);
    }
  }

  protected async openWeb(): Promise<void> {
    this.openError.set(null);
    try {
      await this.link.open();
    } catch (error) {
      this.openError.set(hubErrorText(error, 'The Hub web page could not be opened.'));
    }
  }

  /** Step 1: fetch a fresh preview (fingerprint + token). Changes nothing. */
  protected async start(): Promise<void> {
    if (!this.hub.rootCertificatePreview || this.step() === 'loading') return;
    this.rootError.set(null);
    this.step.set('loading');
    try {
      const result = await this.hub.rootCertificatePreview();
      if (!result.available) {
        this.rootAvailable.set(false);
        this.step.set('idle');
        return;
      }
      this.preview.set(result);
      this.step.set('confirm');
    } catch (error) {
      this.step.set('idle');
      this.rootError.set(hubErrorText(error, 'The Hub root certificate could not be read.'));
    }
  }

  protected cancel(): void {
    if (this.step() === 'installing') return;
    this.preview.set(null);
    this.rootError.set(null);
    if (this.step() === 'confirm') this.step.set('idle');
  }

  /** Step 2: the explicit confirm. The token is single use, so a failure needs a fresh preview. */
  protected async install(): Promise<void> {
    const plan = this.preview();
    if (!plan || this.step() !== 'confirm' || !this.hub.installRootCertificate) return;
    this.step.set('installing');
    this.rootError.set(null);
    try {
      await this.hub.installRootCertificate(plan.confirmToken);
      this.step.set('done');
    } catch (error) {
      this.step.set('idle');
      this.rootError.set(hubErrorText(error, 'The certificate could not be installed.'));
    } finally {
      this.preview.set(null);
    }
  }
}
