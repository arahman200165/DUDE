import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { SysApplyResult, SysPlanPreview, SysPlanRequest } from '../../../shared-logic/system/sys-mutation-types';
import type { ServiceConfig } from '../../../shared-logic/system/system-types';
import { SystemMutationService } from '../../core/platform/system-mutation.service';
import { ElevationBanner } from '../../shared/components/elevation-banner/elevation-banner';
import { StatusGlyph } from '../../shared/components/status-glyph/status-glyph';
import { SystemChangePreview } from '../../shared/components/system-change-preview/system-change-preview';
import {
  START_TYPES, availableActions, serviceActionRequest, startTypeRequest,
  type ServiceActionKind, type SettableStartType,
} from './services-viewer-logic';

/**
 * Service actions (DUDE_PRD.md §5.2.1, Phase 31 Milestone 602). Every button only builds a plan
 * request and opens `app-system-change-preview`; changing anything requires that surface's separate
 * confirm step (and the typed-name confirmation the engine demands for critical services and drivers).
 * Pause/Continue are not offered: the mutation engine has no service.pause/continue op yet.
 */
@Component({
  selector: 'app-service-actions',
  imports: [RouterLink, ElevationBanner, StatusGlyph, SystemChangePreview],
  template: `
    @if (config(); as c) {
      <div class="flex flex-col gap-2 border-b border-border p-2 text-ui" data-testid="service-actions">
        <app-elevation-banner [required]="true" feature="Service control" />
        <div class="flex flex-wrap items-center gap-1" role="group" aria-label="Service actions">
          <span class="text-ui-xs uppercase text-text-muted">Actions</span>
          @for (a of actions(); track a) {
            <button type="button" class="rounded-sm border border-border px-2 py-0.5 text-text hover:bg-panel-elevated disabled:opacity-50" [disabled]="busy()" [attr.data-testid]="'action-' + a" (click)="openAction(a)">{{ labels[a] }}</button>
          }
          @if (!actions().length) { <span class="text-text-muted">No action available while the service is {{ c.state }}.</span> }
          <label class="ml-2 flex items-center gap-1 text-text-muted">Startup type
            <select class="rounded-sm border border-border bg-panel px-1 py-0.5 text-text" data-testid="starttype-select" (change)="startType.set($any($event.target).value)">
              @for (t of startTypes; track t.value) { <option [value]="t.value" [selected]="t.value === startType()">{{ t.label }}</option> }
            </select>
          </label>
          <button type="button" class="rounded-sm border border-warning px-2 py-0.5 text-warning disabled:opacity-50" [disabled]="busy()" data-testid="starttype-preview" (click)="openStartType()">Preview…</button>
          <a routerLink="/tools/system-changes" class="ml-auto text-ui-xs text-accent underline">Journal &amp; undo</a>
        </div>
        @if (c.isDriver) { <span class="flex items-center gap-1 text-ui-xs text-warning"><app-status-glyph kind="warning" />This is a driver; changes are confirmed by typing its name.</span> }
        @if (stopping() && impact().length) {
          <div class="rounded-sm border border-warning p-2" role="status" data-testid="stop-impact">
            <div class="flex items-center gap-1 text-warning"><app-status-glyph kind="warning" />{{ impact().length }} running dependent service{{ impact().length === 1 ? '' : 's' }} will also stop:</div>
            <div class="font-mono text-ui-xs text-text">{{ impact().join(', ') }}</div>
          </div>
        }
        @if (error()) { <div role="alert" class="flex items-center gap-1 text-error"><app-status-glyph kind="error" />{{ error() }}</div> }
        @if (busy()) { <div class="flex items-center gap-1 text-accent" role="status"><app-status-glyph kind="busy" />Building preview…</div> }
        <app-system-change-preview [preview]="preview()" (applied)="applied.emit($event)" (discarded)="clear()" />
      </div>
    }
  `,
})
export class ServiceActions {
  private readonly mutations = inject(SystemMutationService);

  readonly config = input<ServiceConfig | null>(null);
  /** Running services that stop with this one (from `impactOfStopping`). */
  readonly impact = input<readonly string[]>([]);
  readonly applied = output<SysApplyResult>();

  protected readonly labels: Record<ServiceActionKind, string> = { start: 'Start', stop: 'Stop', restart: 'Restart' };
  protected readonly startTypes = START_TYPES;
  protected readonly startType = signal<SettableStartType>('manual');
  protected readonly preview = signal<SysPlanPreview | null>(null);
  protected readonly pending = signal<ServiceActionKind | null>(null);
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  protected readonly actions = computed(() => { const c = this.config(); return c ? availableActions(c.state) : []; });
  protected readonly stopping = computed(() => this.preview() !== null && (this.pending() === 'stop' || this.pending() === 'restart'));

  private readonly serviceName = computed(() => this.config()?.name ?? '');

  constructor() {
    // A different service drops any open preview (which discards its plan).
    effect(() => { this.serviceName(); this.clear(); });
  }

  protected clear(): void { this.preview.set(null); this.pending.set(null); this.error.set(''); }

  protected openAction(action: ServiceActionKind): Promise<void> {
    const c = this.config();
    return c ? this.open(serviceActionRequest(c, action), action) : Promise.resolve();
  }

  protected openStartType(): Promise<void> {
    const c = this.config();
    return c ? this.open(startTypeRequest(c, this.startType()), null) : Promise.resolve();
  }

  /** Only asks the main process to build a plan; nothing is issued or applied here. */
  private async open(request: SysPlanRequest, action: ServiceActionKind | null): Promise<void> {
    this.error.set('');
    this.busy.set(true);
    try { this.preview.set(await this.mutations.plan(request)); this.pending.set(action); }
    catch (caught) { this.preview.set(null); this.error.set(caught instanceof Error ? caught.message : String(caught)); }
    finally { this.busy.set(false); }
  }
}
