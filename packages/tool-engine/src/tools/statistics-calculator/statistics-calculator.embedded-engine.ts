
export function StatisticsCalculator_formatNumber(value: number): string {
    return Number.isInteger(value) ? value.toString() : value.toFixed(4).replace(/\.?0+$/, '');
}
