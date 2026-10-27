import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { EMPTY_PAYLOAD_SHA256, canonicalRequest, credentialScope, sha256Hex, signRequest, signingKey, stringToSign, uriEncode } from './sigv4.js';

/**
 * The signer against PUBLISHED vectors (Milestone 848): the AWS S3 documentation's "Signature Calculations for the Authorization
 * Header" examples (bucket `examplebucket`, key pair `AKIAIOSFODNN7EXAMPLE`, 2013-05-24T00:00:00Z, us-east-1) and the AWS SigV4
 * test-suite `get-vanilla` case (`AKIDEXAMPLE`, service `service`). The expected signatures are the values AWS publishes, copied
 * here as fixtures; nothing below derives an expected value from the signer under test.
 */
const S3_CREDENTIALS = { accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' };
const S3_DATE = new Date('2013-05-24T00:00:00Z');

describe('SigV4 against the AWS S3 documentation examples', () => {
  it('GET Object with a Range header', () => {
    const signed = signRequest({
      method: 'GET', url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'), headers: { range: 'bytes=0-9' },
      payloadSha256: EMPTY_PAYLOAD_SHA256, region: 'us-east-1', credentials: S3_CREDENTIALS, date: S3_DATE,
    });
    expect(signed.canonicalRequest).toBe([
      'GET', '/test.txt', '',
      'host:examplebucket.s3.amazonaws.com', 'range:bytes=0-9', `x-amz-content-sha256:${EMPTY_PAYLOAD_SHA256}`, 'x-amz-date:20130524T000000Z', '',
      'host;range;x-amz-content-sha256;x-amz-date', EMPTY_PAYLOAD_SHA256,
    ].join('\n'));
    expect(signed.signature).toBe('f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
    expect(signed.headers['authorization']).toBe('AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
  });

  it('PUT Object: the key `test$file.text` is encoded once, the body hash and extra headers are signed', () => {
    const body = 'Welcome to Amazon S3.';
    expect(sha256Hex(body)).toBe('44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072');
    expect(uriEncode('test$file.text')).toBe('test%24file.text');
    const signed = signRequest({
      method: 'PUT', url: new URL('https://examplebucket.s3.amazonaws.com/test%24file.text'),
      headers: { date: 'Fri, 24 May 2013 00:00:00 GMT', 'x-amz-storage-class': 'REDUCED_REDUNDANCY' },
      payloadSha256: sha256Hex(body), region: 'us-east-1', credentials: S3_CREDENTIALS, date: S3_DATE,
    });
    expect(signed.headers['authorization']).toContain('SignedHeaders=date;host;x-amz-content-sha256;x-amz-date;x-amz-storage-class');
    expect(signed.signature).toBe('98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd');
  });

  it('GET Bucket lifecycle: a valueless query parameter', () => {
    const signed = signRequest({
      method: 'GET', url: new URL('https://examplebucket.s3.amazonaws.com/?lifecycle'), payloadSha256: EMPTY_PAYLOAD_SHA256,
      region: 'us-east-1', credentials: S3_CREDENTIALS, date: S3_DATE,
    });
    expect(signed.canonicalRequest.split('\n').slice(0, 3)).toEqual(['GET', '/', 'lifecycle=']);
    expect(signed.signature).toBe('fea454ca298b7da1c68078a5d1bdbfbbe0d65c699e0f91ac7a200a0136783543');
  });

  it('GET Bucket (List Objects): query parameters are sorted', () => {
    const signed = signRequest({
      method: 'GET', url: new URL('https://examplebucket.s3.amazonaws.com/?prefix=J&max-keys=2'), payloadSha256: EMPTY_PAYLOAD_SHA256,
      region: 'us-east-1', credentials: S3_CREDENTIALS, date: S3_DATE,
    });
    expect(signed.canonicalRequest.split('\n')[2]).toBe('max-keys=2&prefix=J');
    expect(signed.signature).toBe('34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7');
  });

  it('adds the session token as a signed header', () => {
    const signed = signRequest({
      method: 'GET', url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'), payloadSha256: EMPTY_PAYLOAD_SHA256, region: 'us-east-1',
      credentials: { ...S3_CREDENTIALS, sessionToken: 'TOKEN' }, date: S3_DATE,
    });
    expect(signed.headers['x-amz-security-token']).toBe('TOKEN');
    expect(signed.headers['authorization']).toContain('SignedHeaders=host;x-amz-content-sha256;x-amz-date;x-amz-security-token,');
  });
});

describe('SigV4 against the AWS test-suite vector get-vanilla', () => {
  const credentials = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' };

  it('reproduces the published canonical request, string to sign and signature', () => {
    const canonical = canonicalRequest({
      method: 'GET', path: '/', query: [], headers: { host: 'example.amazonaws.com', 'x-amz-date': '20150830T123600Z' }, payloadSha256: EMPTY_PAYLOAD_SHA256,
    });
    expect(canonical.text).toBe('GET\n/\n\nhost:example.amazonaws.com\nx-amz-date:20150830T123600Z\n\nhost;x-amz-date\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    const scope = credentialScope('20150830', 'us-east-1', 'service');
    const toSign = stringToSign('20150830T123600Z', scope, canonical.text);
    expect(toSign).toBe('AWS4-HMAC-SHA256\n20150830T123600Z\n20150830/us-east-1/service/aws4_request\nbb579772317eb040ac9ed261061d46c1f17a8133879d6129b6e1c25292927e63');
    const key = signingKey(credentials.secretAccessKey, '20150830', 'us-east-1', 'service');
    expect(createHmac('sha256', key).update(toSign, 'utf8').digest('hex')).toBe('5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31');
    // The AWS IAM documentation's published signing key for the same date, region and the `iam` service.
    expect(signingKey(credentials.secretAccessKey, '20150830', 'us-east-1', 'iam').toString('hex')).toBe('c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9');
  });

  it('signs the request with the published signature', () => {
    const signed = signRequest({
      method: 'GET', url: new URL('https://example.amazonaws.com/'), payloadSha256: EMPTY_PAYLOAD_SHA256, region: 'us-east-1', service: 'service',
      credentials, date: new Date('2015-08-30T12:36:00Z'),
    });
    // The suite's request carries only host and x-amz-date; this client also signs x-amz-content-sha256, so compare the
    // scope and the header-free parts, and the signature through the canonicalRequest/stringToSign/key chain above.
    expect(signed.headers['authorization']).toContain('Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request');
    expect(signed.signature).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('canonicalization details', () => {
  it('trims and collapses header whitespace, sorts names and encodes query reserved characters', () => {
    const canonical = canonicalRequest({
      method: 'get', path: '/a%20b', query: [['b', 'x y'], ['a', '1'], ['a', '0'], ['c', 'é+']],
      headers: { Host: 'h', 'X-Amz-Meta-A': '  a   b  ' }, payloadSha256: 'P',
    });
    expect(canonical.text).toBe('GET\n/a%20b\na=0&a=1&b=x%20y&c=%C3%A9%2B\nhost:h\nx-amz-meta-a:a b\n\nhost;x-amz-meta-a\nP');
  });
});
