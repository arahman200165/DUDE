// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'week-number-calculator';
export const binding = {
    load: () => import('./week-number-calculator').then((m) => m.WeekNumberCalculator)
};
