import { Component } from '@angular/core';

/**
 * Placeholder pages for the Hub-served web build's entry routes (`/hub/setup`, `/hub/sign-in`, `/hub/recover`),
 * sanctioned shell exception #12 (see shell/AGENTS.md). The real forms replace these components; the routes,
 * the host gating and the sign-in guard already exist.
 */
@Component({
  selector: 'app-hub-setup-page',
  template: `<main class="flex min-h-screen items-center justify-center bg-bg p-4 text-text"><h1 class="text-ui" data-testid="hub-page">Loading Hub setup…</h1></main>`,
})
export class HubSetupPage {}

@Component({
  selector: 'app-hub-sign-in-page',
  template: `<main class="flex min-h-screen items-center justify-center bg-bg p-4 text-text"><h1 class="text-ui" data-testid="hub-page">Loading Hub sign-in…</h1></main>`,
})
export class HubSignInPage {}

@Component({
  selector: 'app-hub-recover-page',
  template: `<main class="flex min-h-screen items-center justify-center bg-bg p-4 text-text"><h1 class="text-ui" data-testid="hub-page">Loading account recovery…</h1></main>`,
})
export class HubRecoverPage {}
