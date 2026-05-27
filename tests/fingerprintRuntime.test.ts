import { describe, expect, it } from 'vitest';
import { buildFingerprintRuntimeProfile, buildFingerprintRuntimeCdpCommands } from '../electron/services/fingerprintRuntime';
import { generateFingerprint } from '../electron/services/fingerprint';

describe('fingerprintRuntime', () => {
  it('normalizes flat profile fingerprints into the shared hardware runtime profile', () => {
    const fingerprint = generateFingerprint('runtime-profile');
    const runtime = buildFingerprintRuntimeProfile({
      id: 'profile-runtime',
      fingerprint,
    });

    expect(runtime.profile.id).toBe(fingerprint.id);
    expect(runtime.profile.schemaVersion).toBe(2);
    expect(runtime.acceptLanguage).toBe(runtime.profile.derived.acceptLanguage);
    expect(runtime.userAgentMetadata).toEqual(runtime.profile.derived.userAgentMetadata);
    expect(runtime.legacyConfig).toMatchObject({
      id: fingerprint.id,
      userAgent: fingerprint.userAgent,
      platform: fingerprint.platform,
      timezone: fingerprint.timezone,
    });
  });

  it('builds CDP commands from the normalized runtime profile', () => {
    const fingerprint = generateFingerprint('runtime-cdp-profile');
    const commands = buildFingerprintRuntimeCdpCommands({
      id: 'profile-runtime',
      fingerprint,
      preloadScript: 'preload-source',
      navigateUrl: 'https://example.com/',
      includeDeviceMetrics: true,
    });

    expect(commands).toContainEqual(expect.objectContaining({
      method: 'Network.setUserAgentOverride',
      params: expect.objectContaining({
        userAgent: fingerprint.userAgent,
        acceptLanguage: expect.stringContaining(fingerprint.languages[0]),
        userAgentMetadata: expect.any(Object),
      }),
    }));
    expect(commands).toContainEqual(expect.objectContaining({
      method: 'Emulation.setDeviceMetricsOverride',
      params: expect.objectContaining({
        width: fingerprint.screenWidth,
        height: fingerprint.screenHeight,
      }),
    }));
    expect(commands).toContainEqual({
      method: 'Page.navigate',
      params: { url: 'https://example.com/' },
    });
  });
});
