# Fixtures — SQLite File Viewer

`golden.sqlite` is a real SQLite database file, written by **Python's stdlib `sqlite3` module**
(CPython's bundled, independently-built SQLite C library) — not by `sql.js`, the WASM-compiled
SQLite the tool itself uses to read files. `sqlite-inspect.spec.ts`'s cross-check test parses this
file with `inspectSqlite()` and asserts the exact table/column/row content matches what was written,
so the assertion is a genuine independent cross-check (two separately-built SQLite engines agreeing
on the same on-disk file format) rather than a round-trip through the same engine that wrote it.

Regenerate with:

```sh
python3 - <<'EOF'
import sqlite3, os
path = "apps/web/src/app/tools/sqlite-viewer/__fixtures__/golden.sqlite"
if os.path.exists(path):
    os.remove(path)
conn = sqlite3.connect(path)
cur = conn.cursor()
cur.execute("CREATE TABLE employees (id INTEGER PRIMARY KEY, name TEXT NOT NULL, department TEXT, salary REAL)")
cur.executemany("INSERT INTO employees (id, name, department, salary) VALUES (?, ?, ?, ?)", [
    (1, "Ada Lovelace", "Engineering", 95000.50),
    (2, "Grace Hopper", "Engineering", 98000.0),
    (3, "Margaret Hamilton", None, 91000.25),
])
cur.execute("CREATE TABLE empty_table (note TEXT)")
conn.commit()
conn.close()
EOF
```

Not shipped in the app bundle — dev-time test fixture only (see `ADDING_A_TOOL.md`'s golden-corpus
convention).
