import { access, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('launch smoke script config', () => {
  it('defines a script for real local Chromium launch smoke testing', async () => {
    const pkg = JSON.parse(await readFile('package.json', 'utf8')) as { scripts?: Record<string, string> };

    expect(pkg.scripts?.['smoke:launch']).toBe('npm run build:electron && node dist-electron/scripts/launchSmoke.js');
    await expect(access('scripts/launchSmoke.ts')).resolves.toBeUndefined();
  });
});
