// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'stack-trace-formatter';
export const binding = {
    load: () => import('./stack-trace-formatter').then((m) => m.StackTraceFormatter)
};
