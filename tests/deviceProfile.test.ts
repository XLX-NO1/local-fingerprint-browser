import { describe, expect, it } from 'vitest';
import { buildDeviceProfileRows } from '../src/deviceProfile';
import type { FingerprintConfig } from '../src/types';

describe('buildDeviceProfileRows', () => {
  it('formats the profile fingerprint into readable device rows', () => {
    const rows = buildDeviceProfileRows({
      os: 'macos',
      browserVersion: '126.0.0.0',
      userAgent: 'Mozilla/5.0 test',
      platform: 'MacIntel',
      languages: ['en-US', 'en'],
      timezone: 'America/New_York',
      screenWidth: 1920,
      screenHeight: 1080,
      windowWidth: 1920,
      windowHeight: 1080,
      hardwareConcurrency: 8,
      deviceMemory: 16,
      webglVendor: 'Google Inc. (Apple)',
      webglRenderer: 'ANGLE (Apple, Apple M2, OpenGL 4.1)',
      id: 'fp-test',
      canvasSeed: 1,
      audioSeed: 2,
      webrtcPolicy: 'proxy-only',
      mediaDevices: [],
      plugins: [],
      mimeTypes: [],
    } as FingerprintConfig);

    expect(rows).toContainEqual({ label: 'OS', value: 'macos' });
    expect(rows).toContainEqual({ label: 'Engine', value: 'Chromium 126.0.0.0' });
    expect(rows).toContainEqual({ label: 'Screen', value: '1920x1080' });
    expect(rows).toContainEqual({ label: 'CPU', value: '8 cores' });
    expect(rows).toContainEqual({ label: 'Memory', value: '16 GB' });
    expect(rows).toContainEqual({ label: 'WebGL Renderer', value: 'ANGLE (Apple, Apple M2, OpenGL 4.1)' });
  });
});
