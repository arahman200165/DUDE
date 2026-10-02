import { Component, input } from '@angular/core';

/** Minimal dense centered card shared by the Hub entry pages (setup, sign-in, recover). */
@Component({
  selector: 'app-hub-card',
  template: `
    <main class="flex min-h-screen items-center justify-center bg-bg p-4 text-text">
      <section class="flex w-full max-w-md flex-col gap-4 rounded-md border border-border bg-panel p-4" [attr.aria-labelledby]="'hub-card-title'">
        <header class="flex flex-col gap-1">
          <p class="text-ui-sm font-semibold uppercase text-text-muted">DUDE Hub</p>
          <h1 id="hub-card-title" class="text-ui font-semibold text-text" data-testid="hub-page">{{ heading() }}</h1>
          @if (subtitle()) { <p class="text-ui text-text-muted">{{ subtitle() }}</p> }
        </header>
        <ng-content />
      </section>
    </main>
  `,
})
export class HubCard {
  readonly heading = input.required<string>();
  readonly subtitle = input('');
}
