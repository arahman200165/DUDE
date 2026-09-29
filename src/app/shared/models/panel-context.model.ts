import { InjectionToken, Signal } from '@angular/core';
import type { PanelConfig } from './panel-definition.model';

/**
 * Provided by the Home canvas to every panel it renders, so a panel component can read its own
 * instance id and (reactive) typed config without declaring inputs. Optional: a panel component
 * also renders standalone (its own page, a spec) with `inject(PANEL_CONTEXT, { optional: true })`.
 */
export interface PanelContext {
  readonly instanceId: string;
  readonly config: Signal<PanelConfig>;
}

export const PANEL_CONTEXT = new InjectionToken<PanelContext>('PANEL_CONTEXT');

/** Read a numeric config value with a fallback (config is already validated against the kind's schema). */
export function panelNumber(context: PanelContext | null, key: string, fallback: number): number {
  const value = context?.config()[key];
  return typeof value === 'number' ? value : fallback;
}

export function panelString(context: PanelContext | null, key: string, fallback: string): string {
  const value = context?.config()[key];
  return typeof value === 'string' ? value : fallback;
}
