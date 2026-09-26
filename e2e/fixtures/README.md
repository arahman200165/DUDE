# Browser fixtures

`barcode-reader-known-content.png` is a QR Code Model 2 image generated independently of DUDE's reader with the repository's `qrcode` 1.5.4 package:

```js
await QRCode.toFile(
  'e2e/fixtures/barcode-reader-known-content.png',
  'DUDE barcode reader fixture v1: https://example.test/scan?id=42',
  { errorCorrectionLevel: 'H', margin: 4, scale: 8, type: 'png' },
);
```

The literal passed to the encoder is the expected decoded content asserted by `barcode-reader.spec.ts`. The fixture is uploaded through the app's file input in Chromium so `@zxing/library`'s browser image decode path runs.
