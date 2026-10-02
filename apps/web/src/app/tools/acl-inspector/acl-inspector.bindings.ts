// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'acl-inspector';
export const binding = {
    load: () => import('./acl-inspector').then((module) => module.AclInspectorTool)
};
