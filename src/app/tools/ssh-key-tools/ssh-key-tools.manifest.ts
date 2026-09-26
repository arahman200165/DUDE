import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'ssh-key-tools',
  title: 'SSH Key Generator & Inspector',
  shortTitle: 'SSH Key Tools',
  description:
    'Generates an RSA, ECDSA, or Ed25519 SSH key pair, or inspects an SSH public key and its fingerprint.',
  category: 'security',
  keywords: [
    'ssh',
    'key',
    'rsa',
    'ecdsa',
    'ed25519',
    'fingerprint',
    'authorized_keys',
    'public key',
    'openssh',
  ],
  route: '/tools/ssh-key-tools',
  load: () => import('./ssh-key-tools').then((m) => m.SshKeyTools),
  status: 'verified',
  verification: {
    crossChecked: ['ssh-keygen -lf', 'ssh-keygen -E md5 -lf'],
    summary:
      'SHA256/MD5 fingerprints for Ed25519/RSA-2048/ECDSA-P256 keys matched byte-for-byte against real ssh-keygen output.',
  },
  consequenceClass: ['crypto'],
  persistence: { input: 'none', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
