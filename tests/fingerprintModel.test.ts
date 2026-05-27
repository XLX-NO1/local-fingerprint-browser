import { describe, expect, it } from 'vitest';
import { generateFingerprint } from '../electron/services/fingerprint';
import {
  deriveUserAgentMetadata,
  fingerprintConfigFromHardwareProfile,
  generateHardwareFingerprintProfile,
  generateFingerprintConfig,
  normalizeFingerprintConfig,
  validateHardwareFingerprintProfile,
} from '../electron/services/fingerprint/model';
import { DEFAULT_CHROMIUM_VERSION } from '../src/chromiumVersion';

describe('hardware fingerprint model', () => {
  it('generates deterministic Apple Silicon profiles with coherent hardware, graphics, and UA client hints', () => {
    const first = generateHardwareFingerprintProfile({
      seed: 'apple-silicon-profile',
      deviceClass: 'mac_apple_silicon',
      regionCode: 'US',
    });
    const second = generateHardwareFingerprintProfile({
      seed: 'apple-silicon-profile',
      deviceClass: 'mac_apple_silicon',
      regionCode: 'US',
    });

    expect(first).toEqual(second);
    expect(first.device.deviceClass).toBe('mac_apple_silicon');
    expect(first.device.os).toBe('macos');
    expect(first.derived.platform).toBe('MacARM64');
    expect(first.hardware.architecture).toBe('arm');
    expect(first.graphics.webglRenderer).toMatch(/Apple M[1-5]/);
    expect(first.derived.userAgent).toContain('Macintosh; Intel Mac OS X');
    expect(first.derived.userAgent).toContain(`Chrome/${DEFAULT_CHROMIUM_VERSION}`);
    expect(first.derived.userAgentMetadata.platform).toBe('macOS');
    expect(first.derived.userAgentMetadata.architecture).toBe('arm');
    expect(first.derived.userAgentMetadata.uaFullVersion).toBe(DEFAULT_CHROMIUM_VERSION);
    expect(validateHardwareFingerprintProfile(first).valid).toBe(true);
  });

  it('generates Windows desktop profiles with Direct3D-style WebGL and x86 UA metadata', () => {
    const profile = generateHardwareFingerprintProfile({
      seed: 'windows-desktop-profile',
      deviceClass: 'windows_desktop',
      regionCode: 'DE',
    });

    expect(profile.device.os).toBe('windows');
    expect(profile.derived.platform).toBe('Win32');
    expect(profile.hardware.architecture).toBe('x86');
    expect(profile.graphics.webglRenderer).toContain('Direct3D11');
    expect(profile.derived.userAgentMetadata.platform).toBe('Windows');
    expect(profile.derived.userAgentMetadata.architecture).toBe('x86');
    expect(profile.locale.languages).toEqual(['de-DE', 'de', 'en-US']);
    expect(profile.locale.timezone).toBe('Europe/Berlin');
    expect(validateHardwareFingerprintProfile(profile).valid).toBe(true);
  });

  it('normalizes an existing flat FingerprintConfig into the hardware model', () => {
    const flat = generateFingerprint('existing-flat-profile');
    const profile = normalizeFingerprintConfig(flat, 'existing-flat-profile');

    expect(profile.id).toBe(flat.id);
    expect(profile.derived.userAgent).toBe(flat.userAgent);
    expect(profile.derived.platform).toBe(flat.platform);
    expect(profile.locale.languages).toEqual(flat.languages);
    expect(profile.locale.timezone).toBe(flat.timezone);
    expect(profile.graphics.webglVendor).toBe(flat.webglVendor);
    expect(profile.graphics.webglRenderer).toBe(flat.webglRenderer);
    expect(profile.noise.canvasSeed).toBe(flat.canvasSeed);
    expect(profile.noise.audioSeed).toBe(flat.audioSeed);
    expect(validateHardwareFingerprintProfile(profile).valid).toBe(true);
  });

  it('exports hardware profiles to the legacy FingerprintConfig shape', () => {
    const profile = generateHardwareFingerprintProfile({
      seed: 'legacy-export-profile',
      deviceClass: 'linux_desktop',
      regionCode: 'JP',
    });
    const config = fingerprintConfigFromHardwareProfile(profile);

    expect(config.id).toBe(profile.id);
    expect(config.os).toBe('linux');
    expect(config.browserVersion).toBe(DEFAULT_CHROMIUM_VERSION);
    expect(config.userAgent).toBe(profile.derived.userAgent);
    expect(config.platform).toBe(profile.derived.platform);
    expect(config.languages).toEqual(profile.locale.languages);
    expect(config.timezone).toBe(profile.locale.timezone);
    expect(config.hardwareConcurrency).toBe(profile.hardware.cpuCores);
    expect(config.deviceMemory).toBe(profile.hardware.memoryGb);
    expect(config.webglVendor).toBe(profile.graphics.webglVendor);
    expect(config.webglRenderer).toBe(profile.graphics.webglRenderer);
    expect(config.canvasSeed).toBe(profile.noise.canvasSeed);
    expect(config.audioSeed).toBe(profile.noise.audioSeed);
  });

  it('generates legacy FingerprintConfig values from the hardware model facade', () => {
    const first = generateFingerprintConfig('facade-profile');
    const second = generateFingerprintConfig('facade-profile');
    const normalized = normalizeFingerprintConfig(first, 'facade-profile');

    expect(first).toEqual(second);
    expect(first.browserVersion).toBe(DEFAULT_CHROMIUM_VERSION);
    expect(first.userAgent).toContain(`Chrome/${DEFAULT_CHROMIUM_VERSION}`);
    expect(validateHardwareFingerprintProfile(normalized).valid).toBe(true);
  });

  it('reports validation errors for impossible mixed hardware profiles', () => {
    const profile = generateHardwareFingerprintProfile({
      seed: 'invalid-mixed-profile',
      deviceClass: 'mac_apple_silicon',
      regionCode: 'US',
    });
    const invalid = {
      ...profile,
      hardware: {
        ...profile.hardware,
        architecture: 'x86' as const,
      },
      graphics: {
        ...profile.graphics,
        webglRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      },
    };

    expect(validateHardwareFingerprintProfile(invalid)).toEqual({
      valid: false,
      errors: expect.arrayContaining([
        'Apple Silicon profiles must use arm architecture.',
        'macOS profiles must not use Direct3D WebGL renderers.',
      ]),
      warnings: [],
    });
  });

  it('derives UA metadata from a flat fingerprint without duplicating caller logic', () => {
    const flat = {
      ...generateFingerprint('metadata-profile'),
      os: 'windows' as const,
      platform: 'Win32',
      userAgent: `Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${DEFAULT_CHROMIUM_VERSION} Safari/537.36`,
      browserVersion: DEFAULT_CHROMIUM_VERSION,
    };

    expect(deriveUserAgentMetadata(flat)).toMatchObject({
      platform: 'Windows',
      platformVersion: '11.0.0',
      architecture: 'x86',
      bitness: '64',
      uaFullVersion: DEFAULT_CHROMIUM_VERSION,
    });
  });
});
