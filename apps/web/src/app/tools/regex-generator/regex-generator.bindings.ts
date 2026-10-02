// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'regex-generator';
export const binding = {
    load: () => import('./regex-generator').then((m) => m.RegexGenerator)
};
