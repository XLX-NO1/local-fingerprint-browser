import { describe, expect, it } from 'vitest';
import { generateFingerprint } from '../electron/services/fingerprint';
import { applyFingerprintOsPreset, fingerprintToForm, formToFingerprint, hasFingerprintFormChanges } from '../src/fingerprintEditor';

describe('fingerprint editor mapping', () => {
  it('round-trips editable fingerprint values through form state', () => {
    const fingerprint = generateFingerprint('editable-fingerprint');
    const form = fingerprintToForm(fingerprint);

    expect(form.languages).toBe(fingerprint.languages.join(', '));
    expect(form.screenWidth).toBe(String(fingerprint.screenWidth));

    const updated = formToFingerprint(fingerprint, {
      ...form,
      os: 'windows',
      browserVersion: '127.0.0.0',
      userAgent: 'Mozilla/5.0 custom',
      platform: 'Win32',
      languages: 'en-US, en, fr-FR',
      timezone: 'Europe/Paris',
      screenWidth: '1600',
      screenHeight: '900',
      windowWidth: '1500',
      windowHeight: '840',
      hardwareConcurrency: '10',
      deviceMemory: '12',
      webglVendor: 'Google Inc. (Custom)',
      webglRenderer: 'ANGLE (Custom GPU)',
      webrtcPolicy: 'disabled',
      plugins: 'Chrome PDF Viewer, Custom Plugin',
      mimeTypes: 'application/pdf, application/custom',
    });

    expect(updated).toMatchObject({
      os: 'windows',
      browserVersion: '127.0.0.0',
      userAgent: 'Mozilla/5.0 custom',
      platform: 'Win32',
      languages: ['en-US', 'en', 'fr-FR'],
      timezone: 'Europe/Paris',
      screenWidth: 1600,
      screenHeight: 900,
      windowWidth: 1500,
      windowHeight: 840,
      hardwareConcurrency: 10,
      deviceMemory: 12,
      webglVendor: 'Google Inc. (Custom)',
      webglRenderer: 'ANGLE (Custom GPU)',
      webrtcPolicy: 'disabled',
      plugins: ['Chrome PDF Viewer', 'Custom Plugin'],
      mimeTypes: ['application/pdf', 'application/custom'],
    });
    expect(updated.id).toMatch(/^fp-custom-/);
    expect(updated.id).not.toBe(fingerprint.id);
    expect(updated.canvasSeed).toBe(fingerprint.canvasSeed);
  });

  it('falls back to the existing fingerprint for blank or invalid values', () => {
    const fingerprint = generateFingerprint('fallback-fingerprint');
    const updated = formToFingerprint(fingerprint, {
      ...fingerprintToForm(fingerprint),
      userAgent: '',
      languages: '',
      screenWidth: '0',
      hardwareConcurrency: 'not-a-number',
      plugins: '',
    });

    expect(updated.userAgent).toBe(fingerprint.userAgent);
    expect(updated.languages).toEqual(fingerprint.languages);
    expect(updated.screenWidth).toBe(fingerprint.screenWidth);
    expect(updated.hardwareConcurrency).toBe(fingerprint.hardwareConcurrency);
    expect(updated.plugins).toEqual(fingerprint.plugins);
  });

  it('detects whether the editable fingerprint fields changed', () => {
    const fingerprint = generateFingerprint('change-detection-fingerprint');
    const form = fingerprintToForm(fingerprint);
    const nextTimezone = form.timezone === 'Asia/Tokyo' ? 'Europe/Berlin' : 'Asia/Tokyo';

    expect(hasFingerprintFormChanges(fingerprint, form)).toBe(false);
    expect(hasFingerprintFormChanges(fingerprint, { ...form, timezone: nextTimezone })).toBe(true);
  });

  it('updates platform and user agent when the OS preset changes', () => {
    const fingerprint = generateFingerprint('os-preset-fingerprint');
    const form = {
      ...fingerprintToForm(fingerprint),
      os: 'windows' as const,
      browserVersion: '127.2.3.4',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.2.3.4 Safari/537.36',
      platform: 'Win32',
    };

    const updated = applyFingerprintOsPreset(form, 'macos', () => 0.34);

    expect(updated.os).toBe('macos');
    expect(updated.platform).toBe('MacARM64');
    expect(updated.userAgent).toContain('Macintosh; Intel Mac OS X 14_4_1');
    expect(updated.userAgent).toContain('Chrome/127.2.3.4');
    expect(updated.webglVendor).toBe('Google Inc. (Apple)');
    expect(updated.webglRenderer).toContain('Apple M2');
  });

  it('randomizes OS presets within the selected operating system family', () => {
    const form = fingerprintToForm(generateFingerprint('random-os-preset-fingerprint'));

    const win10 = applyFingerprintOsPreset(form, 'windows', () => 0);
    const win11 = applyFingerprintOsPreset(form, 'windows', () => 0.99);
    const macM5 = applyFingerprintOsPreset(form, 'macos', () => 0.99);

    expect(win10.userAgent).toContain('Windows NT 10.0');
    expect(win10.platform).toBe('Win32');
    expect(win10.webglRenderer).toContain('NVIDIA GeForce RTX 3060');
    expect(win11.userAgent).toContain('Windows NT 11.0');
    expect(win11.webglRenderer).toContain('NVIDIA GeForce RTX 4070');
    expect(macM5.userAgent).toContain('Macintosh; Intel Mac OS X 15_5');
    expect(macM5.platform).toBe('MacARM64');
    expect(macM5.webglRenderer).toContain('Apple M5');
  });
});
