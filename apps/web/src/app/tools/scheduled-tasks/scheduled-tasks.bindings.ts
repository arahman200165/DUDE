// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'scheduled-tasks';
export const binding = {
    load: () => import('./scheduled-tasks').then((m) => m.ScheduledTasksTool)
};
