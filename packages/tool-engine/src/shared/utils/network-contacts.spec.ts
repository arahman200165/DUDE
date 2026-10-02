import { chainToPemBundle, derBase64ToPem, describeContacts, needsReview } from "./network-contacts.js";

describe('describeContacts', () => {
  it('names the resolver a DNS check will reach', () => {
    expect(describeContacts({ kind: 'dns-lookup', target: 'example.com' })).toEqual(['your system DNS servers']);
    expect(describeContacts({ kind: 'dns-lookup', target: 'example.com', resolverTransport: 'doh' })[0]).toContain('cloudflare-dns.com');
    expect(describeContacts({ kind: 'dns-lookup', target: 'example.com', resolverTransport: 'dot', resolver: 'dns.quad9.net' })).toEqual(['DoT dns.quad9.net']);
  });
  it('lists every comparator resolver', () => {
    const contacts = describeContacts({ kind: 'dns-propagation', target: 'x', includeSystem: true, resolvers: [{ label: 'Lab', server: '10.0.0.53', transport: 'classic' }] });
    expect(contacts).toEqual(['Cloudflare 1.1.1.1', 'Google 8.8.8.8', 'Quad9 9.9.9.9', 'your system DNS servers', 'Lab: DNS server 10.0.0.53']);
  });
  it('shows host, port, and SNI for TLS checks, and CA hosts for revocation', () => {
    expect(describeContacts({ kind: 'tls-inspector', target: 'example.com', port: 8443, sni: 'api.example.com' })).toEqual(['example.com:8443 (SNI api.example.com)']);
    expect(describeContacts({ kind: 'revocation', target: 'x', urls: ['http://ocsp.example.net/'] })).toEqual(['ocsp.example.net (http://ocsp.example.net/)']);
    expect(describeContacts({ kind: 'ct-lookup', target: 'example.com' })[0]).toContain('crt.sh');
    expect(describeContacts(null)).toEqual([]);
  });
});

describe('needsReview', () => {
  it('matches the main-process confirmation boundary', () => {
    expect(needsReview({ kind: 'tls-enumeration', target: 'x' })).toBe(true);
    expect(needsReview({ kind: 'https-analyzer', target: 'x' })).toBe(true);
    expect(needsReview({ kind: 'tls-capture', target: 'x' })).toBe(true);
    expect(needsReview({ kind: 'email-auth', target: 'x', dkimCommonProbe: true })).toBe(true);
    expect(needsReview({ kind: 'email-auth', target: 'x' })).toBe(false);
    expect(needsReview({ kind: 'tls-inspector', target: 'x' })).toBe(false);
  });
});

describe('PEM helpers', () => {
  it('wraps DER at 64 columns', () => {
    const pem = derBase64ToPem('A'.repeat(70));
    expect(pem.split('\n')[1]).toHaveLength(64);
    expect(chainToPemBundle([{ derBase64: 'AAAA' }, { derBase64: 'BBBB' }]).match(/BEGIN CERTIFICATE/g)).toHaveLength(2);
  });
});
