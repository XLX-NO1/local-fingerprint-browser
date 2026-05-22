import type { FingerprintConfig } from './types';

export type OsPreset = {
  os: FingerprintConfig['os'];
  platform: string;
  userAgentOs: string;
  webglVendor: string;
  webglRenderer: string;
};

export const OS_PRESETS: Record<FingerprintConfig['os'], OsPreset[]> = {
  windows: [
    {
      os: 'windows',
      platform: 'Win32',
      userAgentOs: 'Windows NT 10.0; Win64; x64',
      webglVendor: 'Google Inc. (NVIDIA)',
      webglRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    },
    {
      os: 'windows',
      platform: 'Win32',
      userAgentOs: 'Windows NT 11.0; Win64; x64',
      webglVendor: 'Google Inc. (NVIDIA)',
      webglRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    },
  ],
  macos: [
    {
      os: 'macos',
      platform: 'MacIntel',
      userAgentOs: 'Macintosh; Intel Mac OS X 13_6_1',
      webglVendor: 'Google Inc. (Apple)',
      webglRenderer: 'ANGLE (Apple, Intel(R) UHD Graphics 630, OpenGL 4.1)',
    },
    {
      os: 'macos',
      platform: 'MacARM64',
      userAgentOs: 'Macintosh; Intel Mac OS X 14_4_1',
      webglVendor: 'Google Inc. (Apple)',
      webglRenderer: 'ANGLE (Apple, Apple M1, OpenGL 4.1)',
    },
    {
      os: 'macos',
      platform: 'MacARM64',
      userAgentOs: 'Macintosh; Intel Mac OS X 14_4_1',
      webglVendor: 'Google Inc. (Apple)',
      webglRenderer: 'ANGLE (Apple, Apple M2, OpenGL 4.1)',
    },
    {
      os: 'macos',
      platform: 'MacARM64',
      userAgentOs: 'Macintosh; Intel Mac OS X 14_6_1',
      webglVendor: 'Google Inc. (Apple)',
      webglRenderer: 'ANGLE (Apple, Apple M3, OpenGL 4.1)',
    },
    {
      os: 'macos',
      platform: 'MacARM64',
      userAgentOs: 'Macintosh; Intel Mac OS X 15_2',
      webglVendor: 'Google Inc. (Apple)',
      webglRenderer: 'ANGLE (Apple, Apple M4, OpenGL 4.1)',
    },
    {
      os: 'macos',
      platform: 'MacARM64',
      userAgentOs: 'Macintosh; Intel Mac OS X 15_5',
      webglVendor: 'Google Inc. (Apple)',
      webglRenderer: 'ANGLE (Apple, Apple M5, OpenGL 4.1)',
    },
  ],
  linux: [
    {
      os: 'linux',
      platform: 'Linux x86_64',
      userAgentOs: 'X11; Linux x86_64',
      webglVendor: 'Google Inc. (Intel)',
      webglRenderer: 'ANGLE (Intel, Mesa Intel(R) UHD Graphics, OpenGL 4.6)',
    },
    {
      os: 'linux',
      platform: 'Linux x86_64',
      userAgentOs: 'X11; Linux x86_64',
      webglVendor: 'Google Inc. (AMD)',
      webglRenderer: 'ANGLE (AMD, AMD Radeon RX 6600, OpenGL 4.6)',
    },
  ],
};

export function pickOsPreset(os: FingerprintConfig['os'], random: () => number): OsPreset {
  const presets = OS_PRESETS[os];
  return presets[Math.min(presets.length - 1, Math.floor(random() * presets.length))];
}

export function allOsPresets(): OsPreset[] {
  return Object.values(OS_PRESETS).flat();
}
