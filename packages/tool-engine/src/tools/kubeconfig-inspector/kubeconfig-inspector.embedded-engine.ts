import { inspectKubeconfig, redactSecret, type KubeconfigUser } from "./kubeconfig-inspector-logic.js";
export function KubeconfigInspector_secretEntries(user: KubeconfigUser): readonly (readonly [
    string,
    string
])[] {
    return Object.entries(user.secretFields);
}
