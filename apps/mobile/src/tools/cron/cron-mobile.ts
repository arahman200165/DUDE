import type { KeyValueRow } from '../../kit';
import { parseCronExpression, type CronParseResult, type CronTimezoneMode } from '@dude/tool-engine/tools/cron/cron-parse';

export type CronDirection = 'next' | 'previous';

/** The web tool's example chips. */
export const CRON_PRESETS: readonly { readonly id: string; readonly label: string; readonly expression: string }[] = [
  { id: 'every-minute', label: 'Every minute', expression: '* * * * *' },
  { id: 'every-hour', label: 'Every hour', expression: '0 * * * *' },
  { id: 'daily-midnight', label: 'Daily at midnight', expression: '0 0 * * *' },
  { id: 'monday-9am', label: 'Every Monday at 9am', expression: '0 9 * * 1' },
  { id: 'daily-macro', label: '@daily', expression: '@daily' },
];

const MACROS: Readonly<Record<string, string>> = {
  '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *', '@monthly': '0 0 1 * *', '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *', '@midnight': '0 0 * * *', '@hourly': '0 * * * *',
};
const FIVE_FIELDS = ['minute', 'hour', 'day of month', 'month', 'day of week'] as const;
const SIX_FIELDS = ['second', ...FIVE_FIELDS] as const;

/** Splits an expression into its named fields (`@daily` style macros are shown as their expansion). Empty when it is not 5 or 6 fields. */
export function fieldBreakdown(expression: string): readonly KeyValueRow[] {
  const trimmed = expression.trim();
  const expanded = MACROS[trimmed.toLowerCase()] ?? trimmed;
  const parts = expanded.split(/\s+/).filter(Boolean);
  const names: readonly string[] | null = parts.length === 5 ? FIVE_FIELDS : parts.length === 6 ? SIX_FIELDS : null;
  if (!names) return [];
  return names.map((name, index) => ({ key: `field-${name.replace(/ /g, '-')}`, label: name[0]!.toUpperCase() + name.slice(1), value: parts[index]! }));
}

export interface CronView {
  readonly description: string;
  readonly runs: readonly KeyValueRow[];
  readonly fields: readonly KeyValueRow[];
}
export type CronOutcome = { readonly ok: true; readonly view: CronView } | { readonly ok: false; readonly error: string };

/** Description, run list and field breakdown from the same `parseCronExpression` call as the web tool. */
export function cronView(expression: string, options: { readonly count: number; readonly tz: CronTimezoneMode; readonly direction: CronDirection; readonly now?: Date }): CronOutcome {
  const parsed: CronParseResult = parseCronExpression(expression, { count: options.count, tz: options.tz, now: options.now });
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const list = options.direction === 'next' ? parsed.nextRuns : parsed.previousRuns;
  return {
    ok: true,
    view: {
      description: parsed.description,
      runs: list.map((run, index) => ({ key: `run-${index + 1}`, label: `${options.direction === 'next' ? 'Next' : 'Previous'} run ${index + 1}`, value: run.display })),
      fields: fieldBreakdown(expression),
    },
  };
}
