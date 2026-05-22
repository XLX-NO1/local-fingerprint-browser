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

    const html = await readFile(result.filePath, 'utf8');
    expect(html).toContain(profile.name);
    expect(html).toContain(profile.fingerprint.userAgent);
    expect(html).toContain('navigator.userAgent');
    expect(html).toContain('canvas.toDataURL');
    expect(html).toContain('getParameter');
    expect(html).toContain('api.ipify.org');
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
