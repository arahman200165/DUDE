// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'snowflake-id-tools';
export const binding = {
    load: () => import('./snowflake-id-tools').then((m) => m.SnowflakeIdTools)
};
