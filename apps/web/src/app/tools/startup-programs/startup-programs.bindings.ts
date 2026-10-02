// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'startup-programs';
export const binding = {
    load: () => import('./startup-programs').then((m) => m.StartupProgramsTool)
};
