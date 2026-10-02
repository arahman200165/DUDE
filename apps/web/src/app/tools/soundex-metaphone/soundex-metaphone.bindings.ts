// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'soundex-metaphone';
export const binding = {
    load: () => import('./soundex-metaphone').then((m) => m.SoundexMetaphone)
};
