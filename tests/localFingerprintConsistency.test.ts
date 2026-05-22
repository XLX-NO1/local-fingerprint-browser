import { describe, expect, it } from 'vitest';
import { generateLocalFingerprint } from '../src/localFingerprint';

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
});
