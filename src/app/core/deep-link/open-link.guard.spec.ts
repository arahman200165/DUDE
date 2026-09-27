import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, convertToParamMap } from '@angular/router';
import { DeepLinkService } from './deep-link.service';
import { openLinkGuard } from './open-link.guard';

describe('openLinkGuard (web+dude:// protocol handler)', () => {
  let accepted: string[];

  function run(u: string | null): UrlTree {
    const route = { queryParamMap: convertToParamMap(u === null ? {} : { u }) } as ActivatedRouteSnapshot;
    return TestBed.runInInjectionContext(() => openLinkGuard(route, {} as RouterStateSnapshot)) as UrlTree;
  }

  beforeEach(() => {
    accepted = [];
    TestBed.configureTestingModule({ providers: [{ provide: DeepLinkService, useValue: { accept: (raw: string) => accepted.push(raw) } }] });
  });

  it('rewrites web+dude:// to dude:// and hands it to the strict deep-link pipeline', () => {
    const tree = run('web+dude://open/tool/json');
    expect(accepted).toEqual(['dude://open/tool/json']);
    expect(TestBed.inject(Router).serializeUrl(tree)).toBe('/');
  });

  it('ignores anything that is not a dude link', () => {
    run('https://evil.example/');
    run('javascript:alert(1)');
    run(null);
    expect(accepted).toEqual([]);
  });
});
