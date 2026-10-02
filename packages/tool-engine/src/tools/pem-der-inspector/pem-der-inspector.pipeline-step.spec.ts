import { describe, expect, it } from 'vitest';
import forge from 'node-forge';
import { pipelineStep } from "./pem-der-inspector.pipeline-step.js";

function samplePkcs8PrivateKeyPem(): string {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 512, workers: -1 });
  const asn1 = forge.pki.privateKeyToAsn1(keys.privateKey);
  const pkcs8Asn1 = forge.pki.wrapRsaPrivateKey(asn1);
  return forge.pki.privateKeyInfoToPem(pkcs8Asn1);
}

describe('pem-der-inspector pipeline step', () => {
  it('parses a PEM text block into a JSON ASN.1 tree', async () => {
    const pem = samplePkcs8PrivateKeyPem();
    const result = await pipelineStep.run({ type: 'text', value: pem });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.output.type).toBe('json');
    const value = result.output.value as { kind: string; blocks: readonly { type: string; derHex: string }[] };
    expect(value.kind).toBe('pem');
    expect(value.blocks).toHaveLength(1);
    expect(value.blocks[0].type).toBe('PRIVATE KEY');
    expect(value.blocks[0].derHex.length).toBeGreaterThan(0);
  });

  it('parses a file value carrying the same PEM text as base64', async () => {
    const pem = samplePkcs8PrivateKeyPem();
    const base64 = btoa(pem);
    const result = await pipelineStep.run({ type: 'file', value: { name: 'key.pem', mimeType: 'application/x-pem-file', base64 } });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect((result.output.value as { kind: string }).kind).toBe('pem');
  });

  it('fails on text with no PEM blocks and invalid hex', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'just some text' });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({
      ok: false,
      error: { message: 'PEM / DER Inspector expects text or file input.', kind: 'invalid-input' },
    });
  });
});
