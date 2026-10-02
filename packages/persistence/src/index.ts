export { uuidv7, isUuid, isUuidShaped } from './ids/uuidv7.js';
export {
  DEVICE_RECORD_SCHEMA_VERSION, DEVICE_PLATFORMS, defaultDisplayName, validateDisplayName, decodeDeviceRecord,
} from './device/device-record.model.js';
export type { EnrollmentState, DevicePlatform, DeviceCapabilities, DeviceRecord, DisplayNameResult } from './device/device-record.model.js';
export { decodeEnvironmentRecord } from './device/environment.model.js';
export type { EnvironmentRecord } from './device/environment.model.js';
export type { SettingStorage, SettingDefinition } from './settings/setting-definition.model.js';
export { SETTING_DEFINITIONS, findSettingDefinition } from './settings/core-setting-definitions.js';
export { resolveToolKeyScope } from './settings/scope-rules.js';
export { resolveKvScope, createManifestScopeLookup } from './settings/kv-scope.js';
export type { ManifestScopeLookup } from './settings/kv-scope.js';
export type { ToolSettingScopeOverride } from './settings/scope-rules.js';
export * from './codecs/index.js';
export type {
  KvEntry, KvKey, KvWriteMeta, KeyValueRepository, CommitResult, EntityCollectionRepository,
  HistoryRecord, HistoryRetention, HistoryAddResult, HistoryRepository,
  NetworkRunRecord, NetworkRunRetention, NetworkRunAddResult, NetworkRunRepository,
  OutboxSummary, OutboxStatusReader, DeviceIdentity, DeviceIdentityPort,
} from './repositories/ports.js';
export { SECRET_PURPOSES, isSecretPurpose, isSecretRef, maskSecretHint } from './secrets/secret-ref.model.js';
export type { SecretRef, SecretRefRecord, SecretPurpose, SecretStatus } from './secrets/secret-ref.model.js';
