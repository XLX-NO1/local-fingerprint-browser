import { app, BrowserView, BrowserWindow, ipcMain, Menu, nativeImage, session, Tray, webContents, type AuthInfo, type Event, type LoginAuthenticationResponseDetails } from 'electron';
import { join } from 'node:path';
import { BrowserLauncher, findChromiumPath } from './services/browserLauncher';
import { ProfileStore } from './services/profileStore';
import { SettingsStore } from './services/settingsStore';
import { checkProxyReachability } from './services/proxy';
import { proxyAuthForLogin } from './services/proxy';
import {
  buildEmbeddedCdpSetupCommands,
  buildEmbeddedBrowserViewPreferences,
  embeddedBrowserViewState,
  shouldRecreateEmbeddedBrowserView,
  writeEmbeddedFingerprintPreload,
} from './services/embeddedFingerprint';
import { configureProfileSession } from './services/embeddedSession';
import { NativeBrowserViewController, type NativeBrowserHost, type NativeBrowserViewLike } from './services/nativeBrowserViewController';
import { prepareSelfTestPage } from './services/selfTestPage';
import { buildNativeSelfTestCaptureScript, extractSelfTestReportFromExecutionResult, summarizeSelfTestReport } from './services/selfTestResult';
import type { AppSettings, BrowserNavigationState, BrowserProfile, CreateProfileInput, UpdateProfileInput } from '../src/types';
import { normalizeOpenUrl } from '../src/urlInput';
import {
  activateTabInProfile,
  closeTabInProfile,
  createBlankTab,
  openTabInProfile,
  openUrlInNewTab,
  toggleBookmarkInProfile,
  updateTabMetadataInProfile,
} from '../src/browserWorkspace';
import { computeFitPageZoom, measurePageScript, type FitSize } from '../src/webviewFit';
import { FIXED_BROWSER_ZOOM, computeWidthFitZoom, cssRectToBrowserViewBounds, type BrowserViewBounds } from '../src/nativeBrowserView';

let mainWindow: BrowserWindow | undefined;
let store: ProfileStore;
let settingsStore: SettingsStore;
let launcher: BrowserLauncher | undefined;
let extensionDir: string;
let tray: Tray | undefined;
let isQuitting = false;
let nativeBrowserMetadataTimer: NodeJS.Timeout | undefined;
let nativeBrowserWidthFitTimer: NodeJS.Timeout | undefined;
const nativeBrowserHandlerWebContents = new WeakSet<Electron.WebContents>();
const hiddenSelfTestWindows = new Set<BrowserWindow>();
const nativeBrowserController = new NativeBrowserViewController({
  createView: (profile) => new BrowserView({
    webPreferences: buildEmbeddedBrowserViewPreferences(profile),
  }),
  prepareProfileSession: configureEmbeddedSession,
  shouldRecreateView: shouldRecreateEmbeddedBrowserView,
  viewState: embeddedBrowserViewState,
  onViewCreated: async (view, profile) => {
    const electronView = view as BrowserView;
    attachNativeBrowserProxyAuth(electronView, profile);
    attachNativeBrowserTabHandlers(electronView);
    await applyNativeBrowserFingerprint(electronView, profile);
  },
  toNativeBounds: cssRectToBrowserViewBounds,
  isNavigationAbort,
});

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#080c0a',
    title: 'Local Fingerprint Browser',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    if (!String(params.partition ?? '').startsWith('persist:profile-')) {
      event.preventDefault();
      return;
    }
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
  });

  (mainWindow as BrowserWindow & { on(event: 'minimize', listener: (event: Event) => void): BrowserWindow }).on('minimize', (event: Event) => {
    event.preventDefault();
    setTimeout(hideMainWindowToTray, 0);
  });

  mainWindow.on('close', (event) => {
    if (isQuitting) {
      return;
    }
    event.preventDefault();
    hideMainWindowToTray();
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, '../../dist/index.html'));
  }
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  }
  if (mainWindow?.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow?.show();
  mainWindow?.focus();
}

