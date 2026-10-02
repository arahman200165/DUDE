// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'stopwatch-countdown';
export const binding = {
    load: () => import('./stopwatch-countdown').then((m) => m.StopwatchCountdown)
};
