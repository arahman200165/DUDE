import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  OpResult,
  addPanel,
  draftFromLayout,
  draftIssues,
  duplicatePanel,
  followWide,
  movePanel,
  placePanel,
  removePanel,
  resizePanel,
  setConfigValue,
  setContent,
  setVisible,
} from '../../../core/home-layout/draft-ops';
import { readingOrder } from '../../../core/home-layout/grid-engine';
import type { HomeLayoutDraft, LayoutWidth } from '../../../core/home-layout/home-layout.model';
import { HomeLayoutService } from '../../../core/home-layout/home-layout.service';
import { panelAvailability } from '../../../core/home-layout/panel-availability';
import { emptyUserContent, UserContent } from '../../../core/home-layout/user-content.model';
import { PlatformService } from '../../../core/platform/platform.service';
import { PanelRegistryService } from '../../../core/registry/panel-registry.service';
import type { PanelConfigField, PanelDefinition } from '../../../shared/models/panel-definition.model';
import { UserContentEditor } from '../../deck/user-panels/user-content-editor/user-content-editor';
import { SettingsUnsavedChanges } from '../settings-unsaved-changes';

interface Row {
  readonly id: string;
  readonly kindId: string;
  readonly def: PanelDefinition | undefined;
  readonly title: string;
  readonly visible: boolean;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly webHidden: boolean;
  readonly config: Readonly<Record<string, string | number | boolean>>;
  readonly content: UserContent | undefined;
}

interface PickerEntry {
  readonly def: PanelDefinition;
  readonly disabledReason: string | null;
  readonly desktopNote: boolean;
}

const UNSAVED_KEY = 'home-layout';

/**
 * Settings › Home layout (DUDE_PRD.md Phase 30I). A keyboard-first list/form editor over a draft of
 * the layout: add (from the generated panel registry), hide/show, move, resize, reposition,
 * duplicate, edit content and per-panel settings, remove, and Reset to Default — for the wide and
 * narrow layouts separately. Every placement change goes through the pure grid engine, so an
 * overlap or too-small size is refused with a readable reason rather than silently moved. Nothing is
 * written until Save; Reset to Default touches only layout state.
 */
@Component({
  selector: 'app-home-layout-settings',
  imports: [UserContentEditor],
  templateUrl: './home-layout-settings.html',
})
export class HomeLayoutSettings {
  private readonly service = inject(HomeLayoutService);
  private readonly registry = inject(PanelRegistryService);
  private readonly platform = inject(PlatformService);
  private readonly unsaved = inject(SettingsUnsavedChanges);

  private readonly saved = computed(() => draftFromLayout(this.service.layout(), this.service.narrowCustomized(), this.service.content()));

  protected readonly draft = signal<HomeLayoutDraft>(this.saved());
  protected readonly width = signal<LayoutWidth>('wide');
  protected readonly message = signal<{ text: string; ok: boolean } | null>(null);
  protected readonly issues = signal<readonly string[]>([]);
  protected readonly openId = signal<string | null>(null);
  protected readonly confirmingReset = signal(false);

  protected readonly dirty = computed(() => JSON.stringify(this.draft()) !== JSON.stringify(this.saved()));
  protected readonly customized = this.service.customized;

  private readonly kinds = (kindId: string) => this.registry.resolveKind(kindId);

  protected readonly rows = computed<readonly Row[]>(() => {
    const draft = this.draft();
    const placements = this.width() === 'wide' ? draft.wide : draft.narrow;
    const byId = new Map(draft.instances.map((i) => [i.id, i]));
    return readingOrder(placements)
      .map((p): Row | null => {
        const instance = byId.get(p.id);
        if (!instance) return null;
        const def = this.kinds(instance.kindId);
        const stored = draft.content[instance.id];
        return {
          id: instance.id,
          kindId: instance.kindId,
          def,
          title: def ? (stored?.title || def.title) : `Unavailable panel (${instance.kindId})`,
          visible: instance.visible,
          x: p.x,
          y: p.y,
          w: p.w,
          h: p.h,
          webHidden: !!def && panelAvailability(def, false) !== 'available',
          config: instance.config,
          content: stored,
        };
      })
      .filter((r): r is Row => r !== null);
  });

  protected readonly picker = computed<readonly PickerEntry[]>(() => {
    const draft = this.draft();
    return this.registry.getAll().map((def) => {
      const present = draft.instances.some((i) => i.kindId === def.id);
      return {
        def,
        disabledReason: !def.multiInstance && present ? 'Already on Home' : null,
        desktopNote: panelAvailability(def, false) !== 'available',
      };
    });
  });

  protected readonly narrowFollowsWide = computed(() => !this.draft().narrowCustomized);
  protected readonly isDesktop = this.platform.isDesktop;

