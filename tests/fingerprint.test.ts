import { describe, expect, it } from 'vitest';
import { buildFingerprintPreloadScript, generateFingerprint } from '../electron/services/fingerprint';
import { deriveUserAgentMetadata } from '../electron/services/fingerprint/model';

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
    expect(script).toContain('filterCandidateEvent');
    expect(script).toContain("typeof CanvasRenderingContext2D !== 'undefined'");
  });

  it('embeds UA client hints from the shared fingerprint model instead of duplicating derivation logic', () => {
    const appleSilicon = {
      ...generateFingerprint('profile-a'),
      os: 'macos' as const,
      platform: 'MacARM64',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.7444.265 Safari/537.36',
      webglRenderer: 'ANGLE (Apple, Apple M5, OpenGL 4.1)',
      browserVersion: '142.0.7444.265',
    };

    const script = buildFingerprintPreloadScript(appleSilicon);
    const metadata = deriveUserAgentMetadata(appleSilicon);

    expect(script).toContain(`const uaMetadata = ${JSON.stringify(metadata)};`);
    expect(script).toContain('platform: uaMetadata.platform');
    expect(script).toContain('architecture: uaMetadata.architecture');
    expect(script).toContain('platformVersion: uaMetadata.platformVersion');
    expect(script).not.toContain('deriveUaHints');
    expect(script).not.toContain('derivePlatformVersion');
  });
});
