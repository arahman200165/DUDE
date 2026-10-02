// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'sql-query-explainer';
export const binding = {
    load: () => import('./sql-query-explainer').then((m) => m.SqlQueryExplainer)
};