  constructor() {
    effect(() => this.unsaved.setDirty(UNSAVED_KEY, this.dirty()));
    inject(DestroyRef).onDestroy(() => this.unsaved.setDirty(UNSAVED_KEY, false));
    // Pick up saves/imports/resets from elsewhere while the editor has no edits of its own.
    effect(() => {
      const saved = this.saved();
      untracked(() => {
        if (!this.dirty()) this.draft.set(saved);
      });
    });
  }

  protected setWidth(width: LayoutWidth): void {
    this.width.set(width);
    this.openId.set(null);
  }

  private apply(result: OpResult): void {
    if (result.ok) this.draft.set(result.draft);
    this.message.set({ text: result.message, ok: result.ok });
    this.issues.set([]);
  }

  protected add(def: PanelDefinition): void {
    this.apply(addPanel(this.draft(), def, this.kinds));
  }

  protected remove(row: Row): void {
    this.openId.update((id) => (id === row.id ? null : id));
    this.apply(removePanel(this.draft(), row.id, this.kinds));
  }

  protected duplicate(row: Row): void {
    this.apply(duplicatePanel(this.draft(), row.id, this.kinds));
  }

  protected toggleVisible(row: Row, event: Event): void {
    this.apply(setVisible(this.draft(), row.id, (event.target as HTMLInputElement).checked, this.kinds));
  }

  protected move(row: Row, direction: -1 | 1): void {
    this.apply(movePanel(this.draft(), this.width(), row.id, direction, this.kinds));
  }

  protected setNumber(row: Row, field: 'x' | 'y' | 'w' | 'h', event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = Number(input.value);
    if (!Number.isFinite(value)) {
      input.value = String(row[field]);
      return;
    }
    const cell = field === 'x' || field === 'y' ? value - 1 : value;
    const result =
      field === 'w' || field === 'h'
        ? resizePanel(this.draft(), this.width(), row.id, { w: field === 'w' ? cell : row.w, h: field === 'h' ? cell : row.h }, this.kinds)
        : placePanel(this.draft(), this.width(), row.id, { x: field === 'x' ? cell : row.x, y: field === 'y' ? cell : row.y, w: row.w, h: row.h }, this.kinds);
    this.apply(result);
    // A refused change snaps the field back to the stored value.
    if (!result.ok) input.value = String(field === 'x' || field === 'y' ? row[field] + 1 : row[field]);
  }

  protected toggleOpen(row: Row): void {
    this.openId.update((id) => (id === row.id ? null : row.id));
  }

  protected setConfig(row: Row, field: PanelConfigField, event: Event): void {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    const value = field.type === 'boolean' ? (target as HTMLInputElement).checked : field.type === 'number' ? Number(target.value) : target.value;
    this.apply(setConfigValue(this.draft(), row.id, field.key, value, this.kinds));
  }

  protected contentFor(row: Row): UserContent {
    return row.content ?? emptyUserContent(row.def?.userContent ?? 'text');
  }

  protected saveContent(row: Row, content: UserContent): void {
    this.draft.set(setContent(this.draft(), row.id, content).draft);
  }

  protected followWide(): void {
    this.apply(followWide(this.draft(), this.kinds));
  }

  protected save(): void {
    const problems = draftIssues(this.draft(), this.kinds);
    if (problems.length > 0) {
      this.issues.set(problems.map((p) => p.message));
      this.message.set({ text: 'Fix the placement problems before saving.', ok: false });
      return;
    }
    const result = this.service.save(this.draft());
    if (result.ok) {
      this.issues.set([]);
      this.message.set({ text: 'Home layout saved.', ok: true });
    } else {
      this.issues.set(result.issues.map((i) => i.message));
      this.message.set({ text: 'Home layout wasn’t saved.', ok: false });
    }
  }

  protected discard(): void {
    this.draft.set(this.saved());
    this.openId.set(null);
    this.issues.set([]);
    this.message.set({ text: 'Changes discarded.', ok: true });
  }

  protected requestReset(): void {
    this.confirmingReset.set(true);
  }

  protected cancelReset(): void {
    this.confirmingReset.set(false);
  }

  /** Layout only: favorites, usage, projects, workspaces and pipelines are separate stores. */
  protected confirmReset(): void {
    this.service.resetToDefault();
    this.draft.set(this.saved());
    this.confirmingReset.set(false);
    this.openId.set(null);
    this.issues.set([]);
    this.message.set({ text: 'Home restored to the default layout.', ok: true });
  }

  protected placementText(row: Row): string {
    return `column ${row.x + 1}, row ${row.y + 1}, ${row.w}×${row.h} cells`;
  }

  protected optionLabel(options: readonly { value: string; label: string }[], value: unknown): string {
    return options.find((o) => o.value === value)?.label ?? String(value);
  }

  protected readonly rowKey = (_: number, row: Row): string => row.id;
}
