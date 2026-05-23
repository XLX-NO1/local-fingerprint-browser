import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('browser chrome UI', () => {
  const appSource = readFileSync('src/App.tsx', 'utf8');
  const styles = readFileSync('src/styles.css', 'utf8');

  it('submits the url bar with Enter instead of a separate open button', () => {
    expect(appSource).toContain('<form className="browser-toolbar"');
    expect(appSource).toContain('onSubmit=');
    expect(appSource).not.toContain('点击“打开网页”');
  });

  it('lets the embedded browser fill the available workspace height', () => {
    expect(styles).toContain('grid-template-rows: auto minmax(0, 1fr);');
    expect(styles).toContain('grid-template-rows: minmax(0, 1fr);');
    expect(styles).toContain('flex: 1;');
    expect(styles).not.toContain('height: calc(100vh - 112px)');
  });

  it('does not reserve an extra management or title row above the webpage', () => {
    expect(appSource).not.toContain('className="workspace-bar"');
    expect(appSource).not.toContain('className="browser-panel-title"');
  });

  it('hides the native browser view while React modals are open', () => {
    expect(appSource).toContain('const isModalOpen = isEditorOpen || isSettingsOpen || isProxyEditorOpen;');
    expect(appSource).toContain('if (isModalOpen) {');
    expect(appSource).toContain('hideNativeBrowserView');
  });

  it('clips normal native BrowserView bounds to the main workspace', () => {
    expect(appSource).toContain('mainRef');
    expect(appSource).toContain('Math.min(rect.right, mainRect.right)');
    expect(appSource).toContain('Math.min(rect.bottom, mainRect.bottom)');
  });

  it('resyncs the native BrowserView after inspector and profile layout changes settle', () => {
    expect(appSource).toContain('scheduleNativeBrowserViewSync');
    expect(appSource).toContain('requestAnimationFrame');
    expect(appSource).toContain('window.setTimeout(syncNativeBrowserView, 80)');
    expect(appSource).toContain('window.setTimeout(syncNativeBrowserView, 240)');
    expect(appSource).toContain('window.visualViewport?.addEventListener');
    expect(appSource).toContain('isInspectorCollapsed');
    expect(appSource).toContain('selected?.fingerprint.id');
  });

  it('does not render fingerprint self-test pages in the native BrowserView layer', () => {
    const syncHandler = appSource.slice(
      appSource.indexOf('const syncNativeBrowserView'),
      appSource.indexOf('const scheduleNativeBrowserViewSync'),
    );
    const browserPanel = appSource.slice(
      appSource.indexOf('<section className="browser-panel full-browser">'),
      appSource.indexOf('</section>', appSource.indexOf('<section className="browser-panel full-browser">')),
    );

    expect(appSource).toContain('isSelfTestView');
    expect(appSource).toContain('SelfTestReportView');
    expect(syncHandler).toContain('isSelfTestView');
    expect(syncHandler).toContain('hideNativeBrowserView');
    expect(syncHandler.indexOf('if (isSelfTestView')).toBeLessThan(syncHandler.indexOf('showNativeBrowserView?.(selected.id, selected.lastOpenedUrl'));
    expect(browserPanel).toContain('SelfTestReportView');
  });

  it('hides the native BrowserView while regenerating a fingerprint before recreating it', () => {
    const regenerateHandler = appSource.slice(
      appSource.indexOf('async function regenerateFingerprint'),
      appSource.indexOf('async function openFingerprintSelfTest'),
    );

    expect(regenerateHandler).not.toContain('setIsNativeBrowserPaused(true);');
    expect(regenerateHandler.indexOf('await window.api.hideNativeBrowserView?.();')).toBeLessThan(regenerateHandler.indexOf('regenerateProfileFingerprint'));
  });

  it('uses simple native BrowserView bounds attachment in the main process', () => {
    const mainSource = readFileSync('electron/main.ts', 'utf8');
    const showHandler = mainSource.slice(
      mainSource.indexOf("ipcMain.handle('native-browser:show'"),
      mainSource.indexOf("ipcMain.handle('native-browser:resize'"),
    );

    expect(showHandler).toContain('nativeBrowserBounds = cssRectToBrowserViewBounds(bounds);');
    expect(showHandler).not.toContain('clampBrowserViewBoundsToWindow');
    expect(showHandler.indexOf('mainWindow.addBrowserView(nativeBrowserView);')).toBeLessThan(showHandler.indexOf('nativeBrowserView.setBounds(nativeBrowserBounds);'));
  });

  it('fits wide native browser pages to the available width after load and resize', () => {
    const mainSource = readFileSync('electron/main.ts', 'utf8');
    const resizeHandler = mainSource.slice(
      mainSource.indexOf("ipcMain.handle('native-browser:resize'"),
      mainSource.indexOf("ipcMain.handle('native-browser:hide'"),
    );

    expect(mainSource).toContain('computeWidthFitZoom');
    expect(mainSource).toContain('fitNativeBrowserWidth');
    expect(mainSource).toContain('measurePageScript()');
    expect(mainSource).toContain('view.webContents.on(\'did-finish-load\', () => scheduleNativeBrowserWidthFit())');
    expect(mainSource).toContain('view.webContents.on(\'did-stop-loading\', () => scheduleNativeBrowserWidthFit())');
    expect(resizeHandler).toContain('scheduleNativeBrowserWidthFit()');
  });

  it('attaches native BrowserView event handlers only once per view instance', () => {
    const mainSource = readFileSync('electron/main.ts', 'utf8');
    const attachHandler = mainSource.slice(
      mainSource.indexOf('function attachNativeBrowserTabHandlers'),
      mainSource.indexOf('function disposeNativeBrowserView'),
    );
    const disposeHandler = mainSource.slice(
      mainSource.indexOf('function disposeNativeBrowserView'),
      mainSource.indexOf("app.on('before-quit'"),
    );

    expect(mainSource).toContain('let nativeBrowserHandlersAttached = false;');
    expect(attachHandler).toContain('if (nativeBrowserHandlersAttached)');
    expect(attachHandler).toContain('nativeBrowserHandlersAttached = true;');
    expect(disposeHandler).toContain('nativeBrowserHandlersAttached = false;');
  });

  it('does not explicitly close native BrowserView webContents during app quit', () => {
    const mainSource = readFileSync('electron/main.ts', 'utf8');
    const beforeQuitHandler = mainSource.slice(
      mainSource.indexOf("app.on('before-quit'"),
      mainSource.indexOf('async function captureNativeSelfTestResult'),
    );

    expect(beforeQuitHandler).toContain('detachNativeBrowserView');
    expect(beforeQuitHandler).not.toContain('webContents.close');
  });

  it('supports minimizing the Electron app into a tray menu', () => {
    const mainSource = readFileSync('electron/main.ts', 'utf8');

    expect(mainSource).toContain('Tray');
    expect(mainSource).toContain('Menu');
    expect(mainSource).toContain('createTray()');
    expect(mainSource).toContain('hideMainWindowToTray');
    expect(mainSource).toContain(".on('minimize'");
    expect(mainSource).toContain("mainWindow.on('close'");
    expect(mainSource).toContain("app.on('did-become-active'");
    expect(mainSource).toContain('createAppTrayIcon');
    expect(mainSource).toContain("join(process.resourcesPath, 'tray-icon-white.png')");
    expect(mainSource).toContain("join(app.getAppPath(), 'assets/tray-icon-white.png')");
    expect(mainSource).toContain('resize({ width: 18, height: 18 })');
    expect(mainSource).toContain('icon.setTemplateImage(false)');
    expect(mainSource).toContain('显示主窗口');
    expect(mainSource).toContain('退出');
  });

  it('keeps the hidden native browser frame dark instead of flashing green', () => {
    expect(styles).toMatch(/\.native-browser-frame\s*\{[^}]*background: #050a08;/s);
  });

  it('keeps the inspector as a fixed high-layer rail outside the native browser area', () => {
    expect(styles).toContain('grid-template-columns: 232px 1fr 260px;');
    expect(styles).toContain('grid-template-columns: 232px 1fr 34px;');
    expect(styles).toContain('position: relative;');
    expect(styles).not.toContain('padding-right: 261px;');
  });

  it('exposes compact fingerprint actions in the inspector', () => {
    expect(appSource).toContain('regenerateFingerprint');
    expect(appSource).toContain('openFingerprintSelfTest');
    expect(appSource).toContain('重生成指纹');
    expect(appSource).toContain('指纹检测');
  });

  it('opens a dedicated proxy settings panel from the sidebar proxy button', () => {
    expect(appSource).toContain('isProxyEditorOpen');
    expect(appSource).toContain('openProxyEditor');
    expect(appSource).toContain('saveProxyProfile');
    expect(appSource).toContain('PROXY SETTINGS');
    expect(appSource).toContain('设置代理');
    expect(appSource).toContain('className="proxy-modal"');
    expect(appSource).toContain('onClick={() => openProxyEditor(profile)}');
    expect(appSource).not.toContain('<button type="button" onClick={() => void checkProxy(profile)}>代理</button>');
  });

  it('wires browser toolbar buttons to native navigation commands', () => {
    expect(appSource).toContain('goBackNativeBrowserView');
    expect(appSource).toContain('goForwardNativeBrowserView');
    expect(appSource).toContain('reloadNativeBrowserView');
    expect(appSource).not.toContain('<button type="button" disabled title="后退">');
    expect(appSource).not.toContain('<button type="button" disabled title="前进">');
  });

  it('does not overwrite the address bar while the user is editing it', () => {
    expect(appSource).toContain('isEditingUrl');
    expect(appSource).toContain('onFocus={() => setIsEditingUrl(true)}');
    expect(appSource).toContain('onBlur={() => setIsEditingUrl(false)}');
  });

  it('shows detailed device profile information in the inspector', () => {
    expect(appSource).toContain('device profile');
    expect(appSource).toContain('buildDeviceProfileRows');
    expect(appSource).toContain('deviceRows.map');
  });

  it('makes inspector panels compact and collapsible so lower reports stay reachable', () => {
    expect(appSource).toContain('compact');
    expect(appSource).toContain('initialCollapsed');
    expect(appSource).toContain('const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);');
    expect(appSource).toContain('panelId');
    expect(appSource).toContain('data-panel-id={panelId}');
    expect(appSource).toContain('setIsCollapsed(initialCollapsed);');
    expect(appSource).toContain('aria-expanded={!isCollapsed}');
    expect(appSource).toContain('panel-title-button');
    expect(styles).toContain('.inspector-panels');
    expect(styles).toContain('overflow-y: auto;');
    expect(styles).toContain('.panel.compact');
    expect(styles).toContain('.panel.collapsed');
  });

  it('exposes editable fingerprint controls in the profile editor', () => {
    expect(appSource).toContain('指纹配置');
    expect(appSource).toContain('fingerprint-form-grid');
    expect(appSource).toContain('fingerprint.os');
    expect(appSource).toContain('fingerprint.languages');
    expect(appSource).toContain('fingerprint.timezone');
    expect(appSource).toContain('fingerprint.userAgent');
    expect(appSource).toContain('fingerprint.webglRenderer');
    expect(appSource).toContain('applyFingerprintOsPreset');
    expect(appSource).toContain('旧检测结果会在保存后清空');
  });

  it('lets users pick a profile color and shows it in the sidebar', () => {
    expect(appSource).toContain('PROFILE_COLORS');
    expect(appSource).toContain('颜色');
    expect(appSource).toContain('profile-color-dot');
    expect(styles).toContain('.profile-color-swatch');
  });

  it('surfaces runtime errors in the status bar', () => {
    expect(appSource).toContain('{error ?');
    expect(appSource).toContain('status-error');
    expect(styles).toContain('.status-error');
  });

  it('keeps native create-tab requests blank unless a url is provided', () => {
    const mainSource = readFileSync('electron/main.ts', 'utf8');

    expect(mainSource).toContain("createBlankTab(profile, rawUrl || 'about:blank')");
    expect(mainSource).not.toContain("createBlankTab(profile, rawUrl || 'https://example.com')");
  });
});
