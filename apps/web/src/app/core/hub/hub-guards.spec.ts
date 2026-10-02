import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { PlatformService } from '../platform/platform.service';
import type { HostKind } from '../platform/host-kind';
import { hubRoutes } from '../routing/hub.routes';
import { createUnavailableHubAdmin } from './unavailable-hub-admin.adapter';
import { HubAdminError, HubAdminPort } from './hub-admin.port';
import { HUB_ADMIN } from './hub-admin.token';
import { hubSessionGuard, hubWebOnlyMatch } from './hub-guards';

function configure(host: HostKind, admin: Partial<HubAdminPort> = {}) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: PlatformService, useValue: { hostKind: host, isDesktop: () => host === 'desktop' } },
      { provide: HUB_ADMIN, useValue: { ...createUnavailableHubAdmin(), ...admin } },
    ],
  });
}

const run = (url: string) => TestBed.runInInjectionContext(() => hubSessionGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot)) as Promise<boolean | UrlTree>;

const unauthorized = () => Promise.reject(new HubAdminError('unauthorized', 'Sign in.'));
const probe = (bootstrapped: boolean | null) => () => Promise.resolve({ found: true, port: 1, hubInstanceId: 'h', hubVersion: '0', bootstrapped });

describe('hubWebOnlyMatch', () => {
  it.each([
    ['desktop', false],
    ['web-standalone', false],
    ['hub-web', true],
  ] as const)('%s -> %s', (host, expected) => {
    configure(host);
    expect(TestBed.runInInjectionContext(() => hubWebOnlyMatch({} as never, [], {} as never))).toBe(expected);
  });
});

describe('hubSessionGuard', () => {
  it('lets every non-hub host straight through without touching the Hub', async () => {
    const spy = vi.fn();
    configure('web-standalone', { probeLocal: spy, currentSession: spy });
    expect(await run('/')).toBe(true);
    TestBed.resetTestingModule();
    configure('desktop', { probeLocal: spy, currentSession: spy });
    expect(await run('/settings/general')).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('allows the /hub/* pages themselves', async () => {
    configure('hub-web', { probeLocal: probe(true), currentSession: unauthorized });
    expect(await run('/hub/sign-in')).toBe(true);
  });

  it('redirects to /hub/setup when the Hub is not bootstrapped', async () => {
    configure('hub-web', { probeLocal: probe(false), currentSession: unauthorized });
    expect(TestBed.inject(Router).serializeUrl((await run('/')) as UrlTree)).toBe('/hub/setup');
  });

  it('redirects to /hub/sign-in, remembering the destination, when unauthorized', async () => {
    configure('hub-web', { probeLocal: probe(true), currentSession: unauthorized });
    const router = TestBed.inject(Router);
    expect(router.serializeUrl((await run('/')) as UrlTree)).toBe('/hub/sign-in');
    expect(router.serializeUrl((await run('/settings/devices')) as UrlTree)).toBe('/hub/sign-in?returnUrl=%2Fsettings%2Fdevices');
  });

  it('lets a signed-in owner through, and does not lock the app on a transient failure', async () => {
    configure('hub-web', { probeLocal: probe(true), currentSession: () => Promise.resolve({} as never) });
    expect(await run('/')).toBe(true);
    TestBed.resetTestingModule();
    configure('hub-web', {
      probeLocal: () => Promise.reject(new HubAdminError('network', 'offline')),
      currentSession: () => Promise.reject(new HubAdminError('network', 'offline')),
    });
    expect(await run('/')).toBe(true);
  });
});

describe('Hub entry routes', () => {
  @Component({ template: 'home' })
  class Home {}

  async function navigate(host: HostKind, url: string): Promise<string> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([...hubRoutes, { path: '**', component: Home }]),
        { provide: PlatformService, useValue: { hostKind: host, isDesktop: () => host === 'desktop' } },
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    await harness.fixture.whenStable();
    return harness.routeNativeElement?.textContent ?? '';
  }

  it('renders /hub/* only on hub-web', async () => {
    expect(await navigate('hub-web', '/hub/sign-in')).toContain('Hub sign-in');
  });

  it.each(['web-standalone', 'desktop'] as const)('does not match /hub/* on %s', async (host) => {
    expect(await navigate(host, '/hub/sign-in')).toBe('home');
  });
});