function hideMainWindowToTray(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.hide();
}

function createAppTrayIcon(): Electron.NativeImage {
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'tray-icon-white.png')
    : join(app.getAppPath(), 'assets/tray-icon-white.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 });
  icon.setTemplateImage(false);
  return icon;
}

function createTray(): void {
  if (tray) {
    return;
  }
  tray = new Tray(createAppTrayIcon());
  tray.setToolTip('Local Fingerprint Browser');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示主窗口', click: showMainWindow },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]));
  tray.on('click', showMainWindow);
}

function notifyProfilesChanged(): void {
  mainWindow?.webContents.send('profiles:changed');
}

function resetNativeBrowserZoom(): void {
  const nativeBrowserView = currentNativeBrowserView();
  if (!nativeBrowserView || nativeBrowserView.webContents.isDestroyed()) {
    return;
  }
  nativeBrowserView.webContents.setZoomLevel(0);
  nativeBrowserView.webContents.setZoomFactor(FIXED_BROWSER_ZOOM);
}

async function fitNativeBrowserWidth(): Promise<void> {
  const nativeBrowserView = currentNativeBrowserView();
  const nativeBrowserBounds = nativeBrowserController.currentBounds();
  if (!nativeBrowserView || !nativeBrowserBounds || nativeBrowserView.webContents.isDestroyed()) {
    return;
  }
  const content = await nativeBrowserView.webContents.executeJavaScript(measurePageScript(), true) as FitSize;
  if (!nativeBrowserView || nativeBrowserView.webContents.isDestroyed()) {
    return;
  }
  const zoom = computeWidthFitZoom(nativeBrowserBounds, content);
  nativeBrowserView.webContents.setZoomLevel(0);
  nativeBrowserView.webContents.setZoomFactor(zoom);
}

function scheduleNativeBrowserWidthFit(delayMs = 120): void {
  if (nativeBrowserWidthFitTimer) {
    clearTimeout(nativeBrowserWidthFitTimer);
  }
  nativeBrowserWidthFitTimer = setTimeout(() => {
    nativeBrowserWidthFitTimer = undefined;
    void fitNativeBrowserWidth().catch(() => resetNativeBrowserZoom());
  }, delayMs);
}

function scheduleNativeBrowserMetadataUpdate(view: BrowserView, url?: string): void {
  if (nativeBrowserMetadataTimer) {
    clearTimeout(nativeBrowserMetadataTimer);
  }
  nativeBrowserMetadataTimer = setTimeout(() => {
    void updateNativeBrowserTabMetadata(view, url).catch(() => undefined);
  }, 120);
}

function updateNativeBrowserNavigationState(view: BrowserView, patch: Partial<Omit<BrowserNavigationState, 'profileId' | 'tabId'>> = {}): void {
  const state = nativeBrowserController.updateNavigationStateForView(view, patch);
  if (state) {
    notifyProfilesChanged();
  }
}

async function updateNativeBrowserTabMetadata(nativeBrowserView: BrowserView, url?: string): Promise<void> {
  const metadata = nativeBrowserController.metadataForView(nativeBrowserView);
  if (!metadata || nativeBrowserView.webContents.isDestroyed()) {
    return;
  }
  const nextUrl = url ?? nativeBrowserView.webContents.getURL();
  if (!nextUrl || nextUrl === 'about:blank') {
    return;
  }
  const profile = await store.get(metadata.profileId);
  const updated = updateTabMetadataInProfile(profile, metadata.tabId, {
    url: nextUrl,
    title: nativeBrowserView.webContents.getTitle(),
  });
  nativeBrowserController.updateNavigationStateForView(nativeBrowserView, {
    url: nextUrl,
    title: nativeBrowserView.webContents.getTitle(),
  });
  await store.update(profile.id, {
    tabs: updated.tabs,
    activeTabId: updated.activeTabId,
    lastOpenedUrl: updated.lastOpenedUrl,
  });
  notifyProfilesChanged();
}

