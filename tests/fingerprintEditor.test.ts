import { describe, expect, it } from 'vitest';
import { generateFingerprint } from '../electron/services/fingerprint';
import { fingerprintToForm, formToFingerprint, hasFingerprintFormChanges } from '../src/fingerprintEditor';

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
});
