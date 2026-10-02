import * as esm_rrule from 'rrule';
const { RRule } = (Reflect.get(esm_rrule, 'default') ?? esm_rrule) as typeof esm_rrule;
type RRule = InstanceType<typeof RRule>;
import { DateTime } from 'luxon';

export interface RecurrenceInput {
  readonly startDate: string;
  readonly startTime: string;
  readonly ruleText: string;
  readonly timezone: string;
  readonly maxOccurrences: number;
}

export type RecurrenceResult =
  | { readonly ok: true; readonly occurrences: readonly string[]; readonly humanText: string }
  | { readonly ok: false; readonly error: string };

const MAX_OCCURRENCES_CAP = 500;

/**
 * `rrule` has no IANA-timezone awareness of its own — it operates on plain
 * JS `Date` wall-clock components. We build DTSTART from the zoned start's
 * wall-clock fields and re-attach the chosen timezone only when formatting
 * each returned occurrence, using `luxon` (already a dependency).
 */
export function computeOccurrences(input: RecurrenceInput): RecurrenceResult {
  const startLocal = DateTime.fromISO(`${input.startDate}T${input.startTime || '00:00'}`, { zone: input.timezone });
  if (!startLocal.isValid) return { ok: false, error: 'Enter a valid start date/time.' };

  if (!input.ruleText.trim()) return { ok: false, error: 'Enter a recurrence rule (e.g. FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=10).' };

  let rule: RRule;
  try {
    const dtstart = new Date(startLocal.year, startLocal.month - 1, startLocal.day, startLocal.hour, startLocal.minute);
    const parsed = RRule.parseString(input.ruleText);
    if (!parsed.freq && parsed.freq !== 0) return { ok: false, error: 'Rule must include a FREQ (e.g. FREQ=WEEKLY).' };
    rule = new RRule({ ...parsed, dtstart });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not parse this recurrence rule.' };
  }

  const maxOccurrences = Math.max(1, Math.min(MAX_OCCURRENCES_CAP, Math.trunc(input.maxOccurrences) || 10));
  const dates = rule.all((_date, i) => i < maxOccurrences);

  const occurrences = dates.map(
    (date) =>
      DateTime.fromObject(
        {
          year: date.getFullYear(),
          month: date.getMonth() + 1,
          day: date.getDate(),
          hour: date.getHours(),
          minute: date.getMinutes(),
        },
        { zone: input.timezone },
      ).toISO() ?? '',
  );

  let humanText: string;
  try {
    humanText = rule.toText();
  } catch {
    humanText = '';
  }

  return { ok: true, occurrences, humanText };
}
