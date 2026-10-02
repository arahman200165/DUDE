// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'invisible-char-scanner';
export const binding = {
    load: () => import('./invisible-char-scanner').then((m) => m.InvisibleCharScanner)
};
