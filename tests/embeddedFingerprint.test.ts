import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateFingerprint } from '../electron/services/fingerprint';
import {
  buildEmbeddedCdpSetupCommands,
  buildAcceptLanguageHeader,
  buildEmbeddedBrowserViewPreferences,
  embeddedFingerprintPreloadPath,
  shouldRecreateEmbeddedBrowserView,
  writeEmbeddedFingerprintPreload,
} from '../electron/services/embeddedFingerprint';
import type { BrowserProfile } from '../src/types';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'lfb-embedded-fp-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('embedded fingerprint helpers', () => {
  it('writes a per-profile preload file for the native BrowserView', async () => {
    const profile = makeProfile(join(root, 'user-data'));

    const preload = await writeEmbeddedFingerprintPreload(profile);

    expect(preload).toBe(join(profile.userDataDir, 'embedded-fingerprint-preload.js'));
    const source = await readFile(preload, 'utf8');
    expect(source).toContain(profile.fingerprint.userAgent);
    expect(source).toContain("document.createElement('script')");
    expect(source).toContain('target.appendChild(script)');
  });

  it('builds BrowserView preferences with isolated storage and sandboxed preload', () => {
    const profile = makeProfile(join(root, 'user-data'));

    expect(buildEmbeddedBrowserViewPreferences(profile)).toEqual({
      partition: `persist:profile-${profile.id}`,
      preload: embeddedFingerprintPreloadPath(profile),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    });
  });

  it('formats Accept-Language consistently with the generated fingerprint', () => {
    expect(buildAcceptLanguageHeader(['zh-CN', 'zh', 'en-US'])).toBe('zh-CN,zh;q=0.9,en-US;q=0.8');
  });

  it('builds CDP setup commands for BrowserView main-world fingerprint injection', () => {
    const profile = makeProfile(join(root, 'user-data'));
    const commands = buildEmbeddedCdpSetupCommands(profile);

    expect(commands).toContainEqual({
      method: 'Page.addScriptToEvaluateOnNewDocument',
      params: { source: expect.stringContaining(profile.fingerprint.platform) },
    });
    expect(commands).toContainEqual({
      method: 'Emulation.setTimezoneOverride',
      params: { timezoneId: profile.fingerprint.timezone },
    });
    expect(commands).toContainEqual({
      method: 'Emulation.setDeviceMetricsOverride',
      params: {
        width: profile.fingerprint.screenWidth,
        height: profile.fingerprint.screenHeight,
        deviceScaleFactor: 1,
        mobile: false,
      },
    });
  });

  it('requires recreating the native BrowserView when proxy identity changes', () => {
    const profile = makeProfile(join(root, 'user-data'));
    const updated = {
      ...profile,
      proxy: {
        id: 'proxy-1',
        type: 'socks5' as const,
        host: '127.0.0.1',
        port: 1080,
        updatedAt: new Date('2026-05-22T00:00:00.000Z').toISOString(),
      },
    };

    expect(shouldRecreateEmbeddedBrowserView({ profileId: profile.id, fingerprintId: profile.fingerprint.id, proxyIdentity: 'direct' }, updated)).toBe(true);
  });
});

function makeProfile(userDataDir: string): BrowserProfile {
  const now = new Date('2026-05-22T00:00:00.000Z').toISOString();
  return {
    id: 'profile-embedded-fp',
    name: 'Embedded FP',
    group: 'Default',
    notes: '',
    fingerprint: generateFingerprint('profile-embedded-fp'),
    userDataDir,
    status: 'idle',
    createdAt: now,
    updatedAt: now,
  };
}
