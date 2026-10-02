# @dude/api-client

Portable client for the DUDE Hub REST API (`/api/v1`). It runs over an injected `HubTransport` port (no `fetch` or Node built-ins here), validates every response with TypeBox `Value.Check` against the `@dude/contracts/hub` schemas, maps error envelopes to `HubApiError`, and reports schema violations as `HubProtocolError`. Protocol compatibility is decided by integer `protocolVersion`/`minClientProtocol`, never app version.
