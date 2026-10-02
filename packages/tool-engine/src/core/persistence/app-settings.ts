/**
 * The storage namespace for app-level Settings (the `/settings` shell destination, `shell/settings/`).
 * It was once the Settings *tool's* id; it is kept verbatim because `apps/desktop/llm-bridge.ts` reads the
 * LLM provider config straight from the OS-keychain store as `dude:v1:settings:llm*` — renaming it
 * would silently disconnect every configured AI provider. Not a tool id any more.
 */
export const APP_SETTINGS_NAMESPACE = 'settings';

export const LLM_BASE_URL_KEY = 'llmBaseUrl';
export const LLM_MODEL_KEY = 'llmModel';
export const LLM_API_KEY_KEY = 'llmApiKey';

/** The persisted appearance preferences (`core/appearance/`), stored as `dude:v1:settings:appearance`. */
export const APPEARANCE_KEY = 'appearance';
