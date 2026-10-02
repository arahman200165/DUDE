import { Component, Injector, OnInit, Type, computed, inject, input, signal } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { PanelInstance } from "@dude/domain/core/home-layout/home-layout.model";
import { PanelRegistryService } from '../../../core/registry/panel-registry.service';
import { PANEL_CONTEXT } from '../../../shared/models/panel-context.model';
import type { PanelDefinition } from "@dude/domain/shared/models/panel-definition.model";

/**
 * Loads one panel kind's renderer (lazily, with the shared load-failure fallback) and mounts it
 * with a `PANEL_CONTEXT` carrying the instance id and reactive config. Mounting only renders —
 * a panel never runs anything consequential until the user acts on it.
 */
@Component({
  selector: 'app-panel-slot',
  imports: [NgComponentOutlet],
  template: `
    @if (component(); as c) {
      <ng-container *ngComponentOutlet="c; injector: panelInjector" />
    } @else {
      <div class="h-full min-h-12 animate-pulse rounded-sm border border-border bg-panel-elevated" aria-hidden="true"></div>
    }
  `,
  host: { class: 'block h-full min-w-0' },
})
export class PanelSlot implements OnInit {
  private readonly registry = inject(PanelRegistryService);
  private readonly parent = inject(Injector);

  readonly def = input.required<PanelDefinition>();
  readonly instance = input.required<PanelInstance>();

  protected readonly component = signal<Type<unknown> | null>(null);
  protected panelInjector: Injector = this.parent;

  ngOnInit(): void {
    this.panelInjector = Injector.create({
      parent: this.parent,
      providers: [{ provide: PANEL_CONTEXT, useValue: { instanceId: this.instance().id, config: computed(() => this.instance().config) } }],
    });
    void this.registry.loadComponent(this.def()).then((c) => this.component.set(c));
  }
}
