import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { BrowserLauncher, findChromiumPath } from '../electron/services/browserLauncher';
import { generateFingerprint } from '../electron/services/fingerprint';
import type { BrowserProfile } from '../src/types';

async function main(): Promise<void> {
  const chromiumPath = process.env.CHROMIUM_PATH || findChromiumPath();
  if (!chromiumPath) {
    throw new Error('No Chrome/Chromium path found. Set CHROMIUM_PATH to run smoke test.');
  }

  const root = await mkdtemp(join(tmpdir(), 'lfb-smoke-'));
  const now = new Date().toISOString();
  const profile: BrowserProfile = {
    id: `smoke-${Date.now().toString(36)}`,
    name: 'Smoke Launch',
    group: 'Smoke',
    notes: '',
    fingerprint: generateFingerprint('smoke-launch'),
    userDataDir: join(root, 'chromium-user-data'),
    status: 'idle',
    createdAt: now,
    updatedAt: now,
  };

  const launcher = new BrowserLauncher(chromiumPath, resolve('fingerprint-extension'));
  try {
    const result = await launcher.launch(profile);
    await launcher.openUrl(profile.id, 'https://example.com/');
    console.log(JSON.stringify({
      pid: result.pid,
      automationStatus: result.automationStatus,
      selfTestSummary: result.selfTestSummary,
      selfTestUrl: result.selfTestUrl,
      openedUrl: 'https://example.com/',
      userDataDir: profile.userDataDir,
    }, null, 2));
    await launcher.stop(profile.id);
    if (result.automationStatus !== 'attached') {
      throw new Error(result.automationError ?? 'Launch smoke test degraded');
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
