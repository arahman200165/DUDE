import { Component, InjectionToken, inject, signal } from '@angular/core';
import {
  APPEARANCE_AXES,
  AppearanceAxes,
  AppearancePrefs,
  FontChoice,
  MONO_FONTS,
  SYSTEM,
  UI_FONTS,
  fontStack,
  sanitizeFontFamily,
} from '../../../core/appearance/appearance.model';
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
  {
    axisKey: 'semantic',
    prefsKey: 'semantic',
    label: 'Status colors',
    help: 'Color-blind safe swaps red/green status colors for a blue/orange scheme; status icons and labels are always shown too.',
  },
  {
    axisKey: 'density',
    prefsKey: 'density',
    label: 'Density',
    help: 'Compact is the default. Comfortable adds spacing and larger controls; Ultra-compact tightens everything.',
  },
  { axisKey: 'uiSize', prefsKey: 'uiSize', label: 'UI text size' },
  {
    axisKey: 'monoSize',
    prefsKey: 'monoSize',
    label: 'Data & code text size',
    help: 'Sizes monospace values, editors and code blocks independently of the UI text.',
  },
  {
    axisKey: 'ligatures',
    prefsKey: 'ligatures',
    label: 'Code ligatures',
    help: 'Off shows operators like != and => as separate characters in monospace text.',
  },
  {
    axisKey: 'motion',
    prefsKey: 'motion',
    label: 'Motion',
    allowSystem: true,
    help: 'Reduce removes interface animation and transitions. System follows your OS setting. Animation previews you author start paused with a Play control.',
  },
];

const CUSTOM_FONT = '__custom';
const FONT_ERROR = 'Use letters, digits, spaces, dot, dash or underscore (max 64).';

/** One font row (UI or monospace): curated select plus an optional installed-font name input. */
interface FontRow {
  readonly kind: 'ui' | 'mono';
  readonly prefsKey: 'uiFont' | 'monoFont';
  readonly label: string;
  readonly options: readonly { readonly id: string; readonly label: string }[];
  readonly help?: string;
}

const FONT_ROWS: readonly FontRow[] = [
  {
    kind: 'ui',
    prefsKey: 'uiFont',
    label: 'UI font',
    options: UI_FONTS,
    help: 'Only fonts installed on this device are used; DUDE bundles no web fonts.',
  },
  { kind: 'mono', prefsKey: 'monoFont', label: 'Data & code font', options: MONO_FONTS },
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
 * Settings › Appearance. Chip rows (theme, contrast, accent, palette, status colors, density, text
 * sizes, ligatures, motion; theme, contrast and motion also offer `system`), font pickers (curated list or an
 * installed-font name) and a live swatch strip; a later Phase 30K milestone appends
 * export/import. Options come from `theme-tokens.json` via the model.
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

  protected readonly fontRows = FONT_ROWS;
  protected readonly customFontValue = CUSTOM_FONT;
  protected readonly fontError = FONT_ERROR;

  /** Rows where the user picked "Custom" (even before typing a name), keyed by prefs key. */
  private readonly customMode = signal<Record<string, boolean>>({});
  protected readonly invalidFont = signal<Record<string, boolean>>({});

  protected isCustomFont(row: FontRow): boolean {
    return this.customMode()[row.prefsKey] === true || typeof this.appearance.prefs()[row.prefsKey] !== 'string';
  }

  protected selectedFont(row: FontRow): string {
    return this.isCustomFont(row) ? CUSTOM_FONT : (this.appearance.prefs()[row.prefsKey] as string);
  }

  protected customFontName(row: FontRow): string {
    const choice: FontChoice = this.appearance.prefs()[row.prefsKey];
    return typeof choice === 'string' ? '' : choice.custom;
  }

  protected fontSample(row: FontRow): string {
    return fontStack(this.appearance.prefs(), row.kind);
  }

  protected onFontSelect(row: FontRow, value: string): void {
    this.invalidFont.update((state) => ({ ...state, [row.prefsKey]: false }));
    if (value === CUSTOM_FONT) {
      this.customMode.update((state) => ({ ...state, [row.prefsKey]: true }));
      return;
    }
    this.customMode.update((state) => ({ ...state, [row.prefsKey]: false }));
    this.appearance.set({ [row.prefsKey]: value });
  }

  protected onCustomFont(row: FontRow, value: string): void {
    const name = value.trim();
    if (sanitizeFontFamily(name) === null) {
      this.invalidFont.update((state) => ({ ...state, [row.prefsKey]: true }));
      return;
    }
    this.invalidFont.update((state) => ({ ...state, [row.prefsKey]: false }));
    this.appearance.set({ [row.prefsKey]: { custom: name } });
  }

  protected resetToDefaults(): void {
    if (!confirm('Reset appearance settings to their defaults?')) return;
    this.appearance.reset();
  }
}
