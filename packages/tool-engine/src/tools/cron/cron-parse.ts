import { CronExpressionParser } from 'cron-parser';
import cronstrue from 'cronstrue';

export type CronTimezoneMode = 'local' | 'utc';

export interface CronNextRun {
  readonly date: Date;
  readonly display: string;
}

export type CronParseResult =
  | {
      readonly ok: true;
      readonly description: string;
      readonly nextRuns: readonly CronNextRun[];
      /** Most-recent-first: `previousRuns[0]` is the most recent past run. */
      readonly previousRuns: readonly CronNextRun[];
    }
  | { readonly ok: false; readonly error: string };

/**
 * cronstrue understands `@`-macros (e.g. `@daily`) and 6-field
 * seconds-prefixed expressions natively, so the raw expression is passed to
 * both libraries as-is — no normalization step is needed.
 *
 * `next()` and `prev()` share one interval's internal cursor, so next-runs
 * and previous-runs each get their own `CronExpressionParser.parse()` call
 * (same options) rather than reusing one interval for both directions.
 */
export function parseCronExpression(
  expression: string,
  options: { readonly count: number; readonly tz: CronTimezoneMode; readonly now?: Date },
): CronParseResult {
  const trimmed = expression.trim();
  if (trimmed === '') return { ok: false, error: 'Enter a cron expression.' };

  const parserOptions = { currentDate: options.now ?? new Date(), tz: options.tz === 'utc' ? 'UTC' : undefined };

  let nextInterval;
  try {
    nextInterval = CronExpressionParser.parse(trimmed, parserOptions);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  const previousInterval = CronExpressionParser.parse(trimmed, parserOptions);

  let description: string;
  try {
    description = cronstrue.toString(trimmed, { verbose: true });
  } catch {
    description = 'Custom schedule';
  }

  const toRun = (date: Date): CronNextRun => ({ date, display: options.tz === 'utc' ? date.toISOString() : date.toLocaleString() });

  const nextRuns: CronNextRun[] = [];
  for (let i = 0; i < options.count; i++) nextRuns.push(toRun(nextInterval.next().toDate()));

  const previousRuns: CronNextRun[] = [];
  for (let i = 0; i < options.count; i++) previousRuns.push(toRun(previousInterval.prev().toDate()));

  return { ok: true, description, nextRuns, previousRuns };
}
