// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'registry-editor';
export const binding = {
    load: () => import('./registry-editor').then((m) => m.RegistryEditorTool)
};
