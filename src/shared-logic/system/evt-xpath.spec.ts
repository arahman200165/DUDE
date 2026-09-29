import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  beforeRecordXPath, buildEventXPath, extractPids, extractServiceName, extractStatusCodes, formatLevel, groupByActivity, levelFromNumber,
  parseCustomViewXml, parseLevelName, relatedEvents, toCustomViewXml,
} from './evt-xpath';
import type { EventRecord } from './system-types';

const event = (over: Partial<EventRecord>): EventRecord => ({
  recordId: '1', timeCreated: '2026-01-01T00:00:00Z', level: 'error', providerName: 'P', eventId: 1, task: '', opcode: '', keywords: [],
  channel: 'System', computer: 'PC', userSid: null, processId: null, threadId: null, activityId: null, relatedActivityId: null, message: '', xml: '<Event/>',
  ...over,
});

describe('buildEventXPath', () => {
  it('returns * for an empty filter', () => {
    expect(buildEventXPath({})).toBe('*');
    expect(buildEventXPath({ levels: [], providers: [' '], eventIds: [], keywordsText: '  ' })).toBe('*');
  });

  it('builds levels, information includes LogAlways', () => {
    expect(buildEventXPath({ levels: ['error', 'warning'] })).toBe('*[System[(Level=2 or Level=3)]]');
    expect(buildEventXPath({ levels: ['information'] })).toBe('*[System[(Level=4 or Level=0)]]');
    expect(buildEventXPath({ levels: ['critical'] })).toBe('*[System[Level=1]]');
  });

  it('builds event ids and ranges, provider and time', () => {
    expect(buildEventXPath({ eventIds: [1000] })).toBe('*[System[EventID=1000]]');
    expect(buildEventXPath({ eventIds: [1000, { from: 20, to: 10 }] })).toBe('*[System[(EventID=1000 or (EventID>=10 and EventID<=20))]]');
    expect(buildEventXPath({ providers: ["Application Error"] })).toBe("*[System[Provider[@Name='Application Error']]]");
    expect(buildEventXPath({ timeRange: { last: 'day' } })).toBe('*[System[TimeCreated[timediff(@SystemTime) <= 86400000]]]');
    expect(buildEventXPath({ timeRange: { since: '2026-01-02T00:00:00Z' } })).toBe("*[System[TimeCreated[@SystemTime >= '2026-01-02T00:00:00.000Z']]]");
    expect(buildEventXPath({ timeRange: { since: 'garbage' } })).toBe('*');
  });

  it('composes everything in Event Viewer order', () => {
    const xpath = buildEventXPath({
      providers: ['A'], eventIds: [7], levels: ['error'], timeRange: { last: 'hour' }, keywordsText: "it's", activityId: '{ABC}',
    });
    expect(xpath).toBe(
      "*[System[Provider[@Name='A'] and EventID=7 and Level=2 and TimeCreated[timediff(@SystemTime) <= 3600000] and Correlation[@ActivityID='{ABC}']] and EventData[Data=\"it's\"]]",
    );
  });

  it('never throws and always returns a * or *[...] string', () => {
    fc.assert(fc.property(fc.string(), fc.array(fc.integer()), (text, ids) => {
      const xpath = buildEventXPath({ providers: [text], eventIds: ids, keywordsText: text });
      expect(xpath === '*' || /^\*\[.*\]$/.test(xpath)).toBe(true);
    }));
  });
});

