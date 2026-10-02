// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'rot-cipher';
export const binding = {
    load: () => import('./rot-cipher-tool').then((m) => m.RotCipherTool)
};
