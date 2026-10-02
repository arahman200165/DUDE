// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'batch-operations';
export const binding = {
    load: () => import('./batch-operations').then((m) => m.BatchOperationsTool),
    settingsLoad: () => import('./batch-operations.settings').then((m) => m.BatchOperationsSettings)
};
