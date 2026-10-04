import type { ComponentType } from 'react';
import type { ToolMetadata } from '@dude/domain/shared/models/tool-metadata.model';

/** Each owning tool contributes a literal lazy UI import; no engine or shell registration. */
export interface MobileToolBinding {
  readonly load: () => Promise<{ default: ComponentType }>;
  readonly settingsLoad?: () => Promise<{ default: ComponentType }>;
}
export type MobileBindingMap = Readonly<Record<string, MobileToolBinding | undefined>>;
export type MobileAvailability =
  | { readonly available: true; readonly binding: MobileToolBinding }
  | { readonly available: false; readonly reason: string; readonly requiredCapabilities: NonNullable<ToolMetadata['capabilities']> };

/** Binding presence is the executable UI proof; portable metadata alone cannot grant it. */
export function mobileAvailability(metadata: ToolMetadata, bindings: MobileBindingMap): MobileAvailability {
  const binding = bindings[metadata.id];
  if (binding) return { available: true, binding };
  const requiredCapabilities = metadata.capabilities ?? [];
  const desktop = requiredCapabilities.filter(capability => capability.kind === 'platform' && capability.web === 'unavailable');
  return {
    available: false,
    reason: desktop.length
      ? `Requires desktop capabilities: ${desktop.map(capability => capability.kind === 'platform' ? capability.note : '').join('; ')}.`
      : 'Mobile UI is not implemented for this tool.',
    requiredCapabilities,
  };
}
