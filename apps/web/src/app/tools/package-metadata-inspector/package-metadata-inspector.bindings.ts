// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'package-metadata-inspector';
export const binding = {
    load: () => import('./package-metadata-inspector').then((m) => m.PackageMetadataInspector)
};
