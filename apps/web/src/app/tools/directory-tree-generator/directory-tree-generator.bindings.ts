// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'directory-tree-generator';
export const binding = {
    load: () => import('./directory-tree-generator').then((m) => m.DirectoryTreeGeneratorTool)
};
