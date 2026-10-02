// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'unicode-character-inspector';
export const binding = {
    load: () => import('./unicode-character-inspector').then((m) => m.UnicodeCharacterInspector)
};
