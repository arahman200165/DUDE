// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'schema-diff';
export const binding = {
    load: () => import('./schema-diff').then((m) => m.SchemaDiff)
};
