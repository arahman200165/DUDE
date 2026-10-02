import type { RegistryValue } from "./system-types.js";

/** Installed software rows shared by the Electron reader and the desktop tool. */
export type SoftwareSource = 'registry-64' | 'registry-32' | 'user' | 'appx';

export interface InstalledSoftware {
  id: string;
  name: string;
  publisher: string | null;
  /** Registry date formatted as YYYYMMDD, or null when absent/unusable. */
  installDate: string | null;
  estimatedSizeBytes: number | null;
  version: string | null;
  source: SoftwareSource;
  installLocation: string | null;
  uninstallCommand: string | null;
  /** Unsafe or unsupported commands remain visible but cannot be launched. */
  uninstallable: boolean;
  productCode: string | null;
}

export interface SoftwareRegistryRecord {
  keyName: string;
  values: readonly Pick<RegistryValue, 'name' | 'data'>[];
  view: '64' | '32' | 'default';
  hive: 'HKLM' | 'HKCU';
}
