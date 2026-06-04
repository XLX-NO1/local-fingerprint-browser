import { access, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('launch smoke script config', () => {
  it('defines a script for real local Chromium launch smoke testing', async () => {
    const pkg = JSON.parse(await readFile('package.json', 'utf8')) as { scripts?: Record<string, string> };

    expect(pkg.scripts?.['smoke:launch']).toBe('npm run build:electron && node dist-electron/scripts/launchSmoke.js');
    await expect(access('scripts/launchSmoke.ts')).resolves.toBeUndefined();
  });

  it('defines a browser smoke script for BrowserView, WebContentsView, and DOM webview paths', async () => {
    const pkg = JSON.parse(await readFile('package.json', 'utf8')) as { scripts?: Record<string, string> };
    const mainSource = await readFile('electron/main.ts', 'utf8');
    const smokeSource = await readFile('scripts/browserSmoke.ts', 'utf8');

    expect(pkg.scripts?.['smoke:browser']).toBe('npm run build && node dist-electron/scripts/browserSmoke.js');
    await expect(access('scripts/browserSmoke.ts')).resolves.toBeUndefined();
    expect(smokeSource).toContain('USE_WEB_CONTENTS_VIEW');
    expect(smokeSource).toContain('ELECTRON_BROWSER_SMOKE');
    expect(smokeSource).toContain('ELECTRON_BROWSER_UI_SMOKE');
    expect(smokeSource).toContain('ELECTRON_SETTINGS_GET_DELAY_MS');
    expect(smokeSource).toContain('ELECTRON_DOM_WEBVIEW_SMOKE');
    expect(smokeSource).toContain('browser-view');
    expect(smokeSource).toContain('web-contents-view');
    expect(smokeSource).toContain('web-contents-view-ui');
    expect(smokeSource).toContain('dom-webview');
    expect(smokeSource).toContain('domWebviewAttached');
    expect(smokeSource).toContain('nativeViewAttached');
    expect(smokeSource).toContain('surfaceOnly');
    expect(smokeSource).toContain('popupOpenedInInternalTab?: boolean');
    expect(smokeSource).toContain("mode !== 'web-contents-view-ui' && (!result.popupOpenedInInternalTab || result.tabCount < 2)");
    expect(smokeSource).toContain("mode !== 'web-contents-view-ui' && !result.selfTestOpened");
    expect(smokeSource).toContain('resolveAndStopChild');
    expect(smokeSource).toContain('stopElectronSmokeChild');
    expect(smokeSource).toContain("process.kill(-pid, signal)");
    expect(mainSource).toContain('runElectronBrowserSmoke');
    expect(mainSource).toContain('seedElectronBrowserUiSmokeProfile');
    expect(mainSource).toContain('runElectronBrowserUiSmoke');
    expect(mainSource).toContain('runElectronDomWebviewSmoke');
    expect(mainSource).toContain('process.env.ELECTRON_BROWSER_SMOKE');
    expect(mainSource).toContain('process.env.ELECTRON_BROWSER_UI_SMOKE');
    expect(mainSource).toContain('process.env.ELECTRON_DOM_WEBVIEW_SMOKE');
    expect(mainSource).toContain('ELECTRON_BROWSER_SMOKE_RESULT');
    expect(mainSource).toContain('nativeBrowserController.isAttached()');
    expect(mainSource).toContain('browserUiSmokeDomWebviewAttached');
    expect(mainSource).toContain('browserUiSmokeWebviewAttachedHandler');
    expect(mainSource).toContain('attachBrowserUiSmokeWebviewListener');
    expect(mainSource).toContain("window.webContents.on('did-attach-webview', browserUiSmokeWebviewAttachedHandler)");
    expect(mainSource).toContain('detachBrowserUiSmokeWebviewListener?.();');
    expect(mainSource.indexOf('attachBrowserUiSmokeWebviewListener(mainWindow)')).toBeGreaterThan(mainSource.indexOf('mainWindow.webContents.on(\'certificate-error\''));
    expect(mainSource.indexOf('attachBrowserUiSmokeWebviewListener(mainWindow)')).toBeLessThan(mainSource.indexOf('void mainWindow.loadURL'));
    expect(mainSource).toContain('settingsGetDelayMs');
    expect(mainSource).toContain('normalizeSmokeDelayMs');
    expect(mainSource).toContain('Number.isFinite(parsed) && parsed > 0 ? parsed : 0');
    expect(mainSource).toContain('ELECTRON_SETTINGS_GET_DELAY_MS');
    expect(mainSource).toContain('createWindow();');
    expect(mainSource).toContain("document.querySelector('[data-smoke-target-blank]')?.href");
    expect(mainSource).toContain('handleEmbeddedWebviewWindowOpen(profile.id, popupUrl)');
    expect(mainSource).not.toContain('guest.setWindowOpenHandler');
  });
});
