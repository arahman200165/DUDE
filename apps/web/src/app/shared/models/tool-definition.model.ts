import type { ToolMetadata, ToolSettingsSection as PortableSettingsSection } from "@dude/domain/shared/models/tool-metadata.model";
export type { ConsequenceClass, ToolFileInput, ToolPersistencePolicy, ToolExecutionPolicy, ToolNetworkPolicy, ToolVerificationMetadata, WorkspaceOverridablePreference } from "@dude/domain/shared/models/tool-metadata.model";
export type ToolSettingsSection = PortableSettingsSection & { readonly load: () => Promise<unknown> };
export interface ToolDefinition extends Omit<ToolMetadata, 'settingsSection'> {
 readonly load: () => Promise<unknown>;
 readonly settingsSection?: ToolSettingsSection;
}
