export interface ResolutionPreset {
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

export const RESOLUTION_PRESETS: readonly ResolutionPreset[] = [
  { name: 'VGA', width: 640, height: 480 },
  { name: 'SVGA', width: 800, height: 600 },
  { name: 'XGA', width: 1024, height: 768 },
  { name: 'WXGA', width: 1366, height: 768 },
  { name: 'HD (720p)', width: 1280, height: 720 },
  { name: 'SXGA', width: 1280, height: 1024 },
  { name: 'Full HD (1080p)', width: 1920, height: 1080 },
  { name: 'WUXGA', width: 1920, height: 1200 },
  { name: 'UXGA', width: 1600, height: 1200 },
  { name: 'QHD (1440p)', width: 2560, height: 1440 },
  { name: 'DCI 2K', width: 2048, height: 1080 },
  { name: '4K UHD (2160p)', width: 3840, height: 2160 },
  { name: 'DCI 4K', width: 4096, height: 2160 },
  { name: '8K UHD (4320p)', width: 7680, height: 4320 },
];

export function megapixels(width: number, height: number): number {
  return (width * height) / 1_000_000;
}
