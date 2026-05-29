import { app, BrowserView, BrowserWindow, ipcMain, Menu, nativeImage, session, shell, Tray, webContents, WebContentsView, type AuthInfo, type Event, type LoginAuthenticationResponseDetails, type Session } from 'electron';
import { join } from 'node:path';
import { BrowserLauncher, findChromiumPath } from './services/browserLauncher';
import { ProfileStore } from './services/profileStore';
import { SettingsStore, normalizeBrowserZoomFactor, readStartupDisableIpv6 } from './services/settingsStore';
import { DownloadController } from './services/downloadController';
import { certificateDecisionForError, navigationDecisionForUrl } from './services/navigationPolicy';
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
import { browserPageViewModeFromEnv, type BrowserPageViewMode } from './services/browserPageViewMode';
import { BrowserViewPageHost, BrowserViewPageView } from './services/browserViewPageView';
import { WebContentsViewPageHost, WebContentsViewPageView } from './services/webContentsViewPageView';
import { prepareSelfTestPage } from './services/selfTestPage';
import { buildNativeSelfTestCaptureScript, extractSelfTestReportFromExecutionResult, summarizeSelfTestReport } from './services/selfTestResult';
import type { AppSettings, BrowserNavigationState, BrowserProfile, CreateProfileInput, EmbeddedWebviewNavigationInput, UpdateProfileInput } from '../src/types';
import { normalizeOpenUrl } from '../src/urlInput';
import {
  activateTabInProfile,
  closeTabInProfile,
  createBlankTab,
  openTabInProfile,
  openUrlInNewTab,
  toggleBookmarkInProfile,
  updateTabMetadataInProfile,
  updateTabRuntimeStateInProfile,
} from '../src/browserWorkspace';
import { computeFitPageZoom, measurePageScript, type FitSize } from '../src/webviewFit';
import { cssRectToBrowserViewBounds, type BrowserViewBounds } from '../src/nativeBrowserView';

if (process.env.ELECTRON_BROWSER_SMOKE_USER_DATA_DIR) {
  app.setPath('userData', process.env.ELECTRON_BROWSER_SMOKE_USER_DATA_DIR);
}

const appDataDir = join(app.getPath('userData'), 'app-data');
const embeddedWebviewPreloads = new Map<string, string>();
const embeddedWebviewSessionProfileIds = new WeakMap<Session, string>();
const pendingEmbeddedWebviewProfileIds: string[] = [];
const embeddedWebviewHandlerWebContents = new WeakSet<Electron.WebContents>();
let startupWarning: string | undefined;

function configureChromiumNetworkPrivacy(disableIpv6 = readStartupDisableIpv6(appDataDir)): void {
  if (disableIpv6) {
    app.commandLine.appendSwitch('disable-ipv6');
  }
  app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', 'disable_non_proxied_udp');
}

configureChromiumNetworkPrivacy();

