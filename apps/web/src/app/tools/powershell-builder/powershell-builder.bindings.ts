// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'powershell-builder';
export const binding = {
    load: () => import('./powershell-builder').then((m) => m.PowerShellBuilderTool)
};
