import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { NativeRecentsService } from './native-recents.service';

/**
 * DUDE_PRD.md §21 Phase 25 Item 5 -- mirrors `core/usage/phase24-privacy-audit.spec.ts`'s "checked,
 * not just documented" pattern: the persisted `'__native-recents__'` store is walked against an
 * explicit key allow-list derived directly from `NativeRecentEntry`'s own TypeScript interface, so an
 * accidental future `record({...entry, text: item.text})` fails this test immediately rather than
 * only being caught by a code review reading the type definition.
 */

async function readStore(key: string): Promise<unknown> {
  await TestBed.inject(ApplicationRef).whenStable();
  const raw = localStorage.getItem(key);
  expect(raw, `expected ${key} to have been written`).not.toBeNull();
  return JSON.parse(raw!);
}

function assertOnlyKeys(value: unknown, allowedKeys: readonly string[], path = '$'): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertOnlyKeys(item, allowedKeys, `${path}[${i}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const key of Object.keys(value)) {
    expect(allowedKeys, `unexpected key "${key}" at ${path} -- only ${JSON.stringify(allowedKeys)} are allowed`).toContain(key);
  }
}

describe("Phase 25 Item 5 -- '__native-recents__' never carries file content", () => {
  let service: NativeRecentsService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(NativeRecentsService);
  });

  it("'entries' only ever has the NativeRecentEntry shape -- schemaVersion, entries[].{path,name,extension,openedAt}", async () => {
    service.record({ path: 'C:/notes.md', name: 'notes.md', extension: '.md', openedAt: '2026-01-01T00:00:00.000Z' });

    const store = (await readStore('dude:v1:__native-recents__:entries')) as { entries: readonly unknown[] };
    assertOnlyKeys(store, ['schemaVersion', 'entries']);
    assertOnlyKeys(store.entries, ['path', 'name', 'extension', 'openedAt']);
  });

  it("'enabled' is ever only a bare boolean -- never wrapped with additional fields", async () => {
    service.enabled.set(false);

    const raw = await readStore('dude:v1:__native-recents__:enabled');
    expect(typeof raw).toBe('boolean');
  });
});
