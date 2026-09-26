describe('markPerf', () => {
  const originalEnv = process.env['DUDE_PERF_LOG'];
  const originalLog = console.log;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env['DUDE_PERF_LOG'];
    else process.env['DUDE_PERF_LOG'] = originalEnv;
    console.log = originalLog;
    vi.resetModules();
  });

  it('does not log when DUDE_PERF_LOG is unset', async () => {
    delete process.env['DUDE_PERF_LOG'];
    const logSpy = vi.fn();
    console.log = logSpy;
    const { markPerf } = await import('./perf-log');

    markPerf('some-label');

    expect(logSpy).not.toHaveBeenCalled();
  });

  it('logs a PERF line with the label when DUDE_PERF_LOG is set', async () => {
    process.env['DUDE_PERF_LOG'] = '1';
    const logSpy = vi.fn();
    console.log = logSpy;
    const { markPerf } = await import('./perf-log');

    markPerf('some-label');

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toMatch(/^PERF some-label \d+\.\d$/);
  });
});
