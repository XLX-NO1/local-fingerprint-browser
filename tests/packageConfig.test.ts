import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('package desktop build config', () => {
  it('defines a package script and electron-builder config for mac app output', async () => {
    const pkg = JSON.parse(await readFile('package.json', 'utf8')) as {
      scripts?: Record<string, string>;
      build?: Record<string, unknown>;
      devDependencies?: Record<string, string>;
      dependencies?: Record<string, string>;
      main?: string;
    };

    expect(pkg.main).toBe('dist-electron/electron-entry.js');
    expect(pkg.scripts?.dist).toBe('npm run build && electron-builder --mac --dir');
    expect(pkg.devDependencies).toHaveProperty('electron-builder');
    expect(pkg.devDependencies).toHaveProperty('electron');
    expect(pkg.dependencies).not.toHaveProperty('electron');
    expect(pkg.build).toMatchObject({
      appId: 'local.fingerprint.browser',
      productName: 'Local Fingerprint Browser',
      files: ['dist/**', 'dist-electron/**', 'fingerprint-extension/**', 'package.json'],
      mac: {
        category: 'public.app-category.developer-tools',
        target: ['dir'],
      },
    });
  });
});
