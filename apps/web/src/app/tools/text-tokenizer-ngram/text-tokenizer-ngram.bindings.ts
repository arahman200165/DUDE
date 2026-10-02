// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'text-tokenizer-ngram';
export const binding = {
    load: () => import('./text-tokenizer-ngram').then((m) => m.TextTokenizerNGram)
};
