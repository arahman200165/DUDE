import type { PanelConfig, PanelConfigField, PanelConfigValue } from "../../shared/models/panel-definition.model.js";

/** Config with every field at its declared default. */
export function defaultConfig(fields: readonly PanelConfigField[] | undefined): PanelConfig {
  const out: Record<string, PanelConfigValue> = {};
  for (const field of fields ?? []) out[field.key] = field.default;
  return out;
}

function sanitizeField(field: PanelConfigField, raw: unknown): PanelConfigValue {
  switch (field.type) {
    case 'number': {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) return field.default;
      return Math.min(Math.max(Math.round(raw), field.min), field.max);
    }
    case 'select':
      return typeof raw === 'string' && field.options.some((o) => o.value === raw) ? raw : field.default;
    case 'boolean':
      return typeof raw === 'boolean' ? raw : field.default;
  }
}

/**
 * Validate stored/imported config against the kind's declared schema: unknown keys are dropped,
 * missing or invalid values fall back to defaults. Never throws.
 */
export function sanitizeConfig(fields: readonly PanelConfigField[] | undefined, raw: unknown): PanelConfig {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: Record<string, PanelConfigValue> = {};
  for (const field of fields ?? []) out[field.key] = sanitizeField(field, source[field.key]);
  return out;
}
