// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'sql-parameterizer';
export const binding = {
    load: () => import('./sql-parameterizer').then((m) => m.SqlParameterizer)
};
