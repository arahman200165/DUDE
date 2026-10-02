// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'programmer-calculator';
export const binding = {
    load: () => import('./programmer-calculator-tool').then((m) => m.ProgrammerCalculatorTool)
};
