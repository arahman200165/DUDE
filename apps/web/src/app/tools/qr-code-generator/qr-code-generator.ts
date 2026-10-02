import { Component, computed, effect, inject, signal } from '@angular/core';
import { toDataURL, type QRCodeErrorCorrectionLevel } from 'qrcode';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { downloadFile } from '../../shared/utils/download-file';
import { buildContactPayload, buildTotpPayload, buildWifiPayload, type QrPreset } from "@dude/tool-engine/tools/qr-code-generator/qr-payload";

@Component({
  selector: 'app-qr-code-generator',
  imports: [ToolShell, ErrorPanel],
  templateUrl: './qr-code-generator.html',
})
export class QrCodeGenerator {
  private readonly persistence = inject(PersistenceService);

  protected readonly preset = this.persistence.signal<QrPreset>('qr-code-generator', 'preset', 'local', 'text');
  protected readonly errorCorrectionLevel = this.persistence.signal<QRCodeErrorCorrectionLevel>('qr-code-generator', 'ecLevel', 'local', 'M');

  protected readonly text = this.persistence.signal('qr-code-generator', 'text', 'session', 'https://example.com');

  protected readonly wifiSsid = this.persistence.signal('qr-code-generator', 'wifiSsid', 'session', '');
  protected readonly wifiPassword = this.persistence.signal('qr-code-generator', 'wifiPassword', 'session', '');
  protected readonly wifiSecurity = this.persistence.signal<'WPA' | 'WEP' | 'nopass'>('qr-code-generator', 'wifiSecurity', 'local', 'WPA');
  protected readonly wifiHidden = this.persistence.signal('qr-code-generator', 'wifiHidden', 'local', false);

  protected readonly contactName = this.persistence.signal('qr-code-generator', 'contactName', 'session', '');
  protected readonly contactPhone = this.persistence.signal('qr-code-generator', 'contactPhone', 'session', '');
  protected readonly contactEmail = this.persistence.signal('qr-code-generator', 'contactEmail', 'session', '');
  protected readonly contactOrg = this.persistence.signal('qr-code-generator', 'contactOrg', 'session', '');

  protected readonly totpSecret = this.persistence.signal('qr-code-generator', 'totpSecret', 'session', '');
  protected readonly totpIssuer = this.persistence.signal('qr-code-generator', 'totpIssuer', 'session', '');
  protected readonly totpAccount = this.persistence.signal('qr-code-generator', 'totpAccount', 'session', '');

  protected readonly payload = computed(() => {
    switch (this.preset()) {
      case 'wifi':
        return buildWifiPayload({ ssid: this.wifiSsid(), password: this.wifiPassword(), security: this.wifiSecurity(), hidden: this.wifiHidden() });
      case 'contact':
        return buildContactPayload({ name: this.contactName(), phone: this.contactPhone(), email: this.contactEmail(), organization: this.contactOrg() });
      case 'totp':
        return buildTotpPayload({ secret: this.totpSecret(), issuer: this.totpIssuer(), accountName: this.totpAccount(), algorithm: 'SHA1', digits: 6, period: 30 });
      default:
        return this.text();
    }
  });

  protected readonly dataUrl = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  constructor() {
    effect(() => {
      const payload = this.payload();
      const errorCorrectionLevel = this.errorCorrectionLevel();

      if (payload.trim() === '') {
        this.dataUrl.set(null);
        this.errorMessage.set(null);
        return;
      }

      toDataURL(payload, { errorCorrectionLevel, margin: 2, width: 320 })
        .then((url) => {
          this.dataUrl.set(url);
          this.errorMessage.set(null);
        })
        .catch((error: unknown) => {
          this.dataUrl.set(null);
          this.errorMessage.set(error instanceof Error ? error.message : 'Could not generate this QR code.');
        });
    });
  }

  protected setPreset(preset: QrPreset): void {
    this.preset.set(preset);
  }

  protected download(): void {
    const url = this.dataUrl();
    if (!url) return;
    const base64 = url.split(',')[1] ?? '';
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    downloadFile(bytes, 'qr-code.png', 'image/png');
  }
}
