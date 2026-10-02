import { WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { ToolShell } from './tool-shell';
import { ConnectivityService } from '../../../core/connectivity/connectivity.service';
import { TOOL_DEFINITIONS } from '../../../core/registry/tool-definitions';

class FakeConnectivityService {
  readonly online: WritableSignal<boolean> = signal(true);
}

class FakeRouter {
  url = '/tools/demo';
}

describe('ToolShell', () => {
  let online: WritableSignal<boolean>;
  let router: FakeRouter;

  beforeEach(() => {
    const fakeConnectivity = new FakeConnectivityService();
    online = fakeConnectivity.online;
    router = new FakeRouter();

    TestBed.configureTestingModule({
      providers: [
        { provide: ConnectivityService, useValue: fakeConnectivity },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: {} },
      ],
    });
  });

  // '/tools/demo' resolves to no real ToolDefinition, so definition() is undefined and
  // effectiveNetworkRequired() falls back entirely to the explicit override — exactly the
  // escape-hatch path a handful of tools (jwt-verify, text-inspector, ...) rely on for a
  // genuinely dynamic network need.
  function createComponent(networkRequired: boolean) {
    const fixture = TestBed.createComponent(ToolShell);
    fixture.componentRef.setInput('networkRequired', networkRequired);
    fixture.detectChanges();
    return fixture;
  }

  it('hides the offline badge when the tool has no network requirement, even while offline', () => {
    online.set(false);
    const fixture = createComponent(false);

    expect(fixture.nativeElement.textContent).not.toContain('Offline');
  });

  it('hides the offline badge when the tool requires network but the app is online', () => {
    online.set(true);
    const fixture = createComponent(true);

    expect(fixture.nativeElement.textContent).not.toContain('Offline');
  });

  it('shows the offline badge when the tool requires network and the app is offline', () => {
    online.set(false);
    const fixture = createComponent(true);

    expect(fixture.nativeElement.textContent).toContain('Offline');
  });

  it('resolves title, status, and network requirement from the registry with no explicit inputs', () => {
    // DUDE_PRD.md §21 Phase 22 Items 2/6 — ToolShell is the single source of truth; a tool
    // mounted at its real route needs zero title/status/networkRequired inputs.
    const definition = TOOL_DEFINITIONS.find((tool) => tool.id === 'base64')!;
    router.url = definition.route;

    const fixture = TestBed.createComponent(ToolShell);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(definition.title);
    expect(fixture.nativeElement.textContent).toContain(definition.status);
  });
});