async function openNativeBrowserPopupAsTab(url: string): Promise<void> {
  const nativeBrowserProfileId = nativeBrowserController.currentProfileId();
  if (!nativeBrowserProfileId || !url || url === 'about:blank') {
    return;
  }
  const profile = await store.get(nativeBrowserProfileId);
  const updated = openUrlInNewTab(profile, url);
  await store.update(profile.id, {
    tabs: updated.tabs,
    activeTabId: updated.activeTabId,
    lastOpenedUrl: updated.lastOpenedUrl,
    launchTrace: [...(profile.launchTrace ?? []), `embedded new tab ${url}`].slice(-12),
  });
  await store.recordHistory(profile.id, 'launched', `opened new tab ${url}`);
  notifyProfilesChanged();
}

function attachNativeBrowserTabHandlers(view: BrowserView): void {
  if (nativeBrowserHandlerWebContents.has(view.webContents)) {
    return;
  }
  nativeBrowserHandlerWebContents.add(view.webContents);
  view.webContents.setWindowOpenHandler(({ url }) => {
    void openNativeBrowserPopupAsTab(url).catch(() => undefined);
    return { action: 'deny' };
  });
  view.webContents.on('dom-ready', resetNativeBrowserZoom);
  view.webContents.on('dom-ready', () => scheduleNativeBrowserWidthFit(80));
  view.webContents.on('did-start-loading', () => updateNativeBrowserNavigationState(view, { isLoading: true, crashed: false, lastError: undefined }));
  view.webContents.on('did-finish-load', () => scheduleNativeBrowserWidthFit());
  view.webContents.on('did-stop-loading', () => {
    updateNativeBrowserNavigationState(view, { isLoading: false });
    scheduleNativeBrowserWidthFit();
  });
  view.webContents.on('did-navigate', (_event, url) => {
    updateNativeBrowserNavigationState(view, { url, isLoading: false, crashed: false, lastError: undefined });
    scheduleNativeBrowserMetadataUpdate(view, url);
  });
  view.webContents.on('did-navigate-in-page', (_event, url) => {
    updateNativeBrowserNavigationState(view, { url });
    scheduleNativeBrowserMetadataUpdate(view, url);
  });
  view.webContents.on('page-title-updated', () => {
    updateNativeBrowserNavigationState(view, { title: view.webContents.getTitle() });
    scheduleNativeBrowserMetadataUpdate(view);
  });
  view.webContents.on('did-fail-load', (_event, _errorCode, errorDescription, validatedURL) => {
    updateNativeBrowserNavigationState(view, {
      isLoading: false,
      lastError: `${errorDescription}${validatedURL ? `: ${validatedURL}` : ''}`,
    });
  });
  view.webContents.on('render-process-gone', (_event, details) => {
    updateNativeBrowserNavigationState(view, {
      isLoading: false,
      crashed: true,
      lastError: `render-process-gone: ${details.reason}`,
    });
  });
  view.webContents.on('did-finish-load', () => {
    void captureNativeSelfTestResult().catch(() => undefined);
  });
}

function disposeNativeBrowserView(): void {
  const host = currentNativeBrowserHost();
  if (host) {
    nativeBrowserController.dispose(host);
  }
}

function disposeNativeBrowserProfileViews(profileId: string): void {
  const host = currentNativeBrowserHost();
  if (host) {
    nativeBrowserController.disposeProfile(host, profileId);
  }
}

function detachNativeBrowserView(): void {
  if (nativeBrowserMetadataTimer) {
    clearTimeout(nativeBrowserMetadataTimer);
    nativeBrowserMetadataTimer = undefined;
  }
  if (nativeBrowserWidthFitTimer) {
    clearTimeout(nativeBrowserWidthFitTimer);
    nativeBrowserWidthFitTimer = undefined;
  }
  const host = currentNativeBrowserHost();
  if (host) {
    nativeBrowserController.detach(host);
  }
}

