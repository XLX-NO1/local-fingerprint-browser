import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { prepareExtensionRuntime } from '../electron/services/extensionRuntime';
import { generateFingerprint } from '../electron/services/fingerprint';
import type { BrowserProfile } from '../src/types';

const tempRoots: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

function makeProfile(userDataDir: string, id = 'profile-a'): BrowserProfile {
  const now = new Date('2026-05-22T00:00:00.000Z').toISOString();
  return {
    id,
    name: 'Runtime Test',
    group: 'Default',
    notes: 'private note should not be needed by extension runtime',
    fingerprint: generateFingerprint(id),
    userDataDir,
    status: 'idle',
    createdAt: now,
    updatedAt: now,
  };
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('prepareExtensionRuntime', () => {
  it('creates a per-profile runtime extension directory with copied assets and profile config', async () => {
    const sourceExtensionDir = await makeTempDir('source-extension-');
    const userDataDir = join(await makeTempDir('profile-user-data-'), 'chromium-data');
    const profile = makeProfile(userDataDir);

    await writeFile(join(sourceExtensionDir, 'manifest.json'), '{"manifest_version":3,"name":"test","background":{"service_worker":"proxy-auth.js"},"content_scripts":[{"js":["profile-config.js","content.js"]}]}');
    await writeFile(join(sourceExtensionDir, 'content.js'), 'console.log("content asset");');

    const runtimeDir = await prepareExtensionRuntime(profile, sourceExtensionDir);

    expect(runtimeDir).toBe(join(userDataDir, 'local-fingerprint-extension'));
    await expect(readFile(join(runtimeDir, 'manifest.json'), 'utf8')).resolves.toContain('"profile-config.js"');
    await expect(readFile(join(runtimeDir, 'content.js'), 'utf8')).resolves.toBe('console.log("content asset");');
    await expect(readFile(join(runtimeDir, 'proxy-auth.js'), 'utf8')).resolves.toContain('onAuthRequired');

    const config = await readFile(join(runtimeDir, 'profile-config.js'), 'utf8');
    expect(config).toMatch(/^window\.__LOCAL_FINGERPRINT_PROFILE__ = /);
    expect(config).toContain(JSON.stringify(profile.id));
    expect(config).toContain(JSON.stringify(profile.fingerprint.userAgent));
    expect(config).toContain(JSON.stringify(profile.fingerprint.canvasSeed));
    expect(config).not.toContain(profile.notes);
    expect(config.trimEnd()).toMatch(/;$/);
  });

  it('keeps different profiles isolated under their own user data directories', async () => {
    const sourceExtensionDir = await makeTempDir('source-extension-');
    const root = await makeTempDir('profiles-');
    const firstProfile = makeProfile(join(root, 'first-user-data'), 'profile-first');
    const secondProfile = makeProfile(join(root, 'second-user-data'), 'profile-second');

    await writeFile(join(sourceExtensionDir, 'manifest.json'), '{"manifest_version":3}');
    await writeFile(join(sourceExtensionDir, 'content.js'), 'console.log("shared source");');

    const firstRuntimeDir = await prepareExtensionRuntime(firstProfile, sourceExtensionDir);
    const secondRuntimeDir = await prepareExtensionRuntime(secondProfile, sourceExtensionDir);

    expect(firstRuntimeDir).toBe(join(firstProfile.userDataDir, 'local-fingerprint-extension'));
    expect(secondRuntimeDir).toBe(join(secondProfile.userDataDir, 'local-fingerprint-extension'));
    expect(firstRuntimeDir).not.toBe(secondRuntimeDir);

    await expect(readFile(join(firstRuntimeDir, 'profile-config.js'), 'utf8')).resolves.toContain(
      JSON.stringify(firstProfile.id),
    );
    await expect(readFile(join(secondRuntimeDir, 'profile-config.js'), 'utf8')).resolves.toContain(
      JSON.stringify(secondProfile.id),
    );
  });
});