describe('event log paging XPath', () => {
  it('adds an older-record bound while keeping existing filter clauses', () => {
    expect(beforeRecordXPath('*', '42')).toBe('*[System[EventRecordID < 42]]');
    expect(beforeRecordXPath('*[System[Level=2] and EventData[Data=\'x\']]', '42')).toBe('*[System[EventRecordID < 42] and (System[Level=2] and EventData[Data=\'x\'])]');
    expect(beforeRecordXPath('*', '-1')).toBeNull();
    expect(beforeRecordXPath('Event[System[Level=2]]', '4')).toBeNull();
  });
});
describe('custom view xml', () => {
  it('round-trips channel and xpath', () => {
    const xpath = "*[System[(Level=2 or Level=3) and TimeCreated[@SystemTime >= '2026-01-01T00:00:00.000Z']]]";
    const xml = toCustomViewXml('Microsoft-Windows-X/Operational', xpath);
    expect(xml).toContain('&gt;=');
    expect(parseCustomViewXml(xml)).toEqual({ ok: true, queries: [{ channel: 'Microsoft-Windows-X/Operational', xpath, suppress: [] }] });
  });

  it('parses multiple selects, suppress and Query-level path', () => {
    const xml = `<ViewerConfig><QueryConfig><QueryNode><QueryList>
      <Query Id="0" Path="System"><Select>*[System[Level=2]]</Select><Select Path="Application">*</Select><Suppress Path="System">*[System[EventID=1]]</Suppress></Query>
    </QueryList></QueryNode></QueryConfig></ViewerConfig>`;
    const parsed = parseCustomViewXml(xml);
    expect(parsed).toEqual({
      ok: true,
      queries: [
        { channel: 'System', xpath: '*[System[Level=2]]', suppress: ['*[System[EventID=1]]'] },
        { channel: 'Application', xpath: '*', suppress: ['*[System[EventID=1]]'] },
      ],
    });
  });

  it('reports errors instead of throwing', () => {
    expect(parseCustomViewXml('<x/>').ok).toBe(false);
    expect(parseCustomViewXml('<QueryList></QueryList>').ok).toBe(false);
    fc.assert(fc.property(fc.string(), (s) => { expect(() => parseCustomViewXml(s)).not.toThrow(); }));
  });

  it('round-trips arbitrary channel/xpath text', () => {
    fc.assert(fc.property(fc.stringMatching(/^[A-Za-z0-9 /\-_]{1,20}$/), fc.stringMatching(/^[A-Za-z0-9<>&'"=\[\]@ ]{1,40}$/), (channel, xp) => {
      const parsed = parseCustomViewXml(toCustomViewXml(channel, xp));
      expect(parsed.ok && parsed.queries[0].channel === channel && parsed.queries[0].xpath === xp.trim()).toBe(true);
    }));
  });
});

describe('levels', () => {
  it('maps numbers and names', () => {
    expect(levelFromNumber(0)).toBe('information');
    expect(levelFromNumber(9)).toBe('unknown');
    expect(parseLevelName('Warning')).toBe('warning');
    expect(parseLevelName('1')).toBe('critical');
    expect(parseLevelName('nope')).toBe('unknown');
    expect(formatLevel('verbose')).toBe('Verbose');
  });
});

describe('correlation', () => {
  const nil = '{00000000-0000-0000-0000-000000000000}';
  it('groups by activity id ignoring nil and case', () => {
    const groups = groupByActivity([
      event({ recordId: '1', activityId: '{AB}' }), event({ recordId: '2', activityId: '{ab}' }),
      event({ recordId: '3', activityId: nil }), event({ recordId: '4' }), event({ recordId: '5', activityId: '{CD}' }),
    ]);
    expect(groups.map((g) => [g.activityId, g.events.length])).toEqual([['{ab}', 2], ['{cd}', 1]]);
  });

  it('finds related events by activity or related activity', () => {
    const list = [event({ recordId: '1', activityId: '{A}' }), event({ recordId: '2', relatedActivityId: '{a}' }), event({ recordId: '3', activityId: '{B}' })];
    expect(relatedEvents(list, '{A}').map((e) => e.recordId)).toEqual(['1', '2']);
  });

  it('extracts pids, services and status codes', () => {
    const e = event({
      processId: 700, providerName: 'Service Control Manager', message: 'The Print Spooler service terminated with error 0x80070005.',
      xml: '<Event><EventData><Data Name="param1">Spooler</Data><Data Name="ProcessId">0x1f4</Data></EventData></Event>',
    });
    expect(extractPids(e)).toEqual([700, 500]);
    expect(extractServiceName(e)).toBe('Spooler');
    expect(extractServiceName(event({ message: 'The Print Spooler service entered the running state.' }))).toBe('Print Spooler');
    expect(extractServiceName(event({}))).toBeNull();
    expect(extractStatusCodes(e)).toEqual(['0x80070005']);
  });
});
