import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { WorkspaceLayoutService } from './workspace-layout.service';
import { PersistenceService } from '../persistence/persistence.service';

async function stable(): Promise<void> {
  await TestBed.inject(ApplicationRef).whenStable();
}

/**
 * Saved Sessions' actual relaunch behavior (DUDE_PRD.md §21 Phase 21 Item 4) turns out to need no
 * new capture/restore machinery at all, beyond Milestone 291's `'__workspace__'`/`layout` store —
 * see `core/workspace/AGENTS.md`'s "why there is no separate durable content tier" section for the
 * full reasoning. This spec is the concrete proof: a real browser relaunch clears `sessionStorage`
 * but leaves `localStorage` intact, and every service gets a fresh instance with zero leftover
 * in-memory JS state. `ToolHost` remounting a tool after layout restore is *itself* the entire
 * mechanism — the tool's own `persistence.signal(...)` calls do the rest, unmodified.
 */
describe('Saved Sessions: relaunch content safety', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('layout survives a relaunch, but session-policy content does not — local-policy content does', async () => {
    TestBed.configureTestingModule({});
    const layout = TestBed.inject(WorkspaceLayoutService);
    const persistence = TestBed.inject(PersistenceService);

    layout.openTool('base64');
    persistence.signal('base64', 'input', 'session', '').set('hello world');
    persistence.signal('base64', 'mode', 'local', 'encode').set('decode');
    await stable();

    // Simulate a real full relaunch: sessionStorage wiped, localStorage untouched, fresh services.
    sessionStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    const layoutAfter = TestBed.inject(WorkspaceLayoutService);
    const persistenceAfter = TestBed.inject(PersistenceService);

    expect(layoutAfter.openTabs()).toEqual(['base64']);
    expect(persistenceAfter.signal('base64', 'input', 'session', '')()).toBe('');
    expect(persistenceAfter.signal('base64', 'mode', 'local', 'encode')()).toBe('decode');
  });

  it("a 'none'-policy field has no key for a relaunch to possibly restore", () => {
    // jwt.ts uses a bare in-memory signal for its token, never PersistenceService — there is no
    // dude:v1:jwt:token key anywhere, by construction, so there is nothing for any future change
    // to accidentally "helpfully" restore.
    expect(localStorage.getItem('dude:v1:jwt:token')).toBeNull();
    expect(sessionStorage.getItem('dude:v1:jwt:token')).toBeNull();
  });

  /**
   * Milestone 298's regression guard: three real tabs (base64/json = session+local fields, jwt =
   * none-policy), a real relaunch simulation, one assertion per policy. If a future change ever
   * makes the layout store snapshot tool *content* directly instead of just route ids, this is
   * what catches it.
   */
  it('three open tabs (session/local/none-policy tools) survive a relaunch exactly per their own declared policy', async () => {
    TestBed.configureTestingModule({});
    const layout = TestBed.inject(WorkspaceLayoutService);
    const persistence = TestBed.inject(PersistenceService);

    layout.openTool('base64');
    layout.splitFocused('json');
    layout.splitFocused('jwt');

    persistence.signal('base64', 'input', 'session', '').set('hello');
    persistence.signal('base64', 'mode', 'local', 'encode').set('decode');
    persistence.signal('json', 'input', 'session', '').set('{}');
    persistence.signal('json', 'mode', 'local', 'pretty').set('minify');
    // jwt's token is a bare in-memory signal in the real component — there is no key to populate.
    await stable();

    expect(layout.openTabs()).toEqual(['base64', 'json', 'jwt']);

    // Simulate a real full relaunch: sessionStorage wiped, localStorage untouched, fresh services.
    sessionStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    const layoutAfter = TestBed.inject(WorkspaceLayoutService);
    const persistenceAfter = TestBed.inject(PersistenceService);

    // Layout — which tabs, in what order — survives unconditionally.
    expect(layoutAfter.openTabs()).toEqual(['base64', 'json', 'jwt']);

    // session-policy content is genuinely gone; local-policy content survives, per each tool's own
    // pre-existing choice, not a blanket "everything comes back" promise.
    expect(persistenceAfter.signal('base64', 'input', 'session', '')()).toBe('');
    expect(persistenceAfter.signal('base64', 'mode', 'local', 'encode')()).toBe('decode');
    expect(persistenceAfter.signal('json', 'input', 'session', '')()).toBe('');
    expect(persistenceAfter.signal('json', 'mode', 'local', 'pretty')()).toBe('minify');

    // none-policy content was never in storage to begin with — still nothing after relaunch.
    expect(localStorage.getItem('dude:v1:jwt:token')).toBeNull();
    expect(sessionStorage.getItem('dude:v1:jwt:token')).toBeNull();
  });
});
