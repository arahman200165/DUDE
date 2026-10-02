import { formatQuantity } from "../k8s-quantity-converter/k8s-quantity-converter-logic.js";
export function K8sResourceCalculator_formatCpu(cores: number): string {
    return `${formatQuantity(cores, 'm')} (${cores} cores)`;
}
export function K8sResourceCalculator_formatMemory(bytes: number): string {
    return formatQuantity(bytes, 'Mi');
}
