import { app, BrowserView, BrowserWindow, ipcMain, session, webContents, type AuthInfo, type Event, type LoginAuthenticationResponseDetails } from 'electron';
import { join } from 'node:path';
import { BrowserLauncher, findChromiumPath } from './services/browserLauncher';
import { ProfileStore } from './services/profileStore';
import { SettingsStore } from './services/settingsStore';
import { checkProxyReachability } from './services/proxy';
import { proxyAuthForLogin, proxyToChromiumUrl } from './services/proxy';
import {
  buildEmbeddedCdpSetupCommands,
  buildAcceptLanguageHeader,
  buildEmbeddedBrowserViewPreferences,
  embeddedBrowserViewState,
  shouldRecreateEmbeddedBrowserView,
  type EmbeddedBrowserViewState,
  writeEmbeddedFingerprintPreload,
} from './services/embeddedFingerprint';
import { prepareSelfTestPage } from './services/selfTestPage';
import { buildNativeSelfTestCaptureScript, extractSelfTestReportFromExecutionResult, summarizeSelfTestReport } from './services/selfTestResult';
import type { AppSettings, BrowserProfile, CreateProfileInput, UpdateProfileInput } from '../src/types';
import { normalizeOpenUrl } from '../src/urlInput';
import {
  activateTabInProfile,
  closeTabInProfile,
  createBlankTab,
  openTabInProfile,
  openUrlInNewTab,
  toggleBookmarkInProfile,
  updateActiveTabMetadata,
} from '../src/browserWorkspace';
import { computeFitPageZoom, measurePageScript, type FitSize } from '../src/webviewFit';
import { FIXED_BROWSER_ZOOM, cssRectToBrowserViewBounds, type BrowserViewBounds } from '../src/nativeBrowserView';

let mainWindow: BrowserWindow | undefined;
let store: ProfileStore;
let settingsStore: SettingsStore;
let launcher: BrowserLauncher | undefined;
let extensionDir: string;
let nativeBrowserView: BrowserView | undefined;
let nativeBrowserProfileId: string | undefined;
let nativeBrowserBounds: BrowserViewBounds | undefined;
let nativeBrowserAttached = false;
let nativeBrowserMetadataTimer: NodeJS.Timeout | undefined;
let nativeBrowserState: EmbeddedBrowserViewState = {};

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

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, '../../dist/index.html'));
  }
}

function notifyProfilesChanged(): void {
  mainWindow?.webContents.send('profiles:changed');
}

function resetNativeBrowserZoom(): void {
  if (!nativeBrowserView || nativeBrowserView.webContents.isDestroyed()) {
    return;
  }
  nativeBrowserView.webContents.setZoomLevel(0);
  nativeBrowserView.webContents.setZoomFactor(FIXED_BROWSER_ZOOM);
}

function scheduleNativeBrowserMetadataUpdate(url?: string): void {
  if (nativeBrowserMetadataTimer) {
    clearTimeout(nativeBrowserMetadataTimer);
  }
  nativeBrowserMetadataTimer = setTimeout(() => {
    void updateNativeBrowserActiveTab(url).catch(() => undefined);
  }, 120);
}

