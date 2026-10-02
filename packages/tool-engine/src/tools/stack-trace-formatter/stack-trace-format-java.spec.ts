import { describe, expect, it } from 'vitest';
import { formatJavaStackTrace } from "./stack-trace-format-java.js";

const SAMPLE = [
  'Exception in thread "main" java.lang.NullPointerException: Cannot invoke "String.length()" because "s" is null',
  '\tat com.example.app.Main.process(Main.java:24)',
  '\tat com.example.app.Main.main(Main.java:10)',
  'Caused by: java.lang.IllegalStateException: invalid state',
  '\tat com.example.app.Helper.validate(Helper.java:15)',
  '\tat com.example.app.Main.process(Main.java:22)',
  '\t... 1 more',
].join('\n');

describe('formatJavaStackTrace', () => {
  it('tags application frames, the Caused by header, and the elided-frames line', () => {
    const result = formatJavaStackTrace(SAMPLE);
    const kinds = result.lines.map((l) => l.kind);
    expect(kinds[0]).toBe('header');
    expect(kinds[1]).toBe('frame-app');
    expect(kinds[3]).toBe('cause');
    expect(kinds[6]).toBe('other');
  });

  it('tags JDK/framework frames as library frames', () => {
    const trace = formatJavaStackTrace('\tat java.base/java.util.ArrayList.get(ArrayList.java:459)');
    expect(trace.lines[0].kind).toBe('frame-library');
  });
});
