// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'recurrence-rule';
export const binding = {
    load: () => import('./recurrence-rule').then((m) => m.RecurrenceRule)
};
