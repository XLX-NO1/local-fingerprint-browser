import { describe, expect, it } from 'vitest';
import { generateLocalFingerprint } from '../src/localFingerprint';
import { DEFAULT_CHROMIUM_VERSION } from '../src/chromiumVersion';

describe('generateLocalFingerprint system consistency', () => {
  it('keeps mac platform and chip renderer in the same device family', () => {
    const samples = Array.from({ length: 80 }, (_value, index) => generateLocalFingerprint(`mac-consistency-${index}`))
      .filter((fingerprint) => fingerprint.os === 'macos');

    expect(samples.length).toBeGreaterThan(0);
    for (const fingerprint of samples) {
      const appleSilicon = /Apple M[1-5]/.test(fingerprint.webglRenderer);
      expect(fingerprint.platform).toBe(appleSilicon ? 'MacARM64' : 'MacIntel');
    }
  });

  it('uses the Chromium version bundled with Electron as the default browser version', () => {
    const fingerprint = generateLocalFingerprint('chromium-version-consistency');

    expect(fingerprint.browserVersion).toBe(DEFAULT_CHROMIUM_VERSION);
    expect(fingerprint.userAgent).toContain(`Chrome/${DEFAULT_CHROMIUM_VERSION}`);
  });
});
