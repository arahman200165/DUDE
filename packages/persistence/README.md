# @dude/persistence

Portable persistence foundation (Phase 31B): UUIDv7 ids, device and environment records, setting definitions and scope rules, entity codec interface, async repository ports, secret references, and in-memory adapters with host-neutral repository contract suites (`@dude/persistence/testing`).

Depends only on `@dude/domain` and `@dude/shared-types`. It uses no host globals (randomness and clocks are injected) and no storage engine; SQLite and browser adapters live in applications.
