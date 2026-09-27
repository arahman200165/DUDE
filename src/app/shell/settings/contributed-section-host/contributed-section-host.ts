import { Component, Type, effect, input, signal } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import type { ContributedSettingsSection } from '../../../core/registry/tool-registry.service';

/**
 * Lazily loads and renders one tool-contributed Settings section (`settingsSection.load`) — used
 * where a contributed section appears outside the Settings page itself, e.g. the setup wizard.
 */
@Component({
  selector: 'app-contributed-section-host',
  imports: [NgComponentOutlet],
  template: `
    @if (component(); as sectionComponent) {
      <ng-container *ngComponentOutlet="sectionComponent" />
    } @else {
      <span class="text-ui text-text-muted">Loading…</span>
    }
  `,
})
export class ContributedSectionHost {
  readonly section = input.required<ContributedSettingsSection>();
  protected readonly component = signal<Type<unknown> | null>(null);

  constructor() {
    effect(() => {
      const section = this.section();
      this.component.set(null);
      void section.load().then((component) => {
        if (this.section() === section) this.component.set(component as Type<unknown>);
      });
    });
  }
}
