import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SettingsStore } from '../electron/services/settingsStore';

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
    await expect(store.get()).resolves.toEqual({ chromiumPath: undefined });
  });

  it('persists chromium path updates', async () => {
    await store.update({ chromiumPath: '/Applications/Chromium.app/Contents/MacOS/Chromium' });

    await expect(store.get()).resolves.toEqual({
      chromiumPath: '/Applications/Chromium.app/Contents/MacOS/Chromium',
    });
  });
});
