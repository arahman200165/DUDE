import { buildExplainMessages, buildGenerateMessages, parseGeneratedPattern } from "./regex-ai.js";

describe('buildGenerateMessages', () => {
  it('puts the description in a user message after a system prompt', () => {
    const messages = buildGenerateMessages('a US phone number');
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1]).toEqual({ role: 'user', content: 'a US phone number' });
  });
});

describe('buildExplainMessages', () => {
  it('formats the pattern and flags as a /pattern/flags user message', () => {
    const messages = buildExplainMessages('a+b', 'gi');
    expect(messages[1]).toEqual({ role: 'user', content: '/a+b/gi' });
  });
});

describe('parseGeneratedPattern', () => {
  it('parses a clean JSON object', () => {
    expect(parseGeneratedPattern('{"pattern": "a+b", "flags": "gi"}')).toEqual({ ok: true, pattern: 'a+b', flags: 'gi' });
  });

  it('defaults flags to an empty string when omitted', () => {
    expect(parseGeneratedPattern('{"pattern": "a+b"}')).toEqual({ ok: true, pattern: 'a+b', flags: '' });
  });

  it('extracts JSON even when wrapped in prose or code fences', () => {
    const raw = 'Sure! Here you go:\n```json\n{"pattern": "\\\\d+", "flags": "g"}\n```\nHope that helps.';
    expect(parseGeneratedPattern(raw)).toEqual({ ok: true, pattern: '\\d+', flags: 'g' });
  });

  it('fails when there is no JSON object in the response', () => {
    const result = parseGeneratedPattern('I cannot help with that.');
    expect(result.ok).toBe(false);
  });

  it('fails when the JSON is malformed', () => {
    const result = parseGeneratedPattern('{"pattern": "a+b",}');
    expect(result.ok).toBe(false);
  });

  it('fails when pattern is missing or empty', () => {
    expect(parseGeneratedPattern('{"flags": "g"}').ok).toBe(false);
    expect(parseGeneratedPattern('{"pattern": "", "flags": "g"}').ok).toBe(false);
  });
});
