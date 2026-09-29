import { Component, InjectionToken, inject } from '@angular/core';
import { APPEARANCE_AXES, AppearanceAxes, AppearancePrefs, SYSTEM } from '../../../core/appearance/appearance.model';
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

/** The axes the page renders rows for; overridable so tests can supply single- and multi-value axes. */
export const APPEARANCE_SETTINGS_AXES = new InjectionToken<AppearanceAxes>('APPEARANCE_SETTINGS_AXES', {
  providedIn: 'root',
  factory: () => APPEARANCE_AXES,
});

/** A generic chip row bound to one axis; `allowSystem` appends a "System (follows OS)" chip. */
interface AxisRowSpec {
  readonly axisKey: string;
  readonly prefsKey: Exclude<keyof AppearancePrefs, 'uiFont' | 'monoFont'>;
  readonly label: string;
  readonly help?: string;
  readonly allowSystem?: boolean;
}

interface AxisRow extends AxisRowSpec {
  readonly options: readonly ThemeOption[];
}

const AXIS_ROWS: readonly AxisRowSpec[] = [
  { axisKey: 'theme', prefsKey: 'mode', label: 'Theme', allowSystem: true },
  {
    axisKey: 'contrast',
    prefsKey: 'contrast',
    label: 'Contrast',
    allowSystem: true,
    help: 'High raises text, border and focus-ring contrast. System follows your OS contrast setting.',
  },
  { axisKey: 'accent', prefsKey: 'accent', label: 'Accent' },
  {
    axisKey: 'catset',
    prefsKey: 'catset',
    label: 'Category palette',
    help: 'Changes the 8 category colors; icons and labels always identify categories too.',
  },
];

const CHIP_BASE ='rounded-sm border border-border px-2 py-0.5 text-ui-xs';

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
 * Settings › Appearance. Chip rows (theme, contrast, accent, palette; theme and contrast also offer
 * `system`) and a live swatch strip; later Phase 30K milestones append rows (density, fonts, motion,
 * export/import) to the same vertical list. Options come from `theme-tokens.json` via the model.
 */
@Component({
  selector: 'app-appearance-settings',
  templateUrl: './appearance-settings.html',
})
export class AppearanceSettings {
  protected readonly appearance = inject(AppearanceService);

  private readonly axes = inject(APPEARANCE_SETTINGS_AXES);

  /** Rows for axes that actually offer a choice (more than one value); labels prefer the axis' own `labels`. */
  protected readonly axisRows: readonly AxisRow[] = AXIS_ROWS.flatMap((spec) => {
    const axis = this.axes[spec.axisKey];
    if (!axis || axis.values.length < 2) return [];
    const labels = (axis as { labels?: Readonly<Record<string, string>> }).labels;
    const options: ThemeOption[] = axis.values.map((value) => ({ value, label: labels?.[value] ?? capitalize(value) }));
    if (spec.allowSystem) options.push({ value: SYSTEM, label: 'System (follows OS)' });
    return [{ ...spec, options }];
  });

  protected isSelected(row: AxisRow, value: string): boolean {
    return this.appearance.prefs()[row.prefsKey] === value;
  }

  /** What `system` currently resolves to for a row (shown only while that row is set to system). */
  protected resolvedLabel(row: AxisRow): string {
    const axis = this.axes[row.axisKey];
    const value = this.appearance.effective()[row.axisKey] ?? axis.default;
    return row.options.find((option) => option.value === value)?.label ?? capitalize(value);
  }

  protected readonly surfaceSwatches = SURFACE_SWATCHES;
  protected readonly statusSwatches = STATUS_SWATCHES;
  protected readonly categorySwatches: readonly SwatchChip[] = TOOL_CATEGORIES.map((id) => ({
    label: CATEGORY_METADATA[id].label,
    classes: `${CHIP_BASE} bg-panel text-${CATEGORY_METADATA[id].colorToken}`,
  }));

  protected setAxis(row: AxisRow, value: string): void {
    this.appearance.set({ [row.prefsKey]: value });
  }

  protected resetToDefaults(): void {
    if (!confirm('Reset appearance settings to their defaults?')) return;
    this.appearance.reset();
  }
}
