// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'sql-dialect-converter';
export const binding = {
    load: () => import('./sql-dialect-converter').then((m) => m.SqlDialectConverter)
};
