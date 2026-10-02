// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'tailwind-color-matcher';
export const binding = {
    load: () => import('./tailwind-color-matcher').then((m) => m.TailwindColorMatcher)
};
