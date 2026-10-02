// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'relative-time-parser';
export const binding = {
    load: () => import('./relative-time-parser').then((m) => m.RelativeTimeParser)
};