app.on('before-quit', () => {
  isQuitting = true;
  disposeHiddenSelfTestView();
  detachNativeBrowserView();
  tray?.destroy();
  tray = undefined;
});

async function captureNativeSelfTestResult(): Promise<void> {
  const nativeBrowserView = currentNativeBrowserView();
  const nativeBrowserProfileId = nativeBrowserController.currentProfileId();
  if (!nativeBrowserView || !nativeBrowserProfileId || nativeBrowserView.webContents.isDestroyed()) {
    return;
  }
  const url = nativeBrowserView.webContents.getURL();
  const profile = await store.get(nativeBrowserProfileId);
  if (!profile.selfTestUrl || url !== profile.selfTestUrl) {
    return;
  }
  const rawResult = await nativeBrowserView.webContents.executeJavaScript(buildNativeSelfTestCaptureScript(), true);
  const report = extractSelfTestReportFromExecutionResult(rawResult);
  const summary = summarizeSelfTestReport(report);
  if (!report || !summary) {
    return;
  }
  await store.update(profile.id, {
    selfTestReport: report,
    selfTestSummary: summary,
    launchTrace: [...(profile.launchTrace ?? []), `embedded self-test completed: ${summary}`].slice(-12),
  });
  notifyProfilesChanged();
}

function disposeHiddenSelfTestView(): void {
  for (const hiddenWindow of hiddenSelfTestWindows) {
    if (!hiddenWindow.isDestroyed()) {
      hiddenWindow.close();
    }
  }
  hiddenSelfTestWindows.clear();
}

async function runHiddenSelfTestCapture(profile: BrowserProfile, selfTestUrl: string): Promise<{ report?: Record<string, unknown>; summary?: string }> {
  await configureEmbeddedSession(profile);
  const selfTestWindow = new BrowserWindow({
    show: false,
    width: profile.fingerprint.windowWidth,
    height: profile.fingerprint.windowHeight,
    webPreferences: {
      ...buildEmbeddedBrowserViewPreferences(profile),
      backgroundThrottling: false,
    },
  });
  hiddenSelfTestWindows.add(selfTestWindow);
  selfTestWindow.on('closed', () => hiddenSelfTestWindows.delete(selfTestWindow));
  selfTestWindow.webContents.setUserAgent(profile.fingerprint.userAgent);
  attachNativeBrowserProxyAuth(selfTestWindow, profile);
  try {
    await loadUrlWithTimeout(selfTestWindow, selfTestUrl, 8000);
    const rawResult = await selfTestWindow.webContents.executeJavaScript(buildNativeSelfTestCaptureScript(10000), true);
    const report = extractSelfTestReportFromExecutionResult(rawResult);
    return {
      report,
      summary: summarizeSelfTestReport(report),
    };
  } finally {
    if (!selfTestWindow.isDestroyed()) {
      selfTestWindow.close();
    }
    hiddenSelfTestWindows.delete(selfTestWindow);
  }
}

async function loadUrlWithTimeout(window: BrowserWindow, url: string, timeoutMs: number): Promise<void> {
  await Promise.race([
    new Promise<void>((resolve, reject) => {
      window.webContents.once('did-finish-load', () => resolve());
      window.webContents.once('did-fail-load', (_event, _errorCode, errorDescription) => reject(new Error(errorDescription)));
      void window.webContents.loadURL(url).catch(reject);
    }),
    new Promise<void>((_resolve, reject) => {
      setTimeout(() => reject(new Error('Hidden fingerprint self-test load timed out.')), timeoutMs);
    }),
  ]);
}

