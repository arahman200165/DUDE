import { Injectable, computed, inject, signal } from '@angular/core';
import { defaultDisplayName, uuidv7, validateDisplayName } from '@dude/persistence';
import { PLATFORM_BRIDGE } from '../platform/platform-bridge.adapter';
import { BOOT_SNAPSHOT } from '../persistence/device-store/boot-snapshot';
import { createWindowStorageBackend } from '../persistence/window-storage-backend';

/** Web installation record; `PersistenceService.clearAll()` leaves it alone so the installation ID is stable. */
export const DEVICE_NAMESPACE = '__device__';
export const INSTALLATION_STORAGE_KEY = `dude:v1:${DEVICE_NAMESPACE}:installation`;

export interface DeviceIdentity {
  readonly deviceId: string;
  readonly environmentId: string;
  readonly displayName: string;
  readonly platform: string;
  readonly appVersion?: string;
  readonly enrollmentState: string;
  readonly enrollment?: { readonly environmentId: string; readonly hubInstanceId: string; readonly hubUrl: string; readonly enrolledAt: string };
  readonly clonedFrom?: string;
}

interface InstallationRecord { deviceId: string; environmentId: string; displayName: string; createdAt: string }

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

function isInstallation(value: unknown): value is InstallationRecord {
  const v = value as Partial<InstallationRecord> | null;
  return !!v && typeof v === 'object' && typeof v.deviceId === 'string' && typeof v.environmentId === 'string' && typeof v.displayName === 'string';
}

/** Who this device is: from the Device Store on desktop, a minted installation record in localStorage on web. */
@Injectable({ providedIn: 'root' })
export class DeviceIdentityService {
  private readonly bridge = inject(PLATFORM_BRIDGE);
  private readonly snapshot = inject(BOOT_SNAPSHOT);
  private readonly state = signal<DeviceIdentity | null>(this.initial());
  /** Null while a desktop store is not ready (no device record to show); never a minted web-style record on desktop. */
  readonly identity = this.state.asReadonly();
  readonly status = computed<'ready' | 'unavailable'>(() => (this.state() ? 'ready' : 'unavailable'));

  async rename(name: string): Promise<{ ok: true; displayName: string } | { ok: false; error: string }> {
    const checked = validateDisplayName(name);
    if (!checked.ok) return checked;
    const device = this.bridge.get()?.device;
    if (device) {
      if (!this.snapshot.boot?.device) return { ok: false, error: 'The Device Store is unavailable.' };
      const result = await device.rename(checked.value);
      if (!result.ok) return result;
      this.state.update((current) => (current ? { ...current, displayName: result.displayName } : current));
      return { ok: true, displayName: result.displayName };
    }
    const record = this.readInstallation();
    if (record) this.writeInstallation({ ...record, displayName: checked.value });
    this.state.update((current) => (current ? { ...current, displayName: checked.value } : current));
    return { ok: true, displayName: checked.value };
  }

  /** Web only: replaces the installation record with a freshly minted one (the web half of "Reset this device"). */
  resetInstallation(): void {
    if (this.bridge.get()) return;
    const record = this.mintInstallation();
    this.state.set({ deviceId: record.deviceId, environmentId: record.environmentId, displayName: record.displayName, platform: 'web', enrollmentState: 'standalone' });
  }

  private initial(): DeviceIdentity | null {
    const device = this.snapshot.boot?.device;
    if (device) {
      return {
        deviceId: device.deviceId, environmentId: device.environmentId, displayName: device.displayName,
        platform: device.platform, appVersion: device.appVersion, enrollmentState: device.enrollmentState, enrollment: device.enrollment, clonedFrom: device.clonedFrom,
      };
    }
    if (this.bridge.get()) return null;
    const record = this.readInstallation() ?? this.mintInstallation();
    return { deviceId: record.deviceId, environmentId: record.environmentId, displayName: record.displayName, platform: 'web', enrollmentState: 'standalone' };
  }

  private readInstallation(): InstallationRecord | null {
    try {
      const raw = createWindowStorageBackend('local').get(INSTALLATION_STORAGE_KEY);
      const parsed: unknown = raw === null ? null : JSON.parse(raw);
      return isInstallation(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private writeInstallation(record: InstallationRecord): void {
    createWindowStorageBackend('local').set(INSTALLATION_STORAGE_KEY, JSON.stringify(record));
  }

  private mintInstallation(): InstallationRecord {
    const record: InstallationRecord = {
      deviceId: uuidv7(randomBytes, Date.now),
      environmentId: uuidv7(randomBytes, Date.now),
      displayName: defaultDisplayName('web'),
      createdAt: new Date().toISOString(),
    };
    this.writeInstallation(record);
    return record;
  }
}
