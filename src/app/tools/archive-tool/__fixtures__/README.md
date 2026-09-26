# Independent archive fixtures

`independent.zip` and `independent.tar` are small development-time golden fixtures. Python
3.13.14's standard-library `zipfile` and `tarfile` modules wrote them independently of DUDE's
`fflate` ZIP implementation and USTAR parser. They contain the same two regular files:

| Path | UTF-8 contents |
| --- | --- |
| `README.txt` | `Independent archive corpus\n` |
| `docs/hello.txt` | `Hello from a Python-created ZIP and TAR fixture.\n` |

The archive-tool golden spec extracts each fixture and compares both paths and exact contents.
The source bytes were independently checked by reopening them with Python's `zipfile` and
`tarfile` modules. These files live outside Angular's asset globs and are test-only.

Generated with:

```py
from io import BytesIO
from tarfile import open as tar_open, TarInfo, USTAR_FORMAT
from zipfile import ZipFile, ZIP_DEFLATED

# `entries` maps the two paths above to their UTF-8 encoded contents.
with ZipFile('independent.zip', 'w', compression=ZIP_DEFLATED) as archive:
    for path, data in entries.items():
        archive.writestr(path, data)
with tar_open('independent.tar', 'w', format=USTAR_FORMAT) as archive:
    for path, data in entries.items():
        info = TarInfo(path)
        info.size = len(data)
        info.mode = 0o644
        archive.addfile(info, BytesIO(data))
```

SHA-256: `independent.zip` `f0c3d81e0fa9c75fd0bb44bf81de671bdfe4d50610730206600239533b1180c3`;
`independent.tar` `0f0a3a2729ee5de973533c114e633c3b6671506d8e26e001cec9538dc0c2617a`.
