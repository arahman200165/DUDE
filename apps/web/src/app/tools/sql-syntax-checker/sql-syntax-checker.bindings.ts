// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'sql-syntax-checker';
export const binding = {
    load: () => import('./sql-syntax-checker').then((m) => m.SqlSyntaxChecker)
};
