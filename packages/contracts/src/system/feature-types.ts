/** Windows optional features and Features on Demand exposed by PowerShell 7. */
export type WindowsFeatureState = 'enabled' | 'disabled' | 'enabled-pending' | 'disabled-pending' | 'unknown';

export interface WindowsFeature {
  readonly name: string;
  readonly displayName: string;
  readonly state: WindowsFeatureState;
  /** DISM restart requirement when available; CIM-only reads report null. */
  readonly restartNeeded: boolean | null;
}

export type WindowsCapabilityState = 'installed' | 'not-present' | 'staged' | 'install-pending' | 'uninstall-pending' | 'unknown';

export interface WindowsCapability {
  readonly name: string;
  readonly displayName: string;
  readonly state: WindowsCapabilityState;
}

export interface WindowsFeatureList {
  readonly features: readonly WindowsFeature[];
}

export interface WindowsCapabilityList {
  readonly capabilities: readonly WindowsCapability[];
}
