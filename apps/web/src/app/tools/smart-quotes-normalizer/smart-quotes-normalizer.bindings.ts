// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'smart-quotes-normalizer';
export const binding = {
    load: () => import('./smart-quotes-normalizer').then((m) => m.SmartQuotesNormalizer)
};
