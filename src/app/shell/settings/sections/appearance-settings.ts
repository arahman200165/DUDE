import { Component, computed, inject } from '@angular/core';
import { APPEARANCE_AXES, SYSTEM } from '../../../core/appearance/appearance.model';
import { AppearanceService } from '../../../core/appearance/appearance.service';
import { CATEGORY_METADATA, TOOL_CATEGORIES } from '../../../shared/models/tool-category.model';

interface ThemeOption {
  readonly value: string;
  readonly label: string;
}

interface SwatchChip {
  readonly label: string;
  readonly classes: string;
}

const CHIP_BASE = 'rounded-sm border border-border px-2 py-0.5 text-ui-xs';

/** Surface and text tokens, drawn as filled chips so the base palette is visible at a glance. */
const SURFACE_SWATCHES: readonly SwatchChip[] = [
  { label: 'Background', classes: `${CHIP_BASE} bg-bg text-text` },
  { label: 'Panel', classes: `${CHIP_BASE} bg-panel text-text` },
  { label: 'Elevated', classes: `${CHIP_BASE} bg-panel-elevated text-text` },
  { label: 'Text', classes: `${CHIP_BASE} bg-panel text-text` },
  { label: 'Muted text', classes: `${CHIP_BASE} bg-panel text-text-muted` },
  { label: 'Accent', classes: 'rounded-sm border border-accent bg-accent px-2 py-0.5 text-ui-xs text-on-accent' },
];

/** Status tokens; each label is colored by its own token and named in text. */
const STATUS_SWATCHES: readonly SwatchChip[] = [
  { label: 'Error', classes: `${CHIP_BASE} bg-panel text-error` },
  { label: 'Warning', classes: `${CHIP_BASE} bg-panel text-warning` },
  { label: 'Success', classes: `${CHIP_BASE} bg-panel text-success` },
  { label: 'Info', classes: `${CHIP_BASE} bg-panel text-info` },
  { label: 'Busy', classes: `${CHIP_BASE} bg-panel text-busy` },
  { label: 'Offline', classes: `${CHIP_BASE} bg-panel text-offline` },
];

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Settings › Appearance. Milestone 578 ships the theme (dark / light / system) row and a live swatch
 * strip; later Phase 30K milestones append rows (contrast, accent, palettes, density, fonts, motion,
 * export/import) to the same vertical list. Options come from `theme-tokens.json` via the model.
 */
@Component({
  selector: 'app-appearance-settings',
  templateUrl: './appearance-settings.html',
})
export class AppearanceSettings {
  protected readonly appearance = inject(AppearanceService);

  protected readonly themeOptions: readonly ThemeOption[] = [...APPEARANCE_AXES['theme'].values, SYSTEM].map((value) => ({
    value,
    label: value === SYSTEM ? 'System (follows OS)' : capitalize(value),
  }));

  protected readonly resolvedTheme = computed(() => capitalize(this.appearance.effective()['theme'] ?? APPEARANCE_AXES['theme'].default));

  protected readonly surfaceSwatches = SURFACE_SWATCHES;
  protected readonly statusSwatches = STATUS_SWATCHES;
  protected readonly categorySwatches: readonly SwatchChip[] = TOOL_CATEGORIES.map((id) => ({
    label: CATEGORY_METADATA[id].label,
    classes: `${CHIP_BASE} bg-panel text-${CATEGORY_METADATA[id].colorToken}`,
  }));

  protected setMode(mode: string): void {
    this.appearance.set({ mode });
  }

  protected resetToDefaults(): void {
    if (!confirm('Reset appearance settings to their defaults?')) return;
    this.appearance.reset();
  }
}
