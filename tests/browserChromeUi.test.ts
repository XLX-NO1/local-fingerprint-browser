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
    expect(appSource).toContain('inspectorRef');
    expect(appSource).toContain('USE_DOM_EMBEDDED_WEBVIEW');
    expect(appSource).toContain('<webview');
    expect(appSource).toContain('embeddedPartitionForProfile(selected.id)');
    expect(styles).toContain('.embedded-webview');
    const embeddedWebviewStyles = styles.slice(
      styles.indexOf('.embedded-webview'),
      styles.indexOf('.native-browser-hint'),
    );
    expect(styles).toContain('grid-template-rows: minmax(0, 1fr);');
    expect(embeddedWebviewStyles).toContain('width: 100% !important;');
    expect(embeddedWebviewStyles).toContain('height: 100% !important;');
    expect(embeddedWebviewStyles).not.toContain('width: auto;');
    expect(embeddedWebviewStyles).not.toContain('height: auto;');
    expect(appSource).toContain("style={{ width: '100%', height: '100%' }}");
    expect(appSource).toContain('const frameWidth = frame.clientWidth;');
    expect(appSource).toContain('const frameHeight = frame.clientHeight;');
    expect(appSource).toContain('layoutVersion,');
    expect(appSource).toContain('const inspectorLeft = inspectorRect && inspectorRect.width > 0 ? inspectorRect.left : mainRect.right;');
    expect(appSource).toContain('Math.min(frameWidth, mainRect.right - rect.left, inspectorLeft - rect.left)');
    expect(appSource).toContain('x: rect.left + 1');
    expect(appSource).toContain('width: Math.max(0, visibleWidth - 2)');
    expect(appSource).toContain('Math.min(rect.bottom, mainRect.bottom)');
  });

  it('resyncs the native BrowserView after inspector and profile layout changes settle', () => {
    expect(appSource).toContain('scheduleNativeBrowserViewSync');
    expect(appSource).toContain('clearScheduledNativeBrowserViewSync');
    expect(appSource).toContain('requestAnimationFrame');
    expect(appSource).toContain('window.setTimeout(() => syncNativeBrowserView(layoutVersion), 80)');
    expect(appSource).toContain('window.setTimeout(() => syncNativeBrowserView(layoutVersion), 240)');
    expect(appSource).toContain('window.visualViewport?.addEventListener');
    expect(appSource).toContain('isInspectorCollapsed');
    expect(appSource).toContain('selected?.fingerprint.id');
  });

  it('hides the native BrowserView before toggling the inspector width', () => {
    const toggleHandler = appSource.slice(
      appSource.indexOf('function toggleInspector'),
      appSource.indexOf('async function loadSettings'),
    );

    expect(toggleHandler).toContain('window.api.hideNativeBrowserView?.();');
    expect(toggleHandler).toContain('setIsInspectorCollapsed');
    expect(toggleHandler).toContain('clearScheduledNativeBrowserViewSync();');
    expect(toggleHandler).toContain('window.setTimeout(scheduleNativeBrowserViewSync, 260);');
    expect(appSource).toContain('onClick={toggleInspector}');
  });

  it('rejects stale native BrowserView bounds in the main process', () => {
    const mainSource = readFileSync('electron/main.ts', 'utf8');
    const showHandler = mainSource.slice(
      mainSource.indexOf("ipcMain.handle('native-browser:show'"),
      mainSource.indexOf("ipcMain.handle('native-browser:resize'"),
    );
    const resizeHandler = mainSource.slice(
      mainSource.indexOf("ipcMain.handle('native-browser:resize'"),
      mainSource.indexOf("ipcMain.handle('native-browser:hide'"),
    );

    expect(mainSource).toContain('let nativeBrowserLayoutVersion = 0;');
    expect(mainSource).toContain('function shouldIgnoreStaleNativeBrowserBounds');
    expect(mainSource).toContain('layoutVersion < nativeBrowserLayoutVersion');
    expect(showHandler).toContain('shouldIgnoreStaleNativeBrowserBounds(bounds)');
    expect(resizeHandler).toContain('shouldIgnoreStaleNativeBrowserBounds(bounds)');
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
    expect(syncHandler.indexOf('if (isSelfTestView')).toBeLessThan(syncHandler.indexOf('showNativeBrowserView?.(selected.id, tabId, selected.lastOpenedUrl'));
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

  it('hides the native BrowserView before and after deleting a profile', () => {
    const removeHandler = appSource.slice(
      appSource.indexOf('async function remove'),
      appSource.indexOf('async function duplicate'),
    );

    expect(removeHandler.indexOf('await window.api.hideNativeBrowserView?.();')).toBeGreaterThan(-1);
    expect(removeHandler.indexOf('await window.api.hideNativeBrowserView?.();')).toBeLessThan(removeHandler.indexOf('await window.api.deleteProfile(profile.id);'));
    expect(removeHandler.lastIndexOf('await window.api.hideNativeBrowserView?.();')).toBeGreaterThan(removeHandler.indexOf('await refreshProfiles();'));
  });

  it('uses simple native BrowserView bounds attachment in the main process', () => {
    const mainSource = readFileSync('electron/main.ts', 'utf8');
    const showHandler = mainSource.slice(
      mainSource.indexOf("ipcMain.handle('native-browser:show'"),
      mainSource.indexOf("ipcMain.handle('native-browser:resize'"),
    );

    expect(showHandler).toContain('const host = currentNativeBrowserHost(mainWindow);');
    expect(showHandler).toContain('nativeBrowserController.show(host, profile, tabId, url, bounds);');
    expect(showHandler).not.toContain('clampBrowserViewBoundsToWindow');
    const controllerSource = readFileSync('electron/services/nativeBrowserViewController.ts', 'utf8');
    expect(controllerSource.indexOf('host.addPageView(entry.view);')).toBeGreaterThan(-1);
    expect(controllerSource.indexOf('host.addPageView(entry.view);')).toBeLessThan(controllerSource.indexOf('this.resize(bounds);'));
    expect(controllerSource).toContain('entry.view.setBounds(entry.bounds);');
  });

  it('keeps BrowserView as the default while allowing WebContentsView through an explicit switch', () => {
    const mainSource = readFileSync('electron/main.ts', 'utf8');

    expect(mainSource).toContain('browserPageViewModeFromEnv(process.env)');
    expect(mainSource).toContain('createNativeBrowserPageView');
    expect(mainSource).toContain('currentNativeBrowserHost');
    expect(mainSource).toContain('WebContentsViewPageHost');
    expect(mainSource).toContain('BrowserViewPageHost');
    expect(mainSource).toContain('new WebContentsView');
    expect(mainSource).toContain('new BrowserView');
  });

  it('disables IPv6 before Chromium networking starts', () => {
    const mainSource = readFileSync('electron/main.ts', 'utf8');
    const commandLineSetup = mainSource.slice(
      mainSource.indexOf('function configureChromiumNetworkPrivacy'),
      mainSource.indexOf('let mainWindow'),
    );

    expect(mainSource.indexOf('configureChromiumNetworkPrivacy();')).toBeLessThan(mainSource.indexOf('app.whenReady()'));
    expect(commandLineSetup).toContain('readStartupDisableIpv6(appDataDir)');
    expect(commandLineSetup).toContain('if (disableIpv6)');
    expect(commandLineSetup).toContain("app.commandLine.appendSwitch('disable-ipv6');");
    expect(commandLineSetup).toContain("app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', 'disable_non_proxied_udp');");
  });

  it('applies a fixed user browser zoom instead of dynamic page fitting', () => {
    const mainSource = readFileSync('electron/main.ts', 'utf8');
    const resizeHandler = mainSource.slice(
      mainSource.indexOf("ipcMain.handle('native-browser:resize'"),
      mainSource.indexOf("ipcMain.handle('native-browser:hide'"),
    );
    const settingsHandler = mainSource.slice(
      mainSource.indexOf("ipcMain.handle('settings:update'"),
      mainSource.indexOf('});', mainSource.indexOf("ipcMain.handle('settings:update'")),
    );

    expect(mainSource).toContain('normalizeBrowserZoomFactor');
    expect(mainSource).toContain('let nativeBrowserZoomFactor = 1;');
    expect(mainSource).toContain('contents.setZoomFactor(nativeBrowserZoomFactor);');
    expect(mainSource).not.toContain('computeWidthFitZoom');
    expect(mainSource).not.toContain('fitNativeBrowserWidth');
    expect(resizeHandler).toContain('resetNativeBrowserZoom();');
    expect(resizeHandler).not.toContain('scheduleNativeBrowserWidthFit');
    expect(settingsHandler).toContain('nativeBrowserZoomFactor = normalizeBrowserZoomFactor(settings.browserZoomFactor);');
    expect(settingsHandler).toContain('resetNativeBrowserZoom();');
  });

  it('exposes fixed browser zoom choices in settings', () => {
    const mainSource = readFileSync('electron/main.ts', 'utf8');
    const preloadSource = readFileSync('electron/preload.ts', 'utf8');
    const typesSource = readFileSync('src/types.ts', 'utf8');

    expect(appSource).toContain('BROWSER_ZOOM_OPTIONS');
    expect(appSource).toContain('browserZoomFactor');
    expect(appSource).toContain('页面缩放');
    expect(appSource).toContain('disableIpv6');
    expect(appSource).toContain('禁用 IPv6');
    expect(appSource).toContain('80%');
    expect(appSource).toContain('90%');
    expect(appSource).toContain('100%');
    expect(appSource).toContain('110%');
    expect(appSource).toContain('125%');
    expect(mainSource).toContain('settings.browserZoomFactor');
    expect(mainSource).toContain('readStartupDisableIpv6');
    expect(preloadSource).toContain('updateSettings: (input: AppSettings)');
    expect(typesSource).toContain('browserZoomFactor?: number;');
    expect(typesSource).toContain('disableIpv6?: boolean;');
  });

  it('prepares DOM webviews with the fingerprint preload before attachment', () => {
    const mainSource = readFileSync('electron/main.ts', 'utf8');
    const embeddedSessionSource = readFileSync('electron/services/embeddedSession.ts', 'utf8');
    const attachHandler = mainSource.slice(
      mainSource.indexOf("mainWindow.webContents.on('will-attach-webview'"),
      mainSource.indexOf("mainWindow as BrowserWindow", mainSource.indexOf("mainWindow.webContents.on('will-attach-webview'")),
    );

    expect(mainSource).toContain('const embeddedWebviewPreloads = new Map<string, string>();');
    expect(mainSource).toContain('async function prepareEmbeddedWebviewProfile');
    expect(mainSource).toContain('embeddedWebviewPreloads.set(profile.id, preloadPath);');
    expect(mainSource).toContain("ipcMain.handle('embedded-webview:prepare'");
    expect(appSource).toContain('prepareEmbeddedWebview(selected.id)');
    expect(appSource).toContain('preparedEmbeddedProfileId !== selected.id');
    expect(appSource).toContain('useragent={selected.fingerprint.userAgent}');
    expect(embeddedSessionSource).toContain('profileSession.setUserAgent(profile.fingerprint.userAgent');
    expect(attachHandler).toContain('profileIdFromEmbeddedPartition');
    expect(attachHandler).toContain('webPreferences.preload = preload;');
    expect(attachHandler).not.toContain('delete webPreferences.preload');
  });

  it('syncs DOM webview navigation and popups back into profiles', () => {
    const mainSource = readFileSync('electron/main.ts', 'utf8');
    const preloadSource = readFileSync('electron/preload.ts', 'utf8');

    expect(mainSource).toContain("ipcMain.handle('embedded-webview:navigation'");
    expect(mainSource).toContain('updateEmbeddedWebviewProfileNavigation');
    expect(mainSource).toContain("ipcMain.handle('embedded-webview:open-popup'");
    expect(mainSource).toContain('openUrlInNewTab(profile, rawUrl)');
    expect(preloadSource).toContain('updateEmbeddedWebviewNavigation');
    expect(preloadSource).toContain('openEmbeddedWebviewPopup');
    expect(appSource).toContain("webview.addEventListener('did-navigate'");
    expect(appSource).toContain("webview.addEventListener('page-title-updated'");
    expect(appSource).toContain("webview.addEventListener('new-window'");
    expect(appSource).toContain('if (!isEditingUrl) {');
    expect(appSource).toContain('setOpenUrl(next.url);');
    expect(appSource).toContain('updateEmbeddedWebviewNavigation(selected.id, selectedTabId, next)');
    expect(appSource).toContain('openEmbeddedWebviewPopup(selected.id, url)');
  });

  it('does not call DOM webview navigation methods before they are ready', () => {
    expect(appSource).toContain('const safeWebviewCall');
    expect(appSource).toContain("webview.addEventListener('dom-ready', onNavigate)");
    expect(appSource).not.toContain("webview.addEventListener('crashed', onCrashed);\n    persistNavigationState();");
    expect(appSource).toContain('The webview navigation API throws before dom-ready.');
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
    const createViewHandler = mainSource.slice(
      mainSource.indexOf("ipcMain.handle('native-browser:show'"),
      mainSource.indexOf("ipcMain.handle('native-browser:resize'"),
    );

    expect(mainSource).toContain('const nativeBrowserHandlerWebContents = new WeakSet<Electron.WebContents>();');
    expect(attachHandler).toContain('const contents = electronWebContents(view);');
    expect(attachHandler).toContain('if (nativeBrowserHandlerWebContents.has(contents))');
    expect(attachHandler).toContain('nativeBrowserHandlerWebContents.add(contents);');
    expect(mainSource).toContain('attachNativeBrowserTabHandlers(view);');
    expect(createViewHandler).toContain('nativeBrowserController.show');
    expect(disposeHandler).not.toContain('nativeBrowserHandlersAttached = false;');
  });

  it('tracks native BrowserView navigation state in the main process', () => {
    const mainSource = readFileSync('electron/main.ts', 'utf8');
    const attachHandler = mainSource.slice(
      mainSource.indexOf('function attachNativeBrowserTabHandlers'),
      mainSource.indexOf('function disposeNativeBrowserView'),
    );

    expect(mainSource).toContain("ipcMain.handle('native-browser:navigation-state'");
    expect(mainSource).toContain('nativeBrowserController.navigationStateForTab(tabId)');
    expect(attachHandler).toContain("contents.on('did-start-loading'");
    expect(attachHandler).toContain("contents.on('did-stop-loading'");
    expect(attachHandler).toContain("contents.on('did-fail-load'");
    expect(attachHandler).toContain("contents.on('render-process-gone'");
    expect(attachHandler).toContain('updateNativeBrowserNavigationState(view');
  });

  it('blocks external protocols in the native browser layer', () => {
    const mainSource = readFileSync('electron/main.ts', 'utf8');
    const attachHandler = mainSource.slice(
      mainSource.indexOf('function attachNativeBrowserTabHandlers'),
      mainSource.indexOf('function disposeNativeBrowserView'),
    );

    expect(mainSource).toContain('navigationDecisionForUrl');
    expect(attachHandler).toContain("contents.on('will-navigate'");
    expect(attachHandler).toContain("return { action: 'deny' };");
  });

  it('blocks certificate errors instead of silently continuing', () => {
    const mainSource = readFileSync('electron/main.ts', 'utf8');

    expect(mainSource).toContain("mainWindow.webContents.on('certificate-error'");
    expect(mainSource).toContain('certificateDecisionForError(url, error)');
    expect(mainSource).toContain('callback(false)');
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
    expect(appSource).toContain('getNativeBrowserNavigationState');
    expect(appSource).toContain('disabled={!navigationState?.canGoBack}');
    expect(appSource).toContain('disabled={!navigationState?.canGoForward}');
    expect(appSource).not.toContain('<button type="button" disabled title="后退">');
    expect(appSource).not.toContain('<button type="button" disabled title="前进">');
    expect(appSource).not.toContain('disabled={!selected?.lastOpenedUrl} onClick={() => void goBackNativeBrowserView()}');
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

  it('shows hardware fingerprint runtime details in the inspector', () => {
    expect(appSource).toContain('hardwareRuntime');
    expect(appSource).toContain('hardwareRuntimeSummary');
    expect(appSource).toContain('schemaVersion');
    expect(appSource).toContain('deviceClass');
    expect(appSource).toContain('userAgentMetadata');
  });

  it('shows profile scoped downloads in the inspector', () => {
    expect(appSource).toContain('listDownloads');
    expect(appSource).toContain('cancelDownload');
    expect(appSource).toContain('showDownloadInFolder');
    expect(appSource).toContain('panelId="downloads"');
    expect(appSource).toContain('className="download-row"');
    expect(appSource).toContain("download.status !== 'progressing'");
    expect(appSource).toContain('定位');
    expect(styles).toContain('.download-row');

    const mainSource = readFileSync('electron/main.ts', 'utf8');
    const preloadSource = readFileSync('electron/preload.ts', 'utf8');
    const typesSource = readFileSync('src/types.ts', 'utf8');
    expect(mainSource).toContain("ipcMain.handle('downloads:show-in-folder'");
    expect(mainSource).toContain('shell.showItemInFolder');
    expect(mainSource).not.toContain('shell.openPath');
    expect(preloadSource).toContain('showDownloadInFolder');
    expect(typesSource).toContain('showDownloadInFolder(id: string): Promise<boolean>');
  });

  it('shows a reloadable crash state for the active tab', () => {
    expect(appSource).toContain('activeTabCrashed');
    expect(appSource).toContain('className="browser-empty crashed-tab"');
    expect(appSource).toContain('标签页已崩溃');
    expect(appSource).toContain('重新载入');
    expect(styles).toContain('.crashed-tab');
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
    expect(appSource).toContain('国家 / 地区');
    expect(appSource).toContain('REGION_PRESETS.map');
    expect(appSource).toContain('applyFingerprintRegionPreset');
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
