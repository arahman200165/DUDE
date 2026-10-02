import { describe, expect, it } from 'vitest';
import { formatDotNetStackTrace } from "./stack-trace-format-dotnet.js";

const SAMPLE = [
  'System.NullReferenceException: Object reference not set to an instance of an object.',
  '   at MyApp.Services.OrderService.Process(Order order) in C:\\src\\MyApp\\Services\\OrderService.cs:line 42',
  '   at MyApp.Program.Main(String[] args) in C:\\src\\MyApp\\Program.cs:line 15',
].join('\n');

describe('formatDotNetStackTrace', () => {
  it('tags application frames and the exception header', () => {
    const result = formatDotNetStackTrace(SAMPLE);
    expect(result.lines[0].kind).toBe('header');
    expect(result.lines[1].kind).toBe('frame-app');
    expect(result.lines[2].kind).toBe('frame-app');
  });

  it('tags BCL frames as library frames', () => {
    const result = formatDotNetStackTrace('   at System.Collections.Generic.List`1.get_Item(Int32 index)');
    expect(result.lines[0].kind).toBe('frame-library');
  });

  it('tags an inner-exception marker as a cause', () => {
    const result = formatDotNetStackTrace(' ---> System.InvalidOperationException: Inner failure');
    expect(result.lines[0].kind).toBe('cause');
  });
});
