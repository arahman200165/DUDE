#!/usr/bin/env bash
# Regenerates the Phase 28 loopback TLS test PKI (electron/*.spec.ts). Run from this folder:
#   bash generate.sh
# Test-only keys: never trusted outside the specs, which inject root.pem as a trust store.
set -euo pipefail
cd "$(dirname "$0")"
rm -f *.pem *.srl *.csr *.cnf *.p12
days=7300

cat > ca.cnf <<'CNF'
[req]
distinguished_name=dn
[dn]
[v3_ca]
basicConstraints=critical,CA:TRUE
keyUsage=critical,keyCertSign,cRLSign
subjectKeyIdentifier=hash
[v3_int]
basicConstraints=critical,CA:TRUE,pathlen:0
keyUsage=critical,keyCertSign,cRLSign
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid
authorityInfoAccess=caIssuers;URI:http://127.0.0.1:1/root.der
[v3_leaf]
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:localhost,DNS:*.dude.test,IP:127.0.0.1
authorityInfoAccess=OCSP;URI:http://127.0.0.1:1/ocsp,caIssuers;URI:http://127.0.0.1:1/int.der
crlDistributionPoints=URI:http://127.0.0.1:1/int.crl
[v3_client]
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature
extendedKeyUsage=clientAuth
CNF

openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout root-key.pem -out root.pem -days $days -subj "/CN=DUDE Test Root" -extensions v3_ca -config ca.cnf
openssl req -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout int-key.pem -out int.csr -subj "/CN=DUDE Test Intermediate"
openssl x509 -req -in int.csr -CA root.pem -CAkey root-key.pem -CAcreateserial -out int.pem -days $days -extfile ca.cnf -extensions v3_int
openssl req -newkey rsa:2048 -nodes -keyout leaf-key.pem -out leaf.csr -subj "/CN=localhost"
openssl x509 -req -in leaf.csr -CA int.pem -CAkey int-key.pem -CAcreateserial -out leaf.pem -days $days -extfile ca.cnf -extensions v3_leaf
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout self-key.pem -out self.pem -days $days -subj "/CN=self.dude.test" -addext "subjectAltName=DNS:self.dude.test"
openssl req -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout client-key.pem -out client.csr -subj "/CN=DUDE Test Client"
openssl x509 -req -in client.csr -CA int.pem -CAkey int-key.pem -CAcreateserial -out client.pem -days $days -extfile ca.cnf -extensions v3_client
openssl pkcs12 -export -inkey client-key.pem -in client.pem -out client.p12 -passout pass:dude -keypbe AES-256-CBC -certpbe AES-256-CBC -macalg sha256
rm -f *.csr *.srl
