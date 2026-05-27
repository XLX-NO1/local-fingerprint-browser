import { describe, expect, it } from 'vitest';
import { generateFingerprintForRegion, REGION_PRESETS } from '../src/fingerprintRegions';

describe('fingerprint region presets', () => {
  it('generates a fingerprint with language and timezone matching the selected country', () => {
    const fingerprint = generateFingerprintForRegion('JP', 'profile-jp');

    expect(fingerprint.languages).toEqual(['ja-JP', 'ja', 'en-US']);
    expect(fingerprint.timezone).toBe('Asia/Tokyo');
  });

  it('keeps non-region device fields randomized by seed', () => {
    const first = generateFingerprintForRegion('US', 'profile-us-a');
    const second = generateFingerprintForRegion('US', 'profile-us-b');

    expect(first.languages).toEqual(['en-US', 'en']);
    expect(second.languages).toEqual(['en-US', 'en']);
    expect(first.timezone).toBe('America/New_York');
    expect(second.timezone).toBe('America/New_York');
    expect(first.canvasSeed).not.toBe(second.canvasSeed);
  });

  it('lists country options for the profile editor', () => {
    expect(REGION_PRESETS.map((preset) => preset.countryCode)).toEqual(['US', 'JP', 'DE', 'CN', 'GB', 'FR', 'SG', 'HK']);
  });
});
