// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'password-strength-analyzer';
export const binding = {
    load: () => import('./password-strength-analyzer').then((m) => m.PasswordStrengthAnalyzer)
};