function registerIpc(): void {
  ipcMain.handle('profiles:list', () => store.list());
  ipcMain.handle('profiles:create', (_event, input: CreateProfileInput) => store.create(input));
  ipcMain.handle('profiles:update', (_event, id: string, input: UpdateProfileInput) => store.update(id, input));
  ipcMain.handle('profiles:duplicate', (_event, id: string) => store.duplicate(id));
  ipcMain.handle('profiles:delete', async (_event, id: string) => {
    disposeNativeBrowserProfileViews(id);
    await store.delete(id);
  });
  ipcMain.handle('profiles:regenerate-fingerprint', async (_event, id: string) => {
    const updated = await store.regenerateFingerprint(id);
    disposeNativeBrowserProfileViews(id);
    notifyProfilesChanged();
    return updated;
  });
  ipcMain.handle('profiles:open-self-test', async (_event, id: string) => {
    const profile = await store.get(id);
    const page = await prepareSelfTestPage(profile);
    const workspace = openTabInProfile(profile, page.fileUrl);
    const updated = await store.update(id, {
      tabs: workspace.tabs,
      activeTabId: workspace.activeTabId,
      lastOpenedUrl: workspace.lastOpenedUrl,
      selfTestUrl: page.fileUrl,
      selfTestSummary: undefined,
      selfTestReport: undefined,
      launchTrace: [...(profile.launchTrace ?? []), 'embedded self-test opened'].slice(-12),
    });
    await store.recordHistory(id, 'launched', 'opened embedded fingerprint self-test');
    notifyProfilesChanged();
    void runHiddenSelfTestCapture(updated, page.fileUrl)
      .then(async ({ report, summary }) => {
        const current = await store.get(id);
        if (current.selfTestUrl !== page.fileUrl) {
          return;
        }
        if (!report || !summary) {
          await store.update(id, {
            selfTestSummary: 'self-test capture timed out',
            lastError: 'Hidden fingerprint self-test did not return a result before timeout.',
            launchTrace: [...(current.launchTrace ?? []), 'embedded self-test timed out'].slice(-12),
          });
          notifyProfilesChanged();
          return;
        }
        await store.update(id, {
          selfTestReport: report,
          selfTestSummary: summary,
          launchTrace: [...(current.launchTrace ?? []), `embedded self-test completed: ${summary}`].slice(-12),
        });
        notifyProfilesChanged();
      })
      .catch(async (caught) => {
        const current = await store.get(id);
        if (current.selfTestUrl !== page.fileUrl) {
          return;
        }
        await store.update(id, {
          selfTestSummary: 'self-test failed',
          lastError: caught instanceof Error ? caught.message : String(caught),
          launchTrace: [...(current.launchTrace ?? []), 'embedded self-test failed'].slice(-12),
        });
        notifyProfilesChanged();
      });
    return updated;
  });
  ipcMain.handle('profiles:launch', async (_event, id: string) => {
    if (!launcher) {
      throw new Error('Chrome or Chromium was not found. Install Chrome or configure a browser path.');
    }
    const profile = await store.get(id);
    const result = await launcher.launch(profile);
    await store.update(id, {
      status: result.automationStatus === 'attached' ? 'running' : 'warning',
      pid: result.pid,
      lastLaunchAt: new Date().toISOString(),
      lastError: result.automationError,
      selfTestUrl: result.selfTestUrl,
      selfTestSummary: result.selfTestSummary,
      selfTestReport: result.selfTestReport,
      launchTrace: result.launchTrace,
    });
    await store.recordHistory(
      id,
      result.automationStatus === 'attached' ? 'launched' : 'error',
      result.automationStatus === 'attached' ? `browser launched pid ${result.pid}` : `automation degraded: ${result.automationError}`,
    );
    return result;
  });
  ipcMain.handle('profiles:open-url', async (_event, id: string, rawUrl: string) => {
    const url = normalizeOpenUrl(rawUrl);
    const profile = await store.get(id);
    await configureEmbeddedSession(profile);
    const workspace = openTabInProfile(profile, url);
    const updated = await store.update(id, {
      tabs: workspace.tabs,
      activeTabId: workspace.activeTabId,
      lastOpenedUrl: workspace.lastOpenedUrl,
      lastError: undefined,
      launchTrace: [...(profile.launchTrace ?? []), `embedded open ${url}`].slice(-12),
    });
    await store.recordHistory(id, 'launched', `opened ${url}`);
    return updated;
  });
  ipcMain.handle('profiles:create-tab', async (_event, id: string, rawUrl?: string) => {
    const profile = await store.get(id);
    const updated = createBlankTab(profile, rawUrl || 'about:blank');
    await configureEmbeddedSession(updated);
    return store.update(id, updated);
  });
  ipcMain.handle('profiles:activate-tab', async (_event, id: string, tabId: string) => {
    const profile = await store.get(id);
    return store.update(id, activateTabInProfile(profile, tabId));
  });
  ipcMain.handle('profiles:close-tab', async (_event, id: string, tabId: string) => {
    const profile = await store.get(id);
    const host = currentNativeBrowserHost();
    if (host) {
      nativeBrowserController.disposeTab(host, tabId);
    }
    return store.update(id, closeTabInProfile(profile, tabId));
  });
  ipcMain.handle('profiles:toggle-bookmark', async (_event, id: string) => {
    const profile = await store.get(id);
    return store.update(id, toggleBookmarkInProfile(profile));
  });
  ipcMain.handle('webview:fit-page', async (_event, webContentsId: number, viewport: FitSize) => {
    const target = webContents.fromId(webContentsId);
    if (!target) {
      return 1;
    }
    const content = await target.executeJavaScript(measurePageScript(), true) as FitSize;
    const zoom = computeFitPageZoom(viewport, content);
    target.setZoomFactor(zoom);
    return zoom;
  });
  ipcMain.handle('native-browser:show', async (_event, profileId: string, tabId: string, url: string, bounds: BrowserViewBounds) => {
    if (!mainWindow) {
      return;
    }
    const profile = await store.get(profileId);
    const host = currentNativeBrowserHost(mainWindow);
    if (!host) {
      return;
    }
    await nativeBrowserController.show(host, profile, tabId, url, bounds);
    resetNativeBrowserZoom();
    scheduleNativeBrowserWidthFit(80);
  });
  ipcMain.handle('native-browser:resize', (_event, bounds: BrowserViewBounds) => {
    nativeBrowserController.resize(bounds);
    resetNativeBrowserZoom();
    scheduleNativeBrowserWidthFit();
  });
  ipcMain.handle('native-browser:hide', () => {
    if (nativeBrowserMetadataTimer) {
      clearTimeout(nativeBrowserMetadataTimer);
      nativeBrowserMetadataTimer = undefined;
    }
    if (nativeBrowserWidthFitTimer) {
      clearTimeout(nativeBrowserWidthFitTimer);
      nativeBrowserWidthFitTimer = undefined;
    }
    const host = currentNativeBrowserHost();
    if (host) {
      nativeBrowserController.hide(host);
    }
  });
  ipcMain.handle('native-browser:navigation-state', (_event, profileId: string, tabId: string) => {
    const state = nativeBrowserController.navigationStateForTab(tabId);
    return state?.profileId === profileId ? state : undefined;
  });
  ipcMain.handle('native-browser:go-back', () => {
    nativeBrowserController.goBack();
  });
  ipcMain.handle('native-browser:go-forward', () => {
    nativeBrowserController.goForward();
  });
  ipcMain.handle('native-browser:reload', () => {
    nativeBrowserController.reload();
  });
  ipcMain.handle('profiles:stop', async (_event, id: string) => {
    await launcher?.stop(id);
    await store.update(id, { status: 'idle', pid: undefined });
    await store.recordHistory(id, 'stopped', 'browser stopped from UI');
  });
  ipcMain.handle('profiles:check-proxy', async (_event, id: string) => {
    const profile = await store.get(id);
    if (!profile.proxy) {
      return store.update(id, { lastError: 'No proxy configured' });
    }
    const result = await checkProxyReachability(profile.proxy);
    const updated = await store.update(id, {
      proxy: {
        ...profile.proxy,
        lastCheckStatus: result.status,
        lastCheckLatencyMs: result.latencyMs,
        updatedAt: new Date().toISOString(),
      },
      lastError: result.status === 'failed' ? result.error : undefined,
    });
    await store.recordHistory(id, 'proxy-check', result.status === 'ok' ? `proxy reachable in ${result.latencyMs}ms` : `proxy failed: ${result.error}`);
    return updated;
  });
  ipcMain.handle('settings:get', async () => ({
    ...(await settingsStore.get()),
    detectedChromiumPath: findChromiumPath(),
  }));
  ipcMain.handle('settings:update', async (_event, input: AppSettings) => {
    const settings = await settingsStore.update(input);
    const chromiumPath = settings.chromiumPath || findChromiumPath();
    launcher = chromiumPath ? new BrowserLauncher(chromiumPath, extensionDir) : undefined;
    return settings;
  });
}