async function updateNativeBrowserActiveTab(url?: string): Promise<void> {
  if (!nativeBrowserView || !nativeBrowserProfileId || nativeBrowserView.webContents.isDestroyed()) {
    return;
  }
  const nextUrl = url ?? nativeBrowserView.webContents.getURL();
  if (!nextUrl || nextUrl === 'about:blank') {
    return;
  }
  const profile = await store.get(nativeBrowserProfileId);
  const updated = updateActiveTabMetadata(profile, {
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
  view.webContents.setWindowOpenHandler(({ url }) => {
    void openNativeBrowserPopupAsTab(url).catch(() => undefined);
    return { action: 'deny' };
  });
  view.webContents.on('dom-ready', resetNativeBrowserZoom);
  view.webContents.on('did-finish-load', resetNativeBrowserZoom);
  view.webContents.on('did-stop-loading', resetNativeBrowserZoom);
  view.webContents.on('did-navigate', (_event, url) => scheduleNativeBrowserMetadataUpdate(url));
  view.webContents.on('did-navigate-in-page', (_event, url) => scheduleNativeBrowserMetadataUpdate(url));
  view.webContents.on('page-title-updated', () => scheduleNativeBrowserMetadataUpdate());
  view.webContents.on('did-finish-load', () => {
    void captureNativeSelfTestResult().catch(() => undefined);
  });
}

function disposeNativeBrowserView(): void {
  if (nativeBrowserMetadataTimer) {
    clearTimeout(nativeBrowserMetadataTimer);
    nativeBrowserMetadataTimer = undefined;
  }
  if (mainWindow && nativeBrowserView && nativeBrowserAttached) {
    mainWindow.removeBrowserView(nativeBrowserView);
  }
  if (nativeBrowserView && !nativeBrowserView.webContents.isDestroyed()) {
    nativeBrowserView.webContents.close();
  }
  nativeBrowserView = undefined;
  nativeBrowserProfileId = undefined;
  nativeBrowserState = {};
  nativeBrowserAttached = false;
}

async function captureNativeSelfTestResult(): Promise<void> {
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

function registerIpc(): void {
  ipcMain.handle('profiles:list', () => store.list());
  ipcMain.handle('profiles:create', (_event, input: CreateProfileInput) => store.create(input));
  ipcMain.handle('profiles:update', (_event, id: string, input: UpdateProfileInput) => store.update(id, input));
  ipcMain.handle('profiles:duplicate', (_event, id: string) => store.duplicate(id));
  ipcMain.handle('profiles:delete', (_event, id: string) => store.delete(id));
  ipcMain.handle('profiles:regenerate-fingerprint', async (_event, id: string) => {
    const updated = await store.regenerateFingerprint(id);
    if (nativeBrowserProfileId === id) {
      disposeNativeBrowserView();
    }
    notifyProfilesChanged();
    return updated;
  });
  ipcMain.handle('profiles:open-self-test', async (_event, id: string) => {
    const profile = await store.get(id);
    const page = await prepareSelfTestPage(profile);
    await configureEmbeddedSession(profile);
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
    const updated = createBlankTab(profile, rawUrl || 'https://example.com');
    await configureEmbeddedSession(updated);
    return store.update(id, updated);
  });
  ipcMain.handle('profiles:activate-tab', async (_event, id: string, tabId: string) => {
    const profile = await store.get(id);
    return store.update(id, activateTabInProfile(profile, tabId));
  });
  ipcMain.handle('profiles:close-tab', async (_event, id: string, tabId: string) => {
    const profile = await store.get(id);
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
  ipcMain.handle('native-browser:show', async (_event, profileId: string, url: string, bounds: BrowserViewBounds) => {
    if (!mainWindow) {
      return;
    }
    const profile = await store.get(profileId);
    await configureEmbeddedSession(profile);
    await writeEmbeddedFingerprintPreload(profile);
    if (!nativeBrowserView || shouldRecreateEmbeddedBrowserView(nativeBrowserState, profile)) {
      disposeNativeBrowserView();
      nativeBrowserView = new BrowserView({
        webPreferences: buildEmbeddedBrowserViewPreferences(profile),
      });
      nativeBrowserProfileId = profile.id;
      nativeBrowserState = embeddedBrowserViewState(profile);
      nativeBrowserView.webContents.setUserAgent(profile.fingerprint.userAgent);
      attachNativeBrowserProxyAuth(nativeBrowserView, profile);
      attachNativeBrowserTabHandlers(nativeBrowserView);
      await applyNativeBrowserFingerprint(profile);
    }
    if (!nativeBrowserAttached) {
      mainWindow.addBrowserView(nativeBrowserView);
      nativeBrowserAttached = true;
    }
    nativeBrowserBounds = cssRectToBrowserViewBounds(bounds);
    nativeBrowserView.setBounds(nativeBrowserBounds);
    nativeBrowserView.setAutoResize({ width: false, height: false });
    resetNativeBrowserZoom();
    if (nativeBrowserView.webContents.getURL() !== url) {
      try {
        await nativeBrowserView.webContents.loadURL(url);
      } catch (caught) {
        if (!isNavigationAbort(caught)) {
          throw caught;
        }
      }
    }
  });
  ipcMain.handle('native-browser:resize', (_event, bounds: BrowserViewBounds) => {
    nativeBrowserBounds = cssRectToBrowserViewBounds(bounds);
    nativeBrowserView?.setBounds(nativeBrowserBounds);
    resetNativeBrowserZoom();
  });
  ipcMain.handle('native-browser:hide', () => {
    if (nativeBrowserMetadataTimer) {
      clearTimeout(nativeBrowserMetadataTimer);
      nativeBrowserMetadataTimer = undefined;
    }
    if (mainWindow && nativeBrowserView) {
      mainWindow.removeBrowserView(nativeBrowserView);
      nativeBrowserAttached = false;
    }
  });
  ipcMain.handle('native-browser:go-back', () => {
    if (nativeBrowserView?.webContents.canGoBack()) {
      nativeBrowserView.webContents.goBack();
    }
  });
  ipcMain.handle('native-browser:go-forward', () => {
    if (nativeBrowserView?.webContents.canGoForward()) {
      nativeBrowserView.webContents.goForward();
    }
  });
  ipcMain.handle('native-browser:reload', () => {
    nativeBrowserView?.webContents.reload();
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
  if (profile.proxy) {
    await profileSession.setProxy({
      mode: 'fixed_servers',
      proxyRules: proxyToChromiumUrl(profile.proxy),
      proxyBypassRules: '<-loopback>',
    });
  } else {
    await profileSession.setProxy({ mode: 'direct' });
  }
  profileSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  const acceptLanguage = buildAcceptLanguageHeader(profile.fingerprint.languages);
  profileSession.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({
      requestHeaders: {
        ...details.requestHeaders,
        'Accept-Language': acceptLanguage,
      },
    });
  });
}

async function applyNativeBrowserFingerprint(profile: BrowserProfile): Promise<void> {
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

function attachNativeBrowserProxyAuth(view: BrowserView, profile: BrowserProfile): void {
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
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