let mainWindow: BrowserWindow | undefined;
let store: ProfileStore;
let settingsStore: SettingsStore;
let launcher: BrowserLauncher | undefined;
let extensionDir: string;
let tray: Tray | undefined;
let isQuitting = false;
let nativeBrowserMetadataTimer: NodeJS.Timeout | undefined;
let nativeBrowserZoomFactor = 1;
let nativeBrowserLayoutVersion = 0;
const nativeBrowserHandlerWebContents = new WeakSet<Electron.WebContents>();
const hiddenSelfTestWindows = new Set<BrowserWindow>();
const downloadController = new DownloadController();
const downloadSessionPartitions = new Set<string>();
const browserPageViewMode = browserPageViewModeFromEnv(process.env);
const nativeBrowserController = new NativeBrowserViewController({
  createView: createNativeBrowserPageView,
  prepareProfileSession: configureEmbeddedSession,
  shouldRecreateView: shouldRecreateEmbeddedBrowserView,
  viewState: embeddedBrowserViewState,
  onViewCreated: async (view, profile) => {
    attachNativeBrowserProxyAuth(view, profile);
    attachNativeBrowserTabHandlers(view);
    await applyNativeBrowserFingerprintWithTimeout(view, profile);
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
    const profileId = profileIdFromEmbeddedPartition(String(params.partition ?? ''));
    const preload = profileId ? embeddedWebviewPreloads.get(profileId) : undefined;
    if (!profileId || !preload) {
      event.preventDefault();
      return;
    }
    pendingEmbeddedWebviewProfileIds.push(profileId);
    webPreferences.preload = preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
  });
  mainWindow.webContents.on('did-attach-webview', (_event, contents) => {
    attachEmbeddedWebviewHandlers(contents, pendingEmbeddedWebviewProfileIds.shift());
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
  mainWindow.webContents.on('certificate-error', (event, url, error, _certificate, callback) => {
    const decision = certificateDecisionForError(url, error);
    if (decision.action === 'block') {
      event.preventDefault();
      callback(false);
    }
  });

  if (process.env.ELECTRON_BROWSER_SMOKE === '1') {
    void mainWindow.loadURL('about:blank');
  } else if (isDev && process.env.VITE_DEV_SERVER_URL) {
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

function createNativeBrowserPageView(profile: BrowserProfile): NativeBrowserViewLike {
  const options = {
    webPreferences: buildEmbeddedBrowserViewPreferences(profile),
  };
  return browserPageViewMode === 'web-contents-view'
    ? new WebContentsViewPageView(new WebContentsView(options))
    : new BrowserViewPageView(new BrowserView(options));
}

function currentBrowserPageViewMode(): BrowserPageViewMode {
  return browserPageViewMode;
}

function electronWebContents(view: NativeBrowserViewLike): Electron.WebContents {
  return view.webContents as Electron.WebContents;
}

function resetNativeBrowserZoom(): void {
  const nativeBrowserView = currentNativeBrowserView();
  if (!nativeBrowserView || nativeBrowserView.webContents.isDestroyed()) {
    return;
  }
  const contents = electronWebContents(nativeBrowserView);
  contents.setZoomLevel(0);
  contents.setZoomFactor(nativeBrowserZoomFactor);
}

function shouldIgnoreStaleNativeBrowserBounds(bounds: BrowserViewBounds): boolean {
  const layoutVersion = bounds.layoutVersion ?? nativeBrowserLayoutVersion;
  if (layoutVersion < nativeBrowserLayoutVersion) {
    return true;
  }
  nativeBrowserLayoutVersion = layoutVersion;
  return false;
}

function scheduleNativeBrowserMetadataUpdate(view: NativeBrowserViewLike, url?: string): void {
  if (nativeBrowserMetadataTimer) {
    clearTimeout(nativeBrowserMetadataTimer);
  }
  nativeBrowserMetadataTimer = setTimeout(() => {
    void updateNativeBrowserTabMetadata(view, url).catch(() => undefined);
  }, 120);
}

function updateNativeBrowserNavigationState(view: NativeBrowserViewLike, patch: Partial<Omit<BrowserNavigationState, 'profileId' | 'tabId'>> = {}): void {
  const state = nativeBrowserController.updateNavigationStateForView(view, patch);
  if (state) {
    void persistNativeBrowserRuntimeState(state).catch(() => undefined);
    notifyProfilesChanged();
  }
}

async function persistNativeBrowserRuntimeState(state: BrowserNavigationState): Promise<void> {
  const profile = await store.get(state.profileId);
  const updated = updateTabRuntimeStateInProfile(profile, state.tabId, {
    canGoBack: state.canGoBack,
    canGoForward: state.canGoForward,
    isLoading: state.isLoading,
    crashed: state.crashed,
    lastError: state.lastError,
  });
  await store.update(profile.id, { tabs: updated.tabs });
}

async function updateNativeBrowserTabMetadata(nativeBrowserView: NativeBrowserViewLike, url?: string): Promise<void> {
  const metadata = nativeBrowserController.metadataForView(nativeBrowserView);
  if (!metadata || nativeBrowserView.webContents.isDestroyed()) {
    return;
  }
  const contents = electronWebContents(nativeBrowserView);
  const nextUrl = url ?? contents.getURL();
  if (!nextUrl || nextUrl === 'about:blank') {
    return;
  }
  const profile = await store.get(metadata.profileId);
  const updated = updateTabMetadataInProfile(profile, metadata.tabId, {
    url: nextUrl,
    title: contents.getTitle(),
  });
  nativeBrowserController.updateNavigationStateForView(nativeBrowserView, {
    url: nextUrl,
    title: contents.getTitle(),
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

function profileIdFromEmbeddedPartition(partition: string): string | undefined {
  const prefix = 'persist:profile-';
  return partition.startsWith(prefix) ? partition.slice(prefix.length) : undefined;
}

function embeddedNavigationDecisionForUrl(url: string) {
  try {
    return navigationDecisionForUrl(url);
  } catch {
    return { action: 'block' as const, reason: `Blocked invalid URL: ${url}` };
  }
}

async function prepareEmbeddedWebviewProfile(profile: BrowserProfile): Promise<void> {
  const preloadPath = await writeEmbeddedFingerprintPreload(profile);
  embeddedWebviewPreloads.set(profile.id, preloadPath);
  embeddedWebviewSessionProfileIds.set(session.fromPartition(`persist:profile-${profile.id}`), profile.id);
  await configureEmbeddedSession(profile);
}

function attachEmbeddedWebviewHandlers(contents: Electron.WebContents, attachedProfileId?: string): void {
  if (embeddedWebviewHandlerWebContents.has(contents)) {
    return;
  }
  embeddedWebviewHandlerWebContents.add(contents);
  const profileId = attachedProfileId ?? embeddedWebviewSessionProfileIds.get(contents.session);
  if (!profileId) {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (event) => {
      event.preventDefault();
    });
    return;
  }

  contents.setWindowOpenHandler(({ url }) => {
    const decision = embeddedNavigationDecisionForUrl(url);
    if (decision.action === 'allow') {
      void openEmbeddedWebviewPopupAsTab(profileId, url).catch((error: unknown) => {
        console.error(`embedded popup failed for ${profileId}: ${error instanceof Error ? error.message : String(error)}`);
      });
    } else {
      void updateEmbeddedWebviewActiveTabError(profileId, decision.reason).catch(() => undefined);
    }
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event) => {
    const url = event.url;
    const decision = embeddedNavigationDecisionForUrl(url);
    if (decision.action === 'block') {
      event.preventDefault();
      void updateEmbeddedWebviewActiveTabError(profileId, decision.reason).catch(() => undefined);
    }
  });
  contents.on('certificate-error', (event, url, error, _certificate, callback) => {
    const decision = certificateDecisionForError(url, error);
    if (decision.action === 'block') {
      event.preventDefault();
      void updateEmbeddedWebviewActiveTabError(profileId, decision.reason).catch(() => undefined);
      callback(false);
    }
  });
}

async function updateEmbeddedWebviewActiveTabError(profileId: string, lastError?: string): Promise<BrowserProfile> {
  const profile = await store.get(profileId);
  return updateEmbeddedWebviewProfileNavigation(profileId, profile.activeTabId ?? profileId, { lastError });
}

async function openEmbeddedWebviewPopupAsTab(profileId: string, rawUrl: string): Promise<BrowserProfile> {
  const decision = embeddedNavigationDecisionForUrl(rawUrl);
  if (decision.action === 'block') {
    return updateEmbeddedWebviewActiveTabError(profileId, decision.reason);
  }
  const profile = await store.get(profileId);
  const updatedWorkspace = openUrlInNewTab(profile, rawUrl);
  const updated = await store.update(profile.id, {
    tabs: updatedWorkspace.tabs,
    activeTabId: updatedWorkspace.activeTabId,
    lastOpenedUrl: updatedWorkspace.lastOpenedUrl,
    launchTrace: [...(profile.launchTrace ?? []), `embedded new tab ${rawUrl}`].slice(-12),
  });
  await store.recordHistory(profile.id, 'launched', `opened new tab ${rawUrl}`);
  notifyProfilesChanged();
  return updated;
}

function navigationStateFromEmbeddedInput(profile: BrowserProfile, tabId: string, input: EmbeddedWebviewNavigationInput): BrowserNavigationState {
  const tab = (profile.tabs ?? []).find((item) => item.id === tabId);
  const url = input.url ?? tab?.url ?? profile.lastOpenedUrl ?? 'about:blank';
  const title = input.title ?? tab?.title ?? url;
  return {
    profileId: profile.id,
    tabId,
    url,
    title,
    canGoBack: input.canGoBack ?? tab?.canGoBack ?? false,
    canGoForward: input.canGoForward ?? tab?.canGoForward ?? false,
    isLoading: input.isLoading ?? tab?.isLoading ?? false,
    crashed: input.crashed ?? tab?.crashed ?? false,
    lastError: input.lastError ?? tab?.lastError,
  };
}

async function updateEmbeddedWebviewProfileNavigation(
  profileId: string,
  tabId: string,
  input: EmbeddedWebviewNavigationInput,
): Promise<BrowserProfile> {
  const profile = await store.get(profileId);
  const state = navigationStateFromEmbeddedInput(profile, tabId, input);
  const withMetadata = updateTabMetadataInProfile(profile, tabId, {
    url: state.url,
    title: state.title,
  });
  const withRuntime = updateTabRuntimeStateInProfile(withMetadata, tabId, {
    canGoBack: state.canGoBack,
    canGoForward: state.canGoForward,
    isLoading: state.isLoading,
    crashed: state.crashed,
    lastError: state.lastError,
  });
  const updated = await store.update(profileId, {
    tabs: withRuntime.tabs,
    activeTabId: withRuntime.activeTabId,
    lastOpenedUrl: withRuntime.lastOpenedUrl,
    lastError: state.lastError,
  });
  return updated;
}

function attachNativeBrowserTabHandlers(view: NativeBrowserViewLike): void {
  const contents = electronWebContents(view);
  if (nativeBrowserHandlerWebContents.has(contents)) {
    return;
  }
  nativeBrowserHandlerWebContents.add(contents);
  contents.setWindowOpenHandler(({ url }) => {
    const decision = navigationDecisionForUrl(url);
    if (decision.action === 'allow') {
      void openNativeBrowserPopupAsTab(url).catch(() => undefined);
    } else {
      updateNativeBrowserNavigationState(view, { lastError: decision.reason });
    }
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    const decision = navigationDecisionForUrl(url);
    if (decision.action === 'block') {
      event.preventDefault();
      updateNativeBrowserNavigationState(view, { lastError: decision.reason });
    }
  });
  contents.on('certificate-error', (event, url, error, _certificate, callback) => {
    const decision = certificateDecisionForError(url, error);
    if (decision.action === 'block') {
      event.preventDefault();
      updateNativeBrowserNavigationState(view, { lastError: decision.reason });
      callback(false);
    }
  });
  contents.on('dom-ready', resetNativeBrowserZoom);
  contents.on('did-start-loading', () => updateNativeBrowserNavigationState(view, { isLoading: true, crashed: false, lastError: undefined }));
  contents.on('did-stop-loading', () => {
    updateNativeBrowserNavigationState(view, { isLoading: false });
    resetNativeBrowserZoom();
  });
  contents.on('did-navigate', (_event, url) => {
    updateNativeBrowserNavigationState(view, { url, isLoading: false, crashed: false, lastError: undefined });
    scheduleNativeBrowserMetadataUpdate(view, url);
  });
  contents.on('did-navigate-in-page', (_event, url) => {
    updateNativeBrowserNavigationState(view, { url });
    scheduleNativeBrowserMetadataUpdate(view, url);
  });
  contents.on('page-title-updated', () => {
    updateNativeBrowserNavigationState(view, { title: contents.getTitle() });
    scheduleNativeBrowserMetadataUpdate(view);
  });
  contents.on('did-fail-load', (_event, _errorCode, errorDescription, validatedURL) => {
    updateNativeBrowserNavigationState(view, {
      isLoading: false,
      lastError: `${errorDescription}${validatedURL ? `: ${validatedURL}` : ''}`,
    });
  });
  contents.on('render-process-gone', (_event, details) => {
    updateNativeBrowserNavigationState(view, {
      isLoading: false,
      crashed: true,
      lastError: `render-process-gone: ${details.reason}`,
    });
  });
  contents.on('did-finish-load', () => {
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
  const contents = electronWebContents(nativeBrowserView);
  const url = contents.getURL();
  const profile = await store.get(nativeBrowserProfileId);
  if (!profile.selfTestUrl || url !== profile.selfTestUrl) {
    return;
  }
  const rawResult = await contents.executeJavaScript(buildNativeSelfTestCaptureScript(), true);
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

async function runElectronBrowserSmoke(): Promise<Record<string, unknown>> {
  const smokeUrl = process.env.ELECTRON_BROWSER_SMOKE_URL;
  if (!smokeUrl) {
    throw new Error('ELECTRON_BROWSER_SMOKE_URL is required.');
  }
  if (!mainWindow) {
    throw new Error('Main window is not ready for browser smoke.');
  }
  console.log(`ELECTRON_BROWSER_SMOKE_STEP start ${currentBrowserPageViewMode()}`);
  mainWindow.show();
  mainWindow.focus();
  await delay(500);
  const profile = await store.create({
    name: `Smoke ${currentBrowserPageViewMode()}`,
    group: 'Smoke',
    notes: 'Electron browser smoke profile',
  });
  const workspace = createBlankTab(profile, smokeUrl);
  let currentProfile = await store.update(profile.id, {
    tabs: workspace.tabs,
    activeTabId: workspace.activeTabId,
    lastOpenedUrl: workspace.lastOpenedUrl,
  });
  const tabId = currentProfile.activeTabId;
  if (!tabId) {
    throw new Error('Smoke profile did not create an active tab.');
  }
  const host = currentNativeBrowserHost(mainWindow);
  if (!host) {
    throw new Error('Smoke native browser host is unavailable.');
  }
  console.log('ELECTRON_BROWSER_SMOKE_STEP open landing');
  startNativeBrowserShowForSmoke(host, currentProfile, tabId, smokeUrl, {
    x: 0,
    y: 0,
    width: 900,
    height: 620,
  });
  await waitForCurrentNativeUrl(smokeUrl, 8000);
  const landingTitle = electronWebContents(nativeBrowserController.currentView() as NativeBrowserViewLike).getTitle();

  console.log('ELECTRON_BROWSER_SMOKE_STEP target blank');
  await executeCurrentNativeJavaScript("document.querySelector('[data-smoke-target-blank]')?.click()");
  currentProfile = await waitForProfileTabCount(profile.id, 2, 5000);
  const popupOpenedInInternalTab = (currentProfile.tabs ?? []).some((tab) => tab.url.includes('/popup'));

  console.log('ELECTRON_BROWSER_SMOKE_STEP download');
  startNativeBrowserShowForSmoke(host, currentProfile, tabId, smokeUrl, {
    x: 0,
    y: 0,
    width: 900,
    height: 620,
  });
  await waitForCurrentNativeUrl(smokeUrl, 8000);
  await executeCurrentNativeJavaScript("document.querySelector('[data-smoke-download]')?.click()");
  const download = await waitForProfileDownload(profile.id, 5000);

  console.log('ELECTRON_BROWSER_SMOKE_STEP self-test');
  const selfTestPage = await prepareSelfTestPage(currentProfile);
  startNativeBrowserShowForSmoke(host, currentProfile, tabId, selfTestPage.fileUrl, {
    x: 0,
    y: 0,
    width: 900,
    height: 620,
  });
  await waitForCurrentNativeUrl(selfTestPage.fileUrl, 8000);

  return {
    mode: currentBrowserPageViewMode(),
    landingTitle,
    openedUrl: smokeUrl,
    popupOpenedInInternalTab,
    tabCount: currentProfile.tabs?.length ?? 0,
    downloadStatus: download.status,
    downloadFilename: download.filename,
    selfTestOpened: true,
  };
}

async function runElectronDomWebviewSmoke(): Promise<Record<string, unknown>> {
  const smokeUrl = process.env.ELECTRON_BROWSER_SMOKE_URL;
  if (!smokeUrl) {
    throw new Error('ELECTRON_BROWSER_SMOKE_URL is required.');
  }
  if (!mainWindow) {
    throw new Error('Main window is not ready for DOM webview smoke.');
  }
  console.log('ELECTRON_DOM_WEBVIEW_SMOKE_STEP start');
  mainWindow.show();
  mainWindow.focus();

  const profile = await store.create({
    name: 'DOM Webview Smoke',
    group: 'Smoke',
    notes: 'Electron DOM webview smoke profile',
  });
  await prepareEmbeddedWebviewProfile(profile);
  const workspace = createBlankTab(profile, smokeUrl);
  const currentProfile = await store.update(profile.id, {
    tabs: workspace.tabs,
    activeTabId: workspace.activeTabId,
    lastOpenedUrl: workspace.lastOpenedUrl,
  });
  const guestPromise = waitForEmbeddedWebview(smokeUrl, 8000);
  notifyProfilesChanged();

  const guest = await guestPromise;
  await waitForWebContentsTitle(guest, 'Smoke Landing', 8000);
  const landingTitle = guest.getTitle();
  guest.setWindowOpenHandler(({ url }) => {
    void openEmbeddedWebviewPopupAsTab(profile.id, url).catch(() => undefined);
    return { action: 'deny' };
  });

  const popupUrl = await guest.executeJavaScript("document.querySelector('[data-smoke-target-blank]')?.href", true) as string | undefined;
  if (!popupUrl) {
    throw new Error('DOM webview smoke popup link was not found.');
  }
  await openEmbeddedWebviewPopupAsTab(profile.id, popupUrl);
  const withPopup = await waitForProfileTabCount(profile.id, 2, 5000);
  const popupOpenedInInternalTab = (withPopup.tabs ?? []).some((tab) => tab.url.includes('/popup'));

  await guest.executeJavaScript("location.href = 'mailto:blocked@example.test'", true).catch(() => undefined);
  await delay(300);
  const afterBlockedNavigation = await store.get(profile.id);
  const externalProtocolBlocked = !(afterBlockedNavigation.lastOpenedUrl ?? '').startsWith('mailto:');

  await guest.executeJavaScript("history.pushState({}, '', '/in-page'); window.dispatchEvent(new PopStateEvent('popstate'))", true).catch(() => undefined);
  await delay(300);
  const afterInPage = await store.get(profile.id);
  const addressSynced = (afterInPage.lastOpenedUrl ?? '').includes('/in-page');

  return {
    mode: 'dom-webview',
    landingTitle,
    openedUrl: smokeUrl,
    popupOpenedInInternalTab,
    tabCount: withPopup.tabs?.length ?? 0,
    externalProtocolBlocked,
    addressSynced,
    selfTestOpened: Boolean(currentProfile.activeTabId),
  };
}

async function waitForEmbeddedWebview(expectedUrl: string, timeoutMs: number): Promise<Electron.WebContents> {
  const startedAt = Date.now();
  const attached: Electron.WebContents[] = [];
  const onAttached = (_event: Event, contents: Electron.WebContents) => {
    attached.push(contents);
  };
  mainWindow?.webContents.on('did-attach-webview', onAttached);
  try {
    while (Date.now() - startedAt < timeoutMs) {
      for (const contents of attached) {
        if (!contents.isDestroyed() && contents.getURL() === expectedUrl) {
          return contents;
        }
      }
      await delay(100);
    }
  } finally {
    mainWindow?.webContents.off('did-attach-webview', onAttached);
  }
  throw new Error(`Timed out waiting for DOM webview URL ${expectedUrl}.`);
}

async function waitForWebContentsTitle(contents: Electron.WebContents, expectedTitle: string, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!contents.isDestroyed() && contents.getTitle() === expectedTitle) {
      return;
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for DOM webview title ${expectedTitle}; last title was ${contents.isDestroyed() ? 'destroyed' : contents.getTitle()}.`);
}

async function executeCurrentNativeJavaScript(script: string): Promise<unknown> {
  const view = currentNativeBrowserView();
  if (!view || view.webContents.isDestroyed()) {
    throw new Error('No active native browser view for smoke script.');
  }
  return electronWebContents(view).executeJavaScript(script, true);
}

function startNativeBrowserShowForSmoke(host: NativeBrowserHost, profile: BrowserProfile, tabId: string, url: string, bounds: BrowserViewBounds): void {
  void nativeBrowserController.show(host, profile, tabId, url, bounds).catch((error: unknown) => {
    if (!isNavigationAbort(error)) {
      console.error(`ELECTRON_BROWSER_SMOKE_SHOW_ERROR ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

async function waitForCurrentNativeUrl(expectedUrl: string, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  let lastUrl = '';
  while (Date.now() - startedAt < timeoutMs) {
    const view = currentNativeBrowserView();
    const url = view && !view.webContents.isDestroyed() ? view.webContents.getURL() : '';
    lastUrl = url;
    if (url === expectedUrl) {
      return;
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for native browser URL ${expectedUrl}; last URL was ${lastUrl || 'none'}.`);
}

async function waitForProfileTabCount(profileId: string, count: number, timeoutMs: number): Promise<BrowserProfile> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const profile = await store.get(profileId);
    if ((profile.tabs ?? []).length >= count) {
      return profile;
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${count} smoke tabs.`);
}

async function waitForProfileDownload(profileId: string, timeoutMs: number) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const [download] = downloadController.list(profileId);
    if (download && download.status !== 'progressing') {
      return download;
    }
    await delay(100);
  }
  throw new Error('Timed out waiting for smoke download.');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      setTimeout(() => reject(new Error(`Timed out during ${label}.`)), timeoutMs);
    }),
  ]);
}

function registerIpc(): void {
  ipcMain.handle('profiles:list', async () => {
    const profiles = await store.list();
    await Promise.all(profiles.map((profile) => prepareEmbeddedWebviewProfile(profile).catch(() => undefined)));
    return profiles;
  });
  ipcMain.handle('profiles:create', async (_event, input: CreateProfileInput) => {
    const profile = await store.create(input);
    await prepareEmbeddedWebviewProfile(profile);
    return profile;
  });
  ipcMain.handle('profiles:update', async (_event, id: string, input: UpdateProfileInput) => {
    const profile = await store.update(id, input);
    await prepareEmbeddedWebviewProfile(profile);
    return profile;
  });
  ipcMain.handle('profiles:duplicate', async (_event, id: string) => {
    const profile = await store.duplicate(id);
    await prepareEmbeddedWebviewProfile(profile);
    return profile;
  });
  ipcMain.handle('profiles:delete', async (_event, id: string) => {
    disposeNativeBrowserProfileViews(id);
    await store.delete(id);
  });
  ipcMain.handle('profiles:regenerate-fingerprint', async (_event, id: string) => {
    const updated = await store.regenerateFingerprint(id);
    await prepareEmbeddedWebviewProfile(updated);
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
    await prepareEmbeddedWebviewProfile(profile);
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
    await prepareEmbeddedWebviewProfile(updated);
    return store.update(id, updated);
  });
  ipcMain.handle('embedded-webview:prepare', async (_event, profileId: string) => {
    await prepareEmbeddedWebviewProfile(await store.get(profileId));
  });
  ipcMain.handle('embedded-webview:navigation', (_event, profileId: string, tabId: string, input: EmbeddedWebviewNavigationInput) => (
    updateEmbeddedWebviewProfileNavigation(profileId, tabId, input)
  ));
  ipcMain.handle('embedded-webview:open-popup', async (_event, profileId: string, rawUrl: string) => {
    return openEmbeddedWebviewPopupAsTab(profileId, rawUrl);
  });
  ipcMain.handle('embedded-webview:validate-navigation', (_event, url: string) => embeddedNavigationDecisionForUrl(url));
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
    if (shouldIgnoreStaleNativeBrowserBounds(bounds)) {
      return;
    }
    const profile = await store.get(profileId);
    const host = currentNativeBrowserHost(mainWindow);
    if (!host) {
      return;
    }
    await nativeBrowserController.show(host, profile, tabId, url, bounds);
    resetNativeBrowserZoom();
  });
  ipcMain.handle('native-browser:resize', (_event, bounds: BrowserViewBounds) => {
    if (shouldIgnoreStaleNativeBrowserBounds(bounds)) {
      return;
    }
    nativeBrowserController.resize(bounds);
    resetNativeBrowserZoom();
  });
  ipcMain.handle('native-browser:hide', () => {
    if (nativeBrowserMetadataTimer) {
      clearTimeout(nativeBrowserMetadataTimer);
      nativeBrowserMetadataTimer = undefined;
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
  ipcMain.handle('downloads:list', (_event, profileId?: string) => downloadController.list(profileId));
  ipcMain.handle('downloads:cancel', (_event, id: string) => {
    const cancelled = downloadController.cancel(id);
    notifyProfilesChanged();
    return cancelled;
  });
  ipcMain.handle('downloads:show-in-folder', (_event, id: string) => {
    const savePath = downloadController.showInFolderPath(id);
    if (!savePath) {
      return false;
    }
    shell.showItemInFolder(savePath);
    return true;
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
    startupWarning,
  }));
  ipcMain.handle('settings:update', async (_event, input: AppSettings) => {
    const settings = await settingsStore.update(input);
    const chromiumPath = settings.chromiumPath || findChromiumPath();
    nativeBrowserZoomFactor = normalizeBrowserZoomFactor(settings.browserZoomFactor);
    launcher = chromiumPath ? new BrowserLauncher(chromiumPath, extensionDir) : undefined;
    resetNativeBrowserZoom();
    return settings;
  });
}

async function configureEmbeddedSession(profile: BrowserProfile): Promise<void> {
  if (process.env.ELECTRON_BROWSER_SMOKE === '1') {
    console.log('ELECTRON_BROWSER_SMOKE_STEP configure session');
  }
  const partition = `persist:profile-${profile.id}`;
  const profileSession = session.fromPartition(partition);
  await writeEmbeddedFingerprintPreload(profile);
  await configureProfileSession(profileSession, profile);
  attachProfileDownloadHandlers(profileSession, profile.id, partition);
  if (process.env.ELECTRON_BROWSER_SMOKE === '1') {
    console.log('ELECTRON_BROWSER_SMOKE_STEP configured session');
  }
}

function attachProfileDownloadHandlers(profileSession: Session, profileId: string, partition: string): void {
  if (downloadSessionPartitions.has(partition)) {
    return;
  }
  downloadSessionPartitions.add(partition);
  profileSession.on('will-download', (_event, item) => {
    const filename = item.getFilename();
    const savePath = item.getSavePath() || join(app.getPath('downloads'), filename);
    item.setSavePath(savePath);
    const id = downloadController.start({
      profileId,
      tabId: nativeBrowserController.currentTabId(),
      url: item.getURL(),
      filename,
      savePath,
      totalBytes: item.getTotalBytes(),
      cancel: () => item.cancel(),
    });
    notifyProfilesChanged();
    item.on('updated', (_updatedEvent, state) => {
      downloadController.updateProgress(id, {
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
      });
      if (state === 'interrupted') {
        downloadController.finish(id, 'interrupted');
      }
      notifyProfilesChanged();
    });
    item.once('done', (_doneEvent, state) => {
      downloadController.updateProgress(id, {
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
      });
      downloadController.finish(id, state === 'completed' ? 'completed' : state === 'cancelled' ? 'cancelled' : 'interrupted', state);
      notifyProfilesChanged();
    });
  });
}

async function applyNativeBrowserFingerprint(nativeBrowserView: NativeBrowserViewLike, profile: BrowserProfile): Promise<void> {
  if (!nativeBrowserView || nativeBrowserView.webContents.isDestroyed()) {
    return;
  }
  const debuggee = electronWebContents(nativeBrowserView).debugger;
  if (!debuggee.isAttached()) {
    debuggee.attach('1.3');
  }
  for (const command of buildEmbeddedCdpSetupCommands(profile)) {
    await debuggee.sendCommand(command.method, command.params);
  }
}

async function applyNativeBrowserFingerprintWithTimeout(nativeBrowserView: NativeBrowserViewLike, profile: BrowserProfile): Promise<void> {
  try {
    await withTimeout(applyNativeBrowserFingerprint(nativeBrowserView, profile), 3000, 'apply native browser fingerprint');
  } catch (error) {
    console.error(`cdp degraded for ${profile.id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function currentNativeBrowserView(): NativeBrowserViewLike | undefined {
  return nativeBrowserController.currentView();
}

function currentNativeBrowserHost(window = mainWindow): NativeBrowserHost | undefined {
  if (!window) {
    return undefined;
  }
  return currentBrowserPageViewMode() === 'web-contents-view'
    ? new WebContentsViewPageHost(window)
    : new BrowserViewPageHost(window);
}

function attachNativeBrowserProxyAuth(view: NativeBrowserViewLike | BrowserWindow, profile: BrowserProfile): void {
  const contents = view instanceof BrowserWindow ? view.webContents : electronWebContents(view);
  contents.on(
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
  extensionDir = join(app.getAppPath(), 'fingerprint-extension');
  store = new ProfileStore(appDataDir);
  await store.reconcileRuntimeState().catch((error: unknown) => {
    startupWarning = `Profile startup recovery failed: ${error instanceof Error ? error.message : String(error)}`;
    console.error(startupWarning);
  });
  settingsStore = new SettingsStore(appDataDir);
  const settings = await settingsStore.get();
  nativeBrowserZoomFactor = normalizeBrowserZoomFactor(settings.browserZoomFactor);
  const chromiumPath = settings.chromiumPath || findChromiumPath();
  launcher = chromiumPath ? new BrowserLauncher(chromiumPath, extensionDir) : undefined;
  registerIpc();
  createTray();
  createWindow();
  if (process.env.ELECTRON_BROWSER_SMOKE === '1') {
    mainWindow?.webContents.once('did-finish-load', () => {
      void runElectronBrowserSmoke()
        .then((result) => {
          console.log(`ELECTRON_BROWSER_SMOKE_RESULT ${JSON.stringify(result)}`);
          isQuitting = true;
          app.quit();
        })
        .catch((error: unknown) => {
          console.error(`ELECTRON_BROWSER_SMOKE_ERROR ${error instanceof Error ? error.message : String(error)}`);
          isQuitting = true;
          app.exit(1);
        });
    });
  } else if (process.env.ELECTRON_DOM_WEBVIEW_SMOKE === '1') {
    mainWindow?.webContents.once('did-finish-load', () => {
      void runElectronDomWebviewSmoke()
        .then((result) => {
          console.log(`ELECTRON_BROWSER_SMOKE_RESULT ${JSON.stringify(result)}`);
          isQuitting = true;
          app.quit();
        })
        .catch((error: unknown) => {
          console.error(`ELECTRON_BROWSER_SMOKE_ERROR ${error instanceof Error ? error.message : String(error)}`);
          isQuitting = true;
          app.exit(1);
        });
    });
  }

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