async function configureEmbeddedSession(profile: BrowserProfile): Promise<void> {
  const partition = `persist:profile-${profile.id}`;
  const profileSession = session.fromPartition(partition);
  await writeEmbeddedFingerprintPreload(profile);
  await configureProfileSession(profileSession, profile);
}

async function applyNativeBrowserFingerprint(nativeBrowserView: BrowserView, profile: BrowserProfile): Promise<void> {
  if (!nativeBrowserView || nativeBrowserView.webContents.isDestroyed()) {
    return;
  }
  const debuggee = nativeBrowserView.webContents.debugger;
  if (!debuggee.isAttached()) {
    debuggee.attach('1.3');
  }
  for (const command of buildEmbeddedCdpSetupCommands(profile)) {
    await debuggee.sendCommand(command.method, command.params);
  }
}

function currentNativeBrowserView(): BrowserView | undefined {
  return nativeBrowserController.currentView() as BrowserView | undefined;
}

function currentNativeBrowserHost(window = mainWindow): NativeBrowserHost | undefined {
  if (!window) {
    return undefined;
  }
  return {
    addBrowserView: (view: NativeBrowserViewLike) => window.addBrowserView(view as BrowserView),
    removeBrowserView: (view: NativeBrowserViewLike) => window.removeBrowserView(view as BrowserView),
  };
}

