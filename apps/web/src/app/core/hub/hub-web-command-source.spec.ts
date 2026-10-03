import { TestBed } from '@angular/core/testing';
import type { DesktopHubStatus } from '@dude/contracts/shared/models/platform-bridge.model';
import { PlatformService } from '../platform/platform.service';
import { HUB_ADMIN } from './hub-admin.token';
import type { HubAdminPort } from './hub-admin.port';
import { HubWebCommandSource } from './hub-web-command-source';

const status = (enrollmentState: DesktopHubStatus['enrollmentState']): DesktopHubStatus => ({
  enrollmentState, hubUrl: enrollmentState === 'enrolled' ? 'https://hub.local:47600' : null, environmentId: null, hubInstanceId: null, hubVersion: null, reachable: null,
});

async function create(hostKind: 'desktop' | 'web-standalone' | 'hub-web', enrollment: DesktopHubStatus['enrollmentState'], withOpenWeb = true) {
  const openWeb = vi.fn(async () => ({ ok: true as const }));
  let push: ((s: DesktopHubStatus) => void) | undefined;
  const port = {
    status: async () => status(enrollment),
    onStatusChanged: (cb: (s: DesktopHubStatus) => void) => { push = cb; return () => undefined; },
    ...(withOpenWeb ? { openWeb } : {}),
  } as unknown as HubAdminPort;
  TestBed.configureTestingModule({
    providers: [HubWebCommandSource, { provide: HUB_ADMIN, useValue: port }, { provide: PlatformService, useValue: { hostKind } }],
  });
  const source = TestBed.inject(HubWebCommandSource);
  await new Promise<void>((resolve) => setTimeout(resolve));
  return { source, openWeb, push: (s: DesktopHubStatus) => push?.(s) };
}

describe('HubWebCommandSource', () => {
  it('offers "Open Hub web" on desktop when enrolled, and running it calls the host with no URL', async () => {
    const { source, openWeb } = await create('desktop', 'enrolled');
    const commands = source.commands();
    expect(commands.map((c) => c.title)).toEqual(['Open Hub web']);
    await commands[0]!.execute();
    expect(openWeb).toHaveBeenCalledExactlyOnceWith();
  });

  it('offers nothing when standalone, revoked, on the web hosts or without host support', async () => {
    expect((await create('desktop', 'standalone')).source.commands()).toEqual([]);
    TestBed.resetTestingModule();
    expect((await create('desktop', 'revoked')).source.commands()).toEqual([]);
    TestBed.resetTestingModule();
    expect((await create('web-standalone', 'enrolled')).source.commands()).toEqual([]);
    TestBed.resetTestingModule();
    expect((await create('hub-web', 'enrolled')).source.commands()).toEqual([]);
    TestBed.resetTestingModule();
    expect((await create('desktop', 'enrolled', false)).source.commands()).toEqual([]);
  });

  it('follows enrollment changes pushed by the host', async () => {
    const { source, push } = await create('desktop', 'standalone');
    expect(source.commands()).toEqual([]);
    push(status('enrolled'));
    expect(source.commands()).toHaveLength(1);
    push(status('standalone'));
    expect(source.commands()).toEqual([]);
  });
});
