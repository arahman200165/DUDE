import { describe, expect, it } from 'vitest';
import { detectStackTraceLanguage } from "./stack-trace-detect.js";

describe('detectStackTraceLanguage', () => {
  it('detects Python from the Traceback header', () => {
    const text = ['Traceback (most recent call last):', '  File "/app/main.py", line 10, in <module>', '    process()', 'ZeroDivisionError: division by zero'].join(
      '\n',
    );
    expect(detectStackTraceLanguage(text)).toBe('python');
  });

  it('detects Java from an "at ...(Foo.java:N)" frame', () => {
    const text = ['java.lang.NullPointerException: boom', '\tat com.example.app.Main.process(Main.java:24)'].join('\n');
    expect(detectStackTraceLanguage(text)).toBe('java');
  });

  it('detects Java from a Caused by chain even without a recognizable frame', () => {
    expect(detectStackTraceLanguage('Caused by: java.lang.IllegalStateException: invalid state')).toBe('java');
  });

  it('detects .NET from a ".cs:line N" frame', () => {
    const text = [
      'System.NullReferenceException: Object reference not set to an instance of an object.',
      '   at MyApp.Services.OrderService.Process(Order order) in C:\\src\\MyApp\\Services\\OrderService.cs:line 42',
    ].join('\n');
    expect(detectStackTraceLanguage(text)).toBe('dotnet');
  });

  it('detects JavaScript from a "(file.js:N:N)" frame', () => {
    const text = ["TypeError: Cannot read properties of undefined (reading 'foo')", '    at Object.<anonymous> (/app/src/index.js:12:20)'].join('\n');
    expect(detectStackTraceLanguage(text)).toBe('javascript');
  });

  it('falls back to unknown for unrecognized text', () => {
    expect(detectStackTraceLanguage('just some random text, not a stack trace')).toBe('unknown');
  });
});
