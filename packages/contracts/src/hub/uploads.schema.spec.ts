import { describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { HUB_AUDIT_EVENTS } from './audit.js';
import { HUB_ERROR_CODES } from './error.schema.js';
import {
  UPLOAD_BODY_LIMIT, UPLOAD_CHUNK_SIZE_DEFAULT, UPLOAD_CHUNK_SIZE_MAX, UPLOAD_CHUNK_SIZE_MIN, UPLOAD_MAX_DECLARED_SIZE, UPLOAD_STATES, UploadChunkResponse, UploadCompleteResponse,
  UploadCreateRequest, UploadSession, negotiateUploadChunkSize, uploadChunkCount, uploadChunkLength, uploadChunkPath, uploadCompletePath, uploadPath,
} from './uploads.schema.js';

const MIB = 1024 * 1024;
const sha = 'a'.repeat(64);

describe('upload contracts', () => {
  it('uses 8 MiB chunks by default, negotiable inside 1 to 32 MiB, with a body limit just above the largest', () => {
    expect(UPLOAD_CHUNK_SIZE_DEFAULT).toBe(8 * MIB);
    expect(negotiateUploadChunkSize(undefined)).toBe(8 * MIB);
    expect(negotiateUploadChunkSize(1)).toBe(UPLOAD_CHUNK_SIZE_MIN);
    expect(negotiateUploadChunkSize(2 ** 31)).toBe(UPLOAD_CHUNK_SIZE_MAX);
    expect(negotiateUploadChunkSize(3 * MIB)).toBe(3 * MIB);
    expect(UPLOAD_BODY_LIMIT).toBeGreaterThan(UPLOAD_CHUNK_SIZE_MAX);
    expect(UPLOAD_CHUNK_SIZE_MAX).toBeLessThan(100 * MIB); // Cloudflare's documented lower-plan request-body limit
  });

  it('splits a file into full chunks plus a remainder', () => {
    expect(uploadChunkCount(40 * MIB, 8 * MIB)).toBe(5);
    expect(uploadChunkCount(40 * MIB + 1, 8 * MIB)).toBe(6);
    expect(uploadChunkLength(40 * MIB + 1, 8 * MIB, 5)).toBe(1);
    expect(uploadChunkLength(40 * MIB + 1, 8 * MIB, 4)).toBe(8 * MIB);
    expect(uploadChunkLength(5, 8 * MIB, 0)).toBe(5);
  });

  it('validates a create request strictly', () => {
    expect(Value.Check(UploadCreateRequest, { size: 1 })).toBe(true);
    expect(Value.Check(UploadCreateRequest, { size: 5, sha256: sha, chunkSize: MIB, mime: 'text/plain', name: 'a.txt' })).toBe(true);
    for (const bad of [{ size: 0 }, { size: UPLOAD_MAX_DECLARED_SIZE + 1 }, { size: 1.5 }, { size: 1, sha256: 'A'.repeat(64) }, { size: 1, name: 'x'.repeat(256) }, { size: 1, extra: 1 }, {}]) {
      expect(Value.Check(UploadCreateRequest, bad)).toBe(false);
    }
  });

  it('describes the session, the chunk answer and the completion', () => {
    const session = {
      uploadId: 'u', state: 'open', size: 1, sha256: null, chunkSize: MIB, chunkCount: 1, received: [[0, 0]], receivedChunks: 1, receivedBytes: 1,
      createdAt: 't', expiresAt: 't', mime: null, name: null, blob: null, failure: null,
    };
    expect(Value.Check(UploadSession, session)).toBe(true);
    expect(Value.Check(UploadSession, { ...session, state: 'weird' })).toBe(false);
    expect(Value.Check(UploadSession, { ...session, received: [[0]] })).toBe(false);
    expect([...UPLOAD_STATES]).toEqual(['open', 'completing', 'complete', 'failed', 'aborted', 'expired']);
    expect(Value.Check(UploadChunkResponse, { uploadId: 'u', index: 0, size: 1, sha256: sha, duplicate: false, receivedChunks: 1, receivedBytes: 1, expiresAt: 't' })).toBe(true);
    expect(Value.Check(UploadCompleteResponse, { uploadId: 'u', state: 'complete', sha256: sha, size: 1, blobRef: 'upload:u', expiresAt: 't' })).toBe(true);
    expect(Value.Check(UploadCompleteResponse, { uploadId: 'u', state: 'completing', sha256: sha, size: 1, blobRef: 'upload:u', expiresAt: 't' })).toBe(false);
  });

  it('builds the paths, adds the closed audit events and the storage-full error code', () => {
    expect(uploadPath('a b')).toBe('/api/v1/uploads/a%20b');
    expect(uploadChunkPath('u', 3)).toBe('/api/v1/uploads/u/chunks/3');
    expect(uploadCompletePath('u')).toBe('/api/v1/uploads/u/complete');
    for (const event of ['upload.created', 'upload.completed', 'upload.aborted', 'upload.failed', 'upload.expired']) expect(HUB_AUDIT_EVENTS as readonly string[]).toContain(event);
    expect(HUB_ERROR_CODES).toContain('storage-full');
  });
});
