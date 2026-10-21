import { parseUserAgent } from '@dude/tool-engine/tools/user-agent/ua-parse';
import { defineTextTool } from '../../kit';

const join = (...parts: readonly (string | undefined)[]): string => parts.filter(part => part).join(' ') || 'Unknown';

/**
 * The web "Use my browser" action has no Android equivalent (React Native exposes no `navigator.userAgent`), so it is
 * not offered. Input is session-scoped on web, so memory-only here.
 */
export default defineTextTool({
  toolId: 'user-agent',
  outputKind: 'kv',
  inputLabel: 'User-Agent',
  sampleInput: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  run: input => {
    const result = parseUserAgent(input);
    if (!result.ok) return { ok: false, error: result.error };
    const { browser, engine, os, device, cpu } = result.parsed;
    return {
      ok: true,
      output: [
        { key: 'browser', label: 'Browser', value: join(browser.name, browser.version) },
        { key: 'engine', label: 'Engine', value: join(engine.name, engine.version) },
        { key: 'os', label: 'Operating system', value: join(os.name, os.version) },
        { key: 'device', label: 'Device', value: join(device.vendor, device.model, device.type && `(${device.type})`) },
        { key: 'cpu', label: 'CPU', value: join(cpu.architecture) },
      ],
    };
  },
});
