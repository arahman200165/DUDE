import { TestBed } from '@angular/core/testing';
import { ToolDefinition } from '../../shared/models/tool-definition.model';
import { PersistenceService } from './persistence.service';
import { runStorageMigrations } from './storage-migrations';

const definition = (storageMigrations: ToolDefinition['storageMigrations']): ToolDefinition =>
  ({ id: 'new-owner', storageMigrations }) as ToolDefinition;

describe('runStorageMigrations', () => {
  let persistence: PersistenceService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    persistence = TestBed.inject(PersistenceService);
  });

  it('moves a legacy value into the declaring tool namespace and removes the source', () => {
    localStorage.setItem('dude:v1:legacy:relayUrl', JSON.stringify('ws://relay:8080'));

    runStorageMigrations([definition([{ fromNamespace: 'legacy', fromKey: 'relayUrl', toKey: 'relayUrl' }])], persistence);

    expect(localStorage.getItem('dude:v1:new-owner:relayUrl')).toBe(JSON.stringify('ws://relay:8080'));
    expect(localStorage.getItem('dude:v1:legacy:relayUrl')).toBeNull();
  });

  it('never overwrites a value already stored under the new key, but still removes the source', () => {
    localStorage.setItem('dude:v1:legacy:relayUrl', JSON.stringify('old'));
    localStorage.setItem('dude:v1:new-owner:relayUrl', JSON.stringify('new'));

    runStorageMigrations([definition([{ fromNamespace: 'legacy', fromKey: 'relayUrl', toKey: 'relayUrl' }])], persistence);

    expect(localStorage.getItem('dude:v1:new-owner:relayUrl')).toBe(JSON.stringify('new'));
    expect(localStorage.getItem('dude:v1:legacy:relayUrl')).toBeNull();
  });

  it('is a no-op when there is nothing to migrate, and idempotent on re-run', () => {
    const definitions = [definition([{ fromNamespace: 'legacy', fromKey: 'relayUrl', toKey: 'relayUrl' }]), definition(undefined)];

    runStorageMigrations(definitions, persistence);
    runStorageMigrations(definitions, persistence);

    expect(localStorage.length).toBe(0);
  });
});
