// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'epoch-timeline-visualizer';
export const binding = {
    load: () => import('./epoch-timeline-visualizer').then((m) => m.EpochTimelineVisualizer)
};
