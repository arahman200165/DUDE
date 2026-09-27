/**
 * The BYO collaboration relay preference (Stage 7) — owned by this tool since the Settings tool became
 * a shell destination. The global value lives under this tool's own namespace (migrated from the
 * legacy `settings:relayUrl` key by the manifest's `storageMigrations`); a saved workspace may
 * override it (`settingsSection.workspaceOverridable`, resolved via `resolvePreference`).
 */
export const MARKDOWN_WORKSPACE_TOOL_ID = 'markdown-workspace';
export const RELAY_URL_KEY = 'relayUrl';
