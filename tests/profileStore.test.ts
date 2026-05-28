import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProfileStore } from '../electron/services/profileStore';

let dir: string;
let store: ProfileStore;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lfb-store-'));
  store = new ProfileStore(dir);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('ProfileStore', () => {
  it('creates a profile with stable id and timestamps', async () => {
    const profile = await store.create({ name: 'us-store-01', group: 'ops', notes: 'primary', color: '#5ee7ff' });

    expect(profile.id).toMatch(/^profile-/);
    expect(profile.name).toBe('us-store-01');
    expect(profile.group).toBe('ops');
    expect(profile.notes).toBe('primary');
    expect(profile.color).toBe('#5ee7ff');
    expect(profile.status).toBe('idle');
    expect(profile.createdAt).toBeTruthy();
    expect(profile.updatedAt).toBeTruthy();
    expect(profile.userDataDir).toContain(profile.id);
  });

  it('assigns a default profile color when none is provided', async () => {
    const profile = await store.create({ name: 'color-default' });

    expect(profile.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('creates a profile with a custom fingerprint when provided', async () => {
    const base = await store.create({ name: 'base' });
    const custom = {
      ...base.fingerprint,
      id: 'fp-custom-create',
      os: 'linux' as const,
      platform: 'Linux x86_64',
      languages: ['ja-JP', 'ja'],
      timezone: 'Asia/Tokyo',
    };

    const profile = await store.create({ name: 'custom-create', fingerprint: custom });

    expect(profile.fingerprint).toMatchObject({
      id: 'fp-custom-create',
      os: 'linux',
      platform: 'Linux x86_64',
      languages: ['ja-JP', 'ja'],
      timezone: 'Asia/Tokyo',
    });
  });

  it('lists profiles after creation', async () => {
    await store.create({ name: 'one' });
    await store.create({ name: 'two' });

    const profiles = await store.list();

    expect(profiles.map((profile) => profile.name)).toEqual(['one', 'two']);
  });

  it('updates profile fields without losing fingerprint config', async () => {
    const created = await store.create({ name: 'before' });
    const fingerprintId = created.fingerprint.id;

    const updated = await store.update(created.id, { name: 'after', status: 'warning' });

    expect(updated.name).toBe('after');
    expect(updated.status).toBe('warning');
    expect(updated.fingerprint.id).toBe(fingerprintId);
  });

  it('stores custom fingerprint edits and clears stale self-test results', async () => {
    const created = await store.create({ name: 'custom-fingerprint' });
    await store.update(created.id, {
      selfTestUrl: 'file:///tmp/fingerprint-self-test.html',
      selfTestSummary: '8/8 checks ok',
      selfTestReport: { matched: { userAgent: true } },
    });

    const updated = await store.update(created.id, {
      fingerprint: {
        ...created.fingerprint,
        os: 'windows',
        platform: 'Win32',
        languages: ['en-US', 'en'],
        timezone: 'America/New_York',
        userAgent: 'Mozilla/5.0 custom',
      },
      selfTestUrl: undefined,
      selfTestSummary: undefined,
      selfTestReport: undefined,
    });

    expect(updated.fingerprint).toMatchObject({
      os: 'windows',
      platform: 'Win32',
      languages: ['en-US', 'en'],
      timezone: 'America/New_York',
      userAgent: 'Mozilla/5.0 custom',
    });
    expect(updated.selfTestUrl).toBeUndefined();
    expect(updated.selfTestSummary).toBeUndefined();
    expect(updated.selfTestReport).toBeUndefined();
    expect(updated.history?.at(-1)?.message).toBe('fingerprint customized');
  });

  it('deletes a profile', async () => {
    const created = await store.create({ name: 'delete-me' });

    await store.delete(created.id);

    expect(await store.list()).toEqual([]);
  });

  it('duplicates a profile with a new isolated directory and reset runtime state', async () => {
    const created = await store.create({ name: 'source', proxyUrl: 'socks5://user:pass@example.com:1080' });
    await store.update(created.id, {
      status: 'running',
      pid: 1234,
      lastError: 'old error',
      selfTestSummary: '6/6 matched',
      launchTrace: ['old trace'],
    });

    const duplicated = await store.duplicate(created.id);

    expect(duplicated.id).not.toBe(created.id);
    expect(duplicated.name).toBe('source copy');
    expect(duplicated.userDataDir).toContain(duplicated.id);
    expect(duplicated.userDataDir).not.toBe(created.userDataDir);
    expect(duplicated.proxy).toMatchObject({ type: 'socks5', host: 'example.com', username: 'user' });
    expect(duplicated.fingerprint).not.toEqual(created.fingerprint);
    expect(duplicated.status).toBe('idle');
    expect(duplicated.pid).toBeUndefined();
    expect(duplicated.lastError).toBeUndefined();
    expect(duplicated.selfTestSummary).toBeUndefined();
    expect(duplicated.launchTrace).toBeUndefined();
  });

  it('does not persist proxy passwords as plain text', async () => {
    const created = await store.create({ name: 'secret-proxy', proxyUrl: 'socks5://user:pass@example.com:1080' });

    const raw = await readFile(join(dir, 'profiles.json'), 'utf8');
    const reloaded = new ProfileStore(dir);

    expect(raw).not.toContain('"password": "pass"');
    expect(raw).toContain('passwordCiphertext');
    expect(raw).toContain('passwordIv');
    await expect(reloaded.get(created.id)).resolves.toMatchObject({
      proxy: {
        username: 'user',
        password: 'pass',
      },
    });
  });

  it('keeps a bounded profile history for lifecycle events', async () => {
    const created = await store.create({ name: 'history-source' });

    const launched = await store.recordHistory(created.id, 'launched', 'browser pid 9001');
    for (let index = 0; index < 42; index += 1) {
      await store.recordHistory(created.id, 'proxy-check', `proxy check ${index}`);
    }

    const current = await store.get(created.id);

    expect(launched.history?.at(-1)?.message).toBe('browser pid 9001');
    expect(current.history).toHaveLength(40);
    expect(current.history?.[0].message).toBe('proxy check 2');
    expect(current.history?.at(-1)).toMatchObject({ type: 'proxy-check', message: 'proxy check 41' });
  });

  it('marks persisted running profiles as warning when runtime state is reconciled', async () => {
    const created = await store.create({ name: 'stale-running' });
    await store.update(created.id, { status: 'running', pid: 9001, lastLaunchAt: '2026-05-22T01:00:00.000Z' });

    const reconciled = await store.reconcileRuntimeState();

    expect(reconciled).toHaveLength(1);
    expect(reconciled[0]).toMatchObject({
      id: created.id,
      status: 'warning',
      pid: undefined,
      lastError: 'Previous browser process is no longer managed by this app session.',
    });
    expect(reconciled[0].history?.at(-1)).toMatchObject({ type: 'error', message: 'runtime state reconciled after app restart' });
  });

  it('backs up corrupted profile databases without silently returning an empty list', async () => {
    await writeFile(join(dir, 'profiles.json'), '{', 'utf8');

    await expect(store.list()).rejects.toThrow('Profile database is corrupted');
    const backup = (await readdir(dir)).find((file) => file.startsWith('profiles.json.corrupt-'));
    expect(backup).toBeTruthy();
    await expect(readFile(join(dir, backup ?? ''), 'utf8')).resolves.toBe('{');
  });
});
