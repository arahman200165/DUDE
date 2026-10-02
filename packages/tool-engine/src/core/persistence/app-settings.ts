/**
 * The storage namespace for app-level Settings (the `/settings` shell destination, `shell/settings/`).
 * It was once the Settings *tool's* id and is kept verbatim so existing `dude:v1:settings:*` keys
 * (appearance) keep working. Not a tool id any more. The AI provider config and API key no longer live
 * here: base URL/model are a main-process device doc and the key is a `SecretPurpose` (`ai.llmApiKey`).
 */
export const APP_SETTINGS_NAMESPACE = 'settings';

/** The persisted appearance preferences (`core/appearance/`), stored as `dude:v1:settings:appearance`. */
export const APPEARANCE_KEY = 'appearance';
