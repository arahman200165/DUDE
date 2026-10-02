// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'regex-benchmark';
export const binding = {
    load: () => import('./regex-benchmark').then((m) => m.RegexBenchmark)
};
