// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'json-schema-validator';
export const binding = {
    load: () => import('./json-schema-validator').then((m) => m.JsonSchemaValidator)
};