function attachNativeBrowserProxyAuth(view: BrowserView | BrowserWindow, profile: BrowserProfile): void {
  view.webContents.on(
    'login',
    (
      event: Event,
      _details: LoginAuthenticationResponseDetails,
      authInfo: AuthInfo,
      callback: (username?: string, password?: string) => void,
    ) => {
      if (!authInfo.isProxy) {
        callback();
        return;
      }
      const credentials = profile.proxy ? proxyAuthForLogin(profile.proxy) : undefined;
      if (!credentials) {
        callback();
        return;
      }
      event.preventDefault();
      callback(credentials.username, credentials.password);
    },
  );
}

function isNavigationAbort(caught: unknown): boolean {
  return Boolean(
    (caught instanceof Error && caught.message.includes('ERR_ABORTED'))
    || (typeof caught === 'object' && caught !== null && 'errno' in caught && caught.errno === -3),
  );
}

app.whenReady().then(async () => {
  const dataDir = join(app.getPath('userData'), 'app-data');
  extensionDir = join(app.getAppPath(), 'fingerprint-extension');
  store = new ProfileStore(dataDir);
  await store.reconcileRuntimeState();
  settingsStore = new SettingsStore(dataDir);
  const settings = await settingsStore.get();
  const chromiumPath = settings.chromiumPath || findChromiumPath();
  launcher = chromiumPath ? new BrowserLauncher(chromiumPath, extensionDir) : undefined;
  registerIpc();
  createTray();
  createWindow();

  app.on('activate', () => {
    showMainWindow();
  });

  app.on('did-become-active', () => {
    if (mainWindow && !mainWindow.isVisible()) {
      showMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (isQuitting && process.platform !== 'darwin') {
    app.quit();
  }
});
