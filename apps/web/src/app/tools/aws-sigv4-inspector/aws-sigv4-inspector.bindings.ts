// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'aws-sigv4-inspector';
export const binding = {
    load: () => import('./aws-sigv4-inspector').then((m) => m.AwsSigv4Inspector)
};
