// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'latency-monitor';
export const binding = {
    load: () => import('./latency-monitor').then((m) => m.LatencyMonitorTool)
};
