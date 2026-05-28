import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readStartupDisableIpv6, SettingsStore } from '../electron/services/settingsStore';

let dir: string;
let store: SettingsStore;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lfb-settings-'));
  store = new SettingsStore(dir);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('SettingsStore', () => {
  it('returns default settings when no file exists', async () => {
    await expect(store.get()).resolves.toEqual({
      chromiumPath: undefined,
      browserZoomFactor: 1,
      disableIpv6: true,
    });
  });

  it('persists chromium path updates', async () => {
    await store.update({ chromiumPath: '/Applications/Chromium.app/Contents/MacOS/Chromium' });

    await expect(store.get()).resolves.toEqual({
      chromiumPath: '/Applications/Chromium.app/Contents/MacOS/Chromium',
      browserZoomFactor: 1,
      disableIpv6: true,
    });
  });

  it('persists supported browser zoom factors', async () => {
    await store.update({ browserZoomFactor: 1.25 });

    await expect(store.get()).resolves.toEqual({
      chromiumPath: undefined,
      browserZoomFactor: 1.25,
      disableIpv6: true,
    });
  });

  it('falls back to 100 percent zoom for unsupported values', async () => {
    await store.update({ browserZoomFactor: 1.37 });

    await expect(store.get()).resolves.toEqual({
      chromiumPath: undefined,
      browserZoomFactor: 1,
      disableIpv6: true,
    });
  });

  it('persists IPv6 startup privacy setting', async () => {
    await store.update({ disableIpv6: false });

    await expect(store.get()).resolves.toEqual({
      chromiumPath: undefined,
      browserZoomFactor: 1,
      disableIpv6: false,
    });
    expect(readStartupDisableIpv6(dir)).toBe(false);
  });

  it('backs up corrupt settings and falls back to defaults', async () => {
    await writeFile(join(dir, 'settings.json'), '{', 'utf8');

    await expect(store.get()).resolves.toEqual({
      chromiumPath: undefined,
      browserZoomFactor: 1,
      disableIpv6: true,
    });
    expect((await readdir(dir)).some((file) => file.startsWith('settings.json.corrupt-'))).toBe(true);
  });
});
