// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'bigint-calculator';
export const binding = {
    load: () => import('./bigint-calculator-tool').then((m) => m.BigintCalculatorTool)
};
