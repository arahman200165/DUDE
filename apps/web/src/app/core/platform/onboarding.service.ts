import { inject as injectPlatformBridge } from '@angular/core';
import { PLATFORM_BRIDGE } from './platform-bridge.adapter';
import { Injectable, WritableSignal, inject, signal } from '@angular/core';
import { PlatformService } from './platform.service';
import { PersistenceService } from '../persistence/persistence.service';

const NAMESPACE = '__onboarding__';

@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private readonly platformBridgePort = injectPlatformBridge(PLATFORM_BRIDGE);
  private readonly platform = inject(PlatformService);
  private readonly persistence = inject(PersistenceService);

  private readonly completed: WritableSignal<boolean>;
  private readonly requestCompleted: WritableSignal<string | null>;
  private readonly savedStep: WritableSignal<number>;
  readonly visible = signal(false);
  readonly initialized = signal(false);
  readonly step: WritableSignal<number>;
  private request: string | null = null;

  constructor() {
    this.completed = this.persistence.signal<boolean>(NAMESPACE, 'completed', 'local', false);
    this.requestCompleted = this.persistence.signal<string | null>(NAMESPACE, 'setupRequestCompleted', 'local', null);
    this.savedStep = this.persistence.signal<number>(NAMESPACE, 'step', 'local', 0);
    this.step = signal(Math.min(7, Math.max(0, Number(this.savedStep()) || 0)));
  }

  async initialize(): Promise<void> {
    if (!this.platform.isDesktop()) { this.initialized.set(true); return; }
    this.request = await this.platformBridgePort.get()!.preferences.setupRequest();
    this.visible.set(this.completed() !== true || (!!this.request && this.requestCompleted() !== this.request));
    this.initialized.set(true);
  }

  open(): void { this.step.set(0); this.visible.set(true); }

  setStep(step: number): void {
    this.step.set(step);
    this.savedStep.set(step);
  }

  skip(): void { this.visible.set(false); }

  complete(): void {
    this.completed.set(true);
    if (this.request) this.requestCompleted.set(this.request);
    this.savedStep.set(0);
    this.step.set(0);
    this.visible.set(false);
  }
}
