import { Injectable, inject, signal } from '@angular/core';
import { PlatformService } from './platform.service';

const DONE_KEY = 'dude:v1:desktop:onboarding-completed';
const REQUEST_KEY = 'dude:v1:desktop:setup-request-completed';
const STEP_KEY = 'dude:v1:desktop:onboarding-step';

@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private readonly platform = inject(PlatformService);
  readonly visible = signal(false);
  readonly initialized = signal(false);
  readonly step = signal(Math.min(7, Math.max(0, Number(localStorage.getItem(STEP_KEY) ?? 0) || 0)));
  private request: string | null = null;

  async initialize(): Promise<void> {
    if (!this.platform.isDesktop()) { this.initialized.set(true); return; }
    this.request = await window.dude!.preferences.setupRequest();
    this.visible.set(!localStorage.getItem(DONE_KEY) || (!!this.request && localStorage.getItem(REQUEST_KEY) !== this.request));
    this.initialized.set(true);
  }

  open(): void { this.step.set(0); this.visible.set(true); }

  setStep(step: number): void {
    this.step.set(step);
    localStorage.setItem(STEP_KEY, String(step));
  }

  skip(): void { this.visible.set(false); }

  complete(): void {
    localStorage.setItem(DONE_KEY, 'true');
    if (this.request) localStorage.setItem(REQUEST_KEY, this.request);
    localStorage.removeItem(STEP_KEY);
    this.step.set(0);
    this.visible.set(false);
  }
}
