import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { faker } from '@faker-js/faker';
import { resolve } from 'node:path';
import { TOOL_DEFINITIONS } from '../registry/tool-definitions';
import { loadPipelineStep } from '../pipeline/pipeline-step-loader';
import { fakeElectronBridge } from '../platform/testing/fake-electron-bridge';
import { PlatformService } from '../platform/platform.service';
import type { PipelineStep, PipelineValue } from '../../shared/models/pipeline-step.model';

interface ParityFixture {
  readonly input: PipelineValue;
  readonly expected?: PipelineValue;
}

const toolRoot = resolve(process.cwd(), 'src/app/tools');
// Filesystem discovery makes a newly added pipeline step part of this suite automatically.
const stepIds = readdirSync(toolRoot).filter((id) => existsSync(resolve(toolRoot, id, `${id}.pipeline-step.ts`)));

// Each exclusion lives beside the tool it documents; core never maintains tool ids.
const DOCUMENTED_EXCLUSIONS: Readonly<Record<string, string>> = Object.fromEntries(
  readdirSync(toolRoot)
    .filter((id) => existsSync(resolve(toolRoot, id, `${id}.parity-exclusion.json`)))
    .map((id) => [id, JSON.parse(readFileSync(resolve(toolRoot, id, `${id}.parity-exclusion.json`), 'utf8')).reason as string]),
);

function defaultFixture(step: PipelineStep): ParityFixture {
  const samples: Record<PipelineValue['type'], PipelineValue> = {
    text: { type: 'text', value: 'Hello, DUDE!\nsecond line' },
    json: { type: 'json', value: { message: 'Hello, DUDE!', count: 2 } },
    bytes: { type: 'bytes', value: 'SGVsbG8sIERVREUh' },
    file: { type: 'file', value: { name: 'sample.txt', mimeType: 'text/plain', base64: 'SGVsbG8sIERVREUh' } },
    table: { type: 'table', value: { columns: ['name', 'count'], rows: [['DUDE', 2]] } },
    url: { type: 'url', value: 'https://example.com/path?x=1' },
    'http-response': { type: 'http-response', value: { status: 200, statusText: 'OK', headers: [], body: { type: 'text', value: 'hello' } } },
  };
  return { input: samples[step.accepts[0]] };
}

async function inPlatform<T>(desktop: boolean, run: () => Promise<T>): Promise<T> {
  if (desktop) Object.defineProperty(window, 'dude', { configurable: true, value: fakeElectronBridge() });
  else Reflect.deleteProperty(window, 'dude');
  try {
    expect(new PlatformService().isDesktop()).toBe(desktop);
    faker.seed(260);
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    vi.spyOn(Math, 'random').mockReturnValue(0.375);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('12345678-1234-4123-8123-123456789abc');
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 37 + 19) % 256;
      return array;
    });
    return await run();
  } finally {
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, 'dude');
  }
}

describe('registry-wide web/desktop pipeline parity', () => {
  it('covers every pipeline step and keeps exclusions honest', () => {
    const registered = new Set(TOOL_DEFINITIONS.map((tool) => tool.id));
    expect(stepIds.length).toBeGreaterThan(0);
    for (const id of stepIds) expect(registered.has(id), `${id} has no registered tool`).toBe(true);
    for (const [id, reason] of Object.entries(DOCUMENTED_EXCLUSIONS)) {
      expect(stepIds, `${id} exclusion is stale`).toContain(id);
      expect(reason.length).toBeGreaterThan(20);
    }
    for (const id of readdirSync(toolRoot)) {
      if (existsSync(resolve(toolRoot, id, `${id}.parity-fixtures.ts`))) expect(stepIds).toContain(id);
    }
    for (const tool of TOOL_DEFINITIONS) {
      const hasFallback = tool.capabilities?.some((capability) => capability.kind === 'platform' && capability.web === 'fallback');
      if (!hasFallback) continue;
      expect(
        existsSync(resolve(toolRoot, tool.id, `${tool.id}.parity.spec.ts`)),
        `${tool.id} declares a web fallback without an adapter parity case`,
      ).toBe(true);
    }
  });

  for (const id of stepIds) {
    if (DOCUMENTED_EXCLUSIONS[id]) continue;
    it(`${id} returns the same result on web and desktop`, async () => {
      const pipelineStep = await loadPipelineStep(id);
      expect(pipelineStep, `${id} pipeline step failed to load`).toBeDefined();
      if (!pipelineStep) return;
      const fixturePath = resolve(toolRoot, id, `${id}.parity-fixtures.ts`);
      const fixtures: readonly ParityFixture[] = existsSync(fixturePath)
        ? (await import(/* @vite-ignore */ fixturePath) as { fixtures: readonly ParityFixture[] }).fixtures
        : [defaultFixture(pipelineStep)];
      expect(fixtures.length).toBeGreaterThan(0);
      for (const fixture of fixtures) {
        expect(pipelineStep.accepts).toContain(fixture.input.type);
        const web = await inPlatform(false, () => pipelineStep.run(structuredClone(fixture.input)));
        const desktop = await inPlatform(true, () => pipelineStep.run(structuredClone(fixture.input)));
        expect(desktop, `${id}: ${fixture.input.type}`).toEqual(web);
        if (fixture.expected) expect(web).toEqual({ ok: true, output: fixture.expected });
      }
    });
  }
});
