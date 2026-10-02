import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { UserScriptStoreService } from './user-script-store.service';
import { createUserScript } from "@dude/domain/core/pipeline/pipeline.model";

describe('UserScriptStoreService', () => {
  let service: UserScriptStoreService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(UserScriptStoreService);
  });

  it('starts empty', () => {
    expect(service.scripts()).toEqual([]);
  });

  it('saves and retrieves a script by id', () => {
    const script = createUserScript('My Script');
    service.save(script);
    expect(service.getById(script.id)?.name).toBe('My Script');
  });

  it('upserts on save with a matching id', () => {
    const script = createUserScript('Original');
    service.save(script);
    service.save({ ...script, name: 'Renamed' });
    expect(service.scripts()).toHaveLength(1);
    expect(service.getById(script.id)?.name).toBe('Renamed');
  });

  it('removes a script by id', () => {
    const script = createUserScript('Doomed');
    service.save(script);
    service.remove(script.id);
    expect(service.getById(script.id)).toBeUndefined();
  });
});
