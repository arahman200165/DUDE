const UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'] as const;

/** A short human size for a component sentence (`12.3 GiB`). */
export function formatBytes(bytes: number): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? String(Math.round(value)) : value.toFixed(1)} ${UNITS[unit]}`;
}
