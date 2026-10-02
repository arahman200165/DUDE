# Independent image fixture

`golden-rgb.png` is a valid 37 × 23 RGB PNG generated with Pillow 12.3.0 (Python 3.13.14),
independently of the image metadata inspector. It contains a `Title` text chunk with the value
`Golden corpus sample`; Pillow reopened the saved file and confirmed PNG format, dimensions,
RGB mode, and title. The parser golden test asserts the PNG IHDR dimensions, 8-bit depth, RGB
color type, and non-interlaced flag. This development-time fixture is not included in the app's
asset globs.

Generation and independent check:

```py
from PIL import Image, PngImagePlugin

image = Image.new('RGB', (37, 23))
pixels = image.load()
for y in range(23):
    for x in range(37):
        pixels[x, y] = ((x * 7) % 256, (y * 11) % 256, ((x + y) * 5) % 256)
metadata = PngImagePlugin.PngInfo()
metadata.add_text('Title', 'Golden corpus sample')
image.save('golden-rgb.png', format='PNG', pnginfo=metadata, optimize=False)

with Image.open('golden-rgb.png') as check:
    assert (check.format, check.size, check.mode, check.info['Title']) == (
        'PNG', (37, 23), 'RGB', 'Golden corpus sample')
```

SHA-256: `ae810666ece2acd3b59feafeec9c61ddc5da2b9e2dc80198a23a690115873c0d`.
