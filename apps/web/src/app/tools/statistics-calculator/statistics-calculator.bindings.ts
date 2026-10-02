// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'statistics-calculator';
export const binding = {
    load: () => import('./statistics-calculator').then((m) => m.StatisticsCalculator)
};
