import type { FingerprintConfig } from './types';

export interface DeviceProfileRow {
  label: string;
  value: string;
}

export function buildDeviceProfileRows(fingerprint: FingerprintConfig): DeviceProfileRow[] {
  return [
    { label: 'OS', value: fingerprint.os },
    { label: 'Engine', value: `Chromium ${fingerprint.browserVersion}` },
    { label: 'Platform', value: fingerprint.platform },
    { label: 'User-Agent', value: fingerprint.userAgent },
    { label: 'Screen', value: `${fingerprint.screenWidth}x${fingerprint.screenHeight}` },
    { label: 'Window', value: `${fingerprint.windowWidth}x${fingerprint.windowHeight}` },
    { label: 'CPU', value: `${fingerprint.hardwareConcurrency} cores` },
    { label: 'Memory', value: `${fingerprint.deviceMemory} GB` },
    { label: 'WebGL Vendor', value: fingerprint.webglVendor },
    { label: 'WebGL Renderer', value: fingerprint.webglRenderer },
  ];
}
