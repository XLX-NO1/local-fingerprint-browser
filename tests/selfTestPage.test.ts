import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prepareSelfTestPage } from '../electron/services/selfTestPage';
import { generateFingerprint } from '../electron/services/fingerprint';
import type { BrowserProfile } from '../src/types';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'lfb-self-test-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('prepareSelfTestPage', () => {
  it('writes a per-profile self-test page and returns a file url', async () => {
    const profile = makeProfile(join(root, 'user-data'));

    const result = await prepareSelfTestPage(profile);

    expect(result.filePath).toBe(join(profile.userDataDir, 'fingerprint-self-test.html'));
    expect(result.fileUrl).toMatch(/^file:\/\//);
    expect(result.fileUrl).toContain('fingerprint-self-test.html?run=');

    const html = await readFile(result.filePath, 'utf8');
    expect(html).toContain(profile.name);
    expect(html).toContain(profile.fingerprint.userAgent);
    expect(html).toContain('navigator.userAgent');
    expect(html).toContain('canvas.toDataURL');
    expect(html).toContain('getParameter');
    expect(html).toContain('api.ipify.org');
    expect(html).toContain('ipapi.co/json');
    expect(html).toContain('ipinfo.io/json');
    expect(html).toContain("countryCode: payload.country || null");
    expect(html).toContain("countryName: payload.country || null");
    expect(html).toContain('countryCode');
    expect(html).toContain('countryName');
    expect(html).toContain('localeConsistency');
    expect(html).toContain('navigator.userAgentData');
    expect(html).toContain('runtimeConsistency');
    expect(html).toContain('hardwareRuntime');
    expect(html).toContain('hardwareFingerprintProfile');
    expect(html).toContain('schemaVersion');
    expect(html).toContain('deviceClass');
    expect(html).toContain('userAgentMetadata');
    expect(html).toContain('validation');
    expect(html).toContain('expectedChromiumVersion');
    expect(html).toContain('browserVersionMatchesRuntime');
    expect(html).toContain('uaClientHintsConsistency');
    expect(html).toContain('architectureMatchesProfile');
    expect(html).toContain('platformVersionMatchesProfile');
    expect(html).not.toContain('deriveExpectedUaHints');
    expect(html).toContain('screen.colorDepth');
    expect(html).toContain('window.outerWidth');
    expect(html).toContain('navigator.plugins');
    expect(html).toContain('navigator.mimeTypes');
    expect(html).toContain('navigator.permissions.query');
    expect(html).toContain('navigator.mediaDevices.enumerateDevices');
    expect(html).toContain('AbortSignal.timeout(3000)');
    expect(html).toContain('renderReport');
    expect(html).toContain('errorToString');
    expect(html).toContain('observe failed');
    expect(html).toContain('RTCPeerConnection');
    expect(html).toContain('proxyConfigured');
    expect(html).toContain('webrtcLeakRisk');
    expect(html).toContain('let connection;');
    expect(html).toContain('connection = new RTCPeerConnection');
    expect(html).toContain('window.__LOCAL_FINGERPRINT_SELF_TEST__');
    expect(html).toContain('window.__LOCAL_FINGERPRINT_SELF_TEST_RESULT__');
    expect(html).toContain('document.title =');
    expect(html).toContain('width: 820px');
    expect(html).toContain('max-width: calc(100vw - 24px)');
    expect(html).toContain('margin: 0');
    expect(html).toContain('font-size: 18px');
    expect(html).toContain('grid-template-columns: repeat(2, 400px)');
    expect(html).toContain('grid-template-rows: repeat(2, 300px)');
    expect(html).toContain('@media (max-width: 760px)');
    expect(html).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(html).toContain('height: auto');
    expect(html).toContain('min-height: 0');
    expect(html).toContain('overflow: hidden');
    expect(html).not.toContain('height: 100vh');
    expect(html).toContain('overflow: auto');
  });
});

function makeProfile(userDataDir: string): BrowserProfile {
  const now = new Date('2026-05-22T00:00:00.000Z').toISOString();
  return {
    id: 'profile-self-test',
    name: 'Self Test Profile',
    group: 'Default',
    notes: '',
    fingerprint: generateFingerprint('profile-self-test'),
    userDataDir,
    status: 'idle',
    createdAt: now,
    updatedAt: now,
  };
}
