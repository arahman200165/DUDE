import { HttpsConfigAnalyzerTool } from './https-config-analyzer';
import type { HttpsAnalysisView } from "@dude/contracts/core/platform/network-live-types";

describe('HttpsConfigAnalyzerTool', () => {
  it('builds an https-analyzer request', () => {
    const tool = new HttpsConfigAnalyzerTool();
    (tool as unknown as { host: { set(v: string): void } }).host.set(' example.com ');
    (tool as unknown as { port: { set(v: number): void } }).port.set(8443);
    expect((tool as unknown as { build(): unknown }).build()).toEqual({ kind: 'https-analyzer', target: 'example.com', port: 8443 });
  });

  it('passes findings through and recognizes its own result shape', () => {
    const tool = new HttpsConfigAnalyzerTool();
    const view = { findings: [{ id: 'x', status: 'pass', title: 'ok' }], summary: { fail: 0, warn: 0, pass: 1 }, host: 'x', port: 443, supportedVersions: ['TLSv1.3'], redirectsToHttps: true, hsts: null } as unknown as HttpsAnalysisView;
    expect(tool['view'](view)).toBe(view);
    expect(tool['view']({})).toBeNull();
    expect(tool['findings'](view)).toHaveLength(1);
  });
});
