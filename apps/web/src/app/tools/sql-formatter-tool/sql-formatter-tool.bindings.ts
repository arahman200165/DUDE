// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'sql-formatter-tool';
export const binding = {
    load: () => import('./sql-formatter-tool').then((m) => m.SqlFormatterTool)
};
