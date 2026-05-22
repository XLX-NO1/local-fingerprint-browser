import { describe, expect, it } from 'vitest';
import { buildFingerprintPreloadScript, generateFingerprint } from '../electron/services/fingerprint';

describe('fingerprint generation', () => {
  it('generates stable values for the same seed', () => {
    expect(generateFingerprint('profile-a')).toEqual(generateFingerprint('profile-a'));
  });

  it('generates different seeds for different profiles', () => {
    expect(generateFingerprint('profile-a').canvasSeed).not.toBe(generateFingerprint('profile-b').canvasSeed);
  });

  it('builds a preload script containing configured navigator values', () => {
    const fingerprint = generateFingerprint('profile-a');
    const script = buildFingerprintPreloadScript(fingerprint);

    expect(script).toContain(fingerprint.userAgent);
    expect(script).toContain('hardwareConcurrency');
    expect(script).toContain('getContext');
    expect(script).toContain('userAgentData');
    expect(script).toContain('PluginArray');
    expect(script).toContain('MimeTypeArray');
    expect(script).toContain('getImageData');
    expect(script).toContain('AudioBuffer');
    expect(script).toContain('permissions.query');
    expect(script).toContain('RTCPeerConnection');
    expect(script).toContain('webkitRTCPeerConnection');
    expect(script).toContain('WebRTC disabled by profile policy');
    expect(script).toContain("typeof CanvasRenderingContext2D !== 'undefined'");
  });
});
